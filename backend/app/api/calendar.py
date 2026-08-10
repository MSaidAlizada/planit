from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, status, HTTPException
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import CalendarEvent, User
from app.schemas import CalendarEventCreate, CalendarEventRead

router = APIRouter(prefix="/calendar", tags=["calendar"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


@router.get("", response_model=list[CalendarEventRead])
def list_events(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[CalendarEvent]:
    statement = select(CalendarEvent).where(CalendarEvent.user_id == current_user.id).order_by(CalendarEvent.start_at)
    return list(session.exec(statement))


@router.post("", response_model=CalendarEventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    event: CalendarEventCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> CalendarEvent:
    cal_event = CalendarEvent.model_validate(event)
    cal_event.user_id = current_user.id
    session.add(cal_event)
    session.commit()
    session.refresh(cal_event)
    return cal_event


@router.delete("/{event_id}")
def delete_event(
    event_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    evt = session.get(CalendarEvent, event_id)
    if evt is None or evt.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    session.delete(evt)
    session.commit()
    return {"message": "Event deleted"}
