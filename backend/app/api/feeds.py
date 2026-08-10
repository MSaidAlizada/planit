"""iCal feed management — add, list, sync, delete calendar feeds."""
import logging
from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import CalendarFeed, User
from app.services.ical_service import sync_feed, validate_feed_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feeds", tags=["feeds"])


def _session() -> Iterator[Session]:
    with get_session() as session:
        yield session


class FeedCreate(BaseModel):
    name: str
    url:  str


class FeedRead(BaseModel):
    id:             UUID
    name:           str
    url:            str
    last_synced_at: datetime | None
    event_count:    int
    is_active:      bool
    created_at:     datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[FeedRead])
def list_feeds(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> list[CalendarFeed]:
    return list(session.exec(
        select(CalendarFeed).where(CalendarFeed.user_id == current_user.id).order_by(CalendarFeed.created_at)
    ))


@router.post("", response_model=FeedRead, status_code=status.HTTP_201_CREATED)
def add_feed(
    payload: FeedCreate,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> CalendarFeed:
    try:
        validate_feed_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    feed = CalendarFeed(name=payload.name, url=payload.url, user_id=current_user.id)
    session.add(feed)
    session.commit()
    session.refresh(feed)
    return feed


@router.post("/{feed_id}/sync", response_model=FeedRead)
def sync_one_feed(
    feed_id: UUID,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> CalendarFeed:
    feed = session.get(CalendarFeed, feed_id)
    if not feed or feed.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Feed not found")

    try:
        count = sync_feed(feed, session)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        logger.exception("Feed sync failed for feed %s", feed_id)
        raise HTTPException(status_code=400, detail="Feed sync failed. Check the URL is a valid iCal feed.")

    feed.event_count    = count
    feed.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(feed)
    session.commit()
    session.refresh(feed)
    return feed


@router.delete("/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feed(
    feed_id: UUID,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> None:
    from app.models import CalendarEvent

    feed = session.get(CalendarFeed, feed_id)
    if not feed or feed.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Feed not found")

    source_tag = f"ical:{feed_id}"
    old_events = session.exec(
        select(CalendarEvent).where(
            CalendarEvent.source_calendar == source_tag,
            CalendarEvent.user_id == current_user.id,
        )
    ).all()
    for ev in old_events:
        session.delete(ev)

    session.delete(feed)
    session.commit()
