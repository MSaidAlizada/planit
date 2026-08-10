"""Fetch and parse iCal feeds into CalendarEvent records."""
from __future__ import annotations

import ipaddress
import socket
from datetime import date, datetime, timezone, timedelta
from typing import Iterator
from urllib.parse import urlparse
from uuid import UUID

import httpx
from icalendar import Calendar, Event as ICalEvent
from sqlmodel import Session, select

from app.models import CalendarEvent, CalendarFeed

# Private/link-local ranges that should never be reachable from user-supplied URLs (SSRF).
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def validate_feed_url(url: str) -> None:
    """Raise ValueError if the URL is not a safe public http/https address."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http:// and https:// URLs are supported")
    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("Invalid URL: missing hostname")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        if any(ip in net for net in _BLOCKED_NETWORKS):
            raise ValueError("URLs pointing to private or internal addresses are not allowed")
    except ValueError:
        raise
    except Exception:
        # DNS failure — block it to be safe
        raise ValueError(f"Could not resolve hostname: {hostname}")


# Import events within this window relative to now
_PAST_DAYS   = 30
_FUTURE_DAYS = 180


def _to_naive_utc(value) -> datetime | None:
    """Convert any icalendar date/datetime value to a naive UTC datetime."""
    if value is None:
        return None
    # icalendar wraps values in vDDDTypes — unwrap if needed
    dt = value.dt if hasattr(value, "dt") else value

    if isinstance(dt, datetime):
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    if isinstance(dt, date):
        # All-day event: treat as midnight UTC
        return datetime(dt.year, dt.month, dt.day, 0, 0, 0)
    return None


def _iter_events(raw_ical: bytes) -> Iterator[dict]:
    """Yield dicts for each VEVENT in the iCal data."""
    cal = Calendar.from_ical(raw_ical)
    now        = datetime.now(timezone.utc).replace(tzinfo=None)
    range_from = now - timedelta(days=_PAST_DAYS)
    range_to   = now + timedelta(days=_FUTURE_DAYS)

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        start = _to_naive_utc(component.get("DTSTART"))
        end   = _to_naive_utc(component.get("DTEND") or component.get("DTSTART"))
        if start is None:
            continue

        # Skip events outside the import window
        if start > range_to or end < range_from:
            continue

        uid     = str(component.get("UID", ""))
        summary = str(component.get("SUMMARY", "(no title)"))

        yield {
            "external_id": uid,
            "title":       summary,
            "start_at":    start,
            "end_at":      end,
            "is_busy":     True,
            "is_imported": True,
        }


def fetch_raw(url: str, timeout: int = 20) -> bytes:
    """Download raw iCal bytes from a URL. Raises ValueError for unsafe URLs."""
    validate_feed_url(url)
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        response = client.get(url)
        response.raise_for_status()
    return response.content


def sync_feed(feed: CalendarFeed, session: Session) -> int:
    """
    Fetch the feed URL, parse events, and upsert them into CalendarEvent.
    Returns the number of events stored.
    Source tag format: ``ical:<feed_id>``
    """
    raw        = fetch_raw(feed.url)
    source_tag = f"ical:{feed.id}"

    # Delete all previously imported events for this feed
    old_filter = [CalendarEvent.source_calendar == source_tag]
    if feed.user_id:
        old_filter.append(CalendarEvent.user_id == feed.user_id)
    old_events = session.exec(select(CalendarEvent).where(*old_filter)).all()
    for ev in old_events:
        session.delete(ev)

    # Insert fresh events
    count = 0
    for ev_data in _iter_events(raw):
        event = CalendarEvent(
            external_id    = ev_data["external_id"] or None,
            title          = ev_data["title"],
            start_at       = ev_data["start_at"],
            end_at         = ev_data["end_at"],
            source_calendar= source_tag,
            is_busy        = True,
            is_imported    = True,
            user_id        = feed.user_id,
        )
        session.add(event)
        count += 1

    return count
