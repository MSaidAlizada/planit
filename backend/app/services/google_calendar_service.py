"""Google Calendar OAuth flow, event sync, and task write-back."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Iterator

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlmodel import Session, select

from app.core.config import settings
from app.models import CalendarEvent, GoogleCredential

# Allow OAuth over plain HTTP only in development (never in production).
if os.getenv("ENVIRONMENT", "development") != "production":
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

logger = logging.getLogger(__name__)

# calendar.events grants read + write access to events (not calendar settings).
SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

_PAST_DAYS   = 30
_FUTURE_DAYS = 180

# Maps OAuth state → (code_verifier, user_id) for PKCE exchange + user association.
# In-memory is fine for a single-process self-hosted app.
_pending_verifiers: dict[str, str] = {}
_pending_user_ids:  dict[str, str] = {}


# ── OAuth flow helpers ────────────────────────────────────────────────────

def _client_config() -> dict:
    return {
        "web": {
            "client_id":     settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def create_auth_url(user_id: str | None = None) -> tuple[str, str]:
    """Return (authorization_url, state) for the Google OAuth consent screen."""
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    if flow.code_verifier:
        _pending_verifiers[state] = flow.code_verifier
    if user_id:
        _pending_user_ids[state] = user_id
    return url, state


def pop_user_id_for_state(state: str) -> str | None:
    return _pending_user_ids.pop(state, None)


def exchange_code(code: str, state: str) -> GoogleCredential:
    """Exchange an authorization code for tokens and return a GoogleCredential."""
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        # Disable auto-generation — we supply the stored verifier manually.
        autogenerate_code_verifier=False,
    )
    code_verifier = _pending_verifiers.pop(state, None)
    flow.fetch_token(code=code, code_verifier=code_verifier)
    creds = flow.credentials

    expiry = creds.expiry
    if expiry and expiry.tzinfo is not None:
        expiry = expiry.replace(tzinfo=None)

    email = _get_email(creds)
    return GoogleCredential(
        email         = email,
        access_token  = creds.token,
        refresh_token = creds.refresh_token or "",
        token_expiry  = expiry,
    )


def _get_email(creds: Credentials) -> str:
    try:
        service = build("oauth2", "v2", credentials=creds)
        info    = service.userinfo().get().execute()
        return info.get("email", "")
    except Exception:
        return ""


# ── Token refresh ─────────────────────────────────────────────────────────

def _refreshed_creds(credential: GoogleCredential) -> Credentials:
    """Return a Credentials object, refreshing the access token if needed."""
    # token_expiry is stored as naive UTC in the DB.
    # google.auth._helpers.utcnow() also returns naive UTC, so keep it naive
    # here to avoid an offset-naive vs offset-aware comparison in creds.expired.
    expiry = credential.token_expiry

    creds = Credentials(
        token         = credential.access_token,
        refresh_token = credential.refresh_token or None,
        expiry        = expiry,
        token_uri     = "https://oauth2.googleapis.com/token",
        client_id     = settings.google_client_id,
        client_secret = settings.google_client_secret,
        scopes        = SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


# ── Event sync ───────────────────────────────────────────────────────────

def _to_naive_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def _iter_google_events(creds: Credentials) -> Iterator[dict]:
    service  = build("calendar", "v3", credentials=creds)
    now      = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=_PAST_DAYS)).isoformat()
    time_max = (now + timedelta(days=_FUTURE_DAYS)).isoformat()

    page_token = None
    while True:
        result = service.events().list(
            calendarId      = "primary",
            timeMin         = time_min,
            timeMax         = time_max,
            singleEvents    = True,
            orderBy         = "startTime",
            pageToken       = page_token,
            maxResults      = 500,
        ).execute()

        for item in result.get("items", []):
            start_raw = item.get("start", {})
            end_raw   = item.get("end",   {})

            # All-day events use "date", timed events use "dateTime"
            start_str = start_raw.get("dateTime") or (start_raw.get("date", "") + "T00:00:00Z")
            end_str   = end_raw.get("dateTime")   or (end_raw.get("date",   "") + "T00:00:00Z")

            start = _to_naive_utc(start_str)
            end   = _to_naive_utc(end_str)
            if not start or not end:
                continue

            yield {
                "external_id": item.get("id", ""),
                "title":       item.get("summary", "(no title)"),
                "start_at":    start,
                "end_at":      end,
            }

        page_token = result.get("nextPageToken")
        if not page_token:
            break


def sync_google_events(credential: GoogleCredential, session: Session) -> tuple[int, GoogleCredential]:
    """
    Pull events from Google Calendar and upsert into CalendarEvent.
    Returns (event_count, updated_credential).
    """
    creds = _refreshed_creds(credential)

    # Persist refreshed token if it changed
    if creds.token != credential.access_token:
        credential.access_token = creds.token
        expiry = creds.expiry
        if expiry and expiry.tzinfo is not None:
            expiry = expiry.replace(tzinfo=None)
        credential.token_expiry = expiry
        credential.updated_at   = datetime.now(timezone.utc).replace(tzinfo=None)

    # Replace this user's Google-sourced events
    old_filter = [CalendarEvent.source_calendar == "google"]
    if credential.user_id:
        old_filter.append(CalendarEvent.user_id == credential.user_id)
    old = session.exec(select(CalendarEvent).where(*old_filter)).all()
    for ev in old:
        session.delete(ev)

    count = 0
    for ev_data in _iter_google_events(creds):
        event = CalendarEvent(
            external_id    = ev_data["external_id"] or None,
            title          = ev_data["title"],
            start_at       = ev_data["start_at"],
            end_at         = ev_data["end_at"],
            source_calendar= "google",
            is_busy        = True,
            is_imported    = True,
            user_id        = credential.user_id,
        )
        session.add(event)
        count += 1

    return count, credential


# ── Task write-back ───────────────────────────────────────────────────────

def get_user_credential(user_id, session: Session) -> GoogleCredential | None:
    return session.exec(select(GoogleCredential).where(GoogleCredential.user_id == user_id)).first()


def push_task_event(task, credential: GoogleCredential) -> str | None:
    """Create or update a Google Calendar event for a scheduled task. Returns event_id or None."""
    if not task.scheduled_start_at or not task.scheduled_end_at:
        return None
    try:
        creds = _refreshed_creds(credential)
        service = build("calendar", "v3", credentials=creds)
        body = {
            "summary": task.title,
            "description": task.description or "",
            "start": {"dateTime": task.scheduled_start_at.isoformat() + "Z", "timeZone": "UTC"},
            "end":   {"dateTime": task.scheduled_end_at.isoformat()   + "Z", "timeZone": "UTC"},
        }
        if task.google_event_id:
            result = service.events().update(
                calendarId="primary", eventId=task.google_event_id, body=body
            ).execute()
        else:
            result = service.events().insert(calendarId="primary", body=body).execute()
        return result.get("id")
    except Exception:
        logger.exception("Failed to push task %s to Google Calendar", getattr(task, "id", "?"))
        return None


def delete_task_event(google_event_id: str, credential: GoogleCredential) -> None:
    """Delete a Google Calendar event. Silently ignores 404/errors."""
    if not google_event_id:
        return
    try:
        creds = _refreshed_creds(credential)
        service = build("calendar", "v3", credentials=creds)
        service.events().delete(calendarId="primary", eventId=google_event_id).execute()
    except Exception:
        pass
