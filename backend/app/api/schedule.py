from datetime import datetime
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import CalendarEvent, Context, Task, TaskStatus, Preference, User
from app.core.scheduler import generate_schedule_suggestions
from app.services import google_calendar_service as gcs

router = APIRouter(prefix="/schedule", tags=["schedule"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _load_context_map(user_id, session: Session) -> dict[str, Context]:
    contexts = list(session.exec(select(Context).where(Context.user_id == user_id)))
    return {c.name: c for c in contexts}


def _push_scheduled_tasks(tasks: list[Task], session: Session) -> None:
    """Push all scheduled tasks to Google Calendar if the user has credentials."""
    if not tasks:
        return
    cred = gcs.get_user_credential(tasks[0].user_id, session)
    if not cred:
        return
    for task in tasks:
        event_id = gcs.push_task_event(task, cred)
        if event_id:
            task.google_event_id = event_id
            session.add(task)


@router.get("/suggestions")
def get_schedule_suggestions(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
):
    unscheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.UNSCHEDULED, Task.user_id == current_user.id)
    ))

    scheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.SCHEDULED, Task.user_id == current_user.id)
    ))

    calendar_events = list(session.exec(
        select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)
    ))

    preferences = session.exec(
        select(Preference).where(Preference.user_id == current_user.id)
    ).first()
    if not preferences:
        preferences = Preference()

    context_map = _load_context_map(current_user.id, session)
    suggestions = generate_schedule_suggestions(
        unscheduled, scheduled, calendar_events, preferences, context_map=context_map
    )

    return {
        "unscheduled_count": len(unscheduled),
        "suggestions": suggestions,
    }


@router.post("/apply")
def apply_schedule(
    suggestion_index: int,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
):
    unscheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.UNSCHEDULED, Task.user_id == current_user.id)
    ))

    scheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.SCHEDULED, Task.user_id == current_user.id)
    ))

    calendar_events = list(session.exec(
        select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)
    ))

    preferences = session.exec(
        select(Preference).where(Preference.user_id == current_user.id)
    ).first()
    if not preferences:
        preferences = Preference()

    context_map = _load_context_map(current_user.id, session)
    suggestions = generate_schedule_suggestions(
        unscheduled, scheduled, calendar_events, preferences, context_map=context_map
    )

    if suggestion_index >= len(suggestions):
        return {"error": "Invalid suggestion index"}

    suggestion = suggestions[suggestion_index]
    applied_count = 0
    newly_scheduled: list[Task] = []

    for task_id_str, placement in suggestion["placements"].items():
        task_id = UUID(task_id_str)
        task = session.get(Task, task_id)
        if task and task.user_id == current_user.id:
            task.status = TaskStatus.SCHEDULED
            task.scheduled_start_at = datetime.fromisoformat(placement["start"])
            task.scheduled_end_at = datetime.fromisoformat(placement["end"])
            session.add(task)
            newly_scheduled.append(task)
            applied_count += 1

    _push_scheduled_tasks(newly_scheduled, session)
    session.commit()
    return {
        "applied": applied_count,
        "suggestion_name": suggestion["name"],
        "message": f"Applied {applied_count} tasks using '{suggestion['name']}' strategy"
    }


@router.post("/auto")
def auto_schedule_tasks(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
):
    unscheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.UNSCHEDULED, Task.user_id == current_user.id)
    ))

    if not unscheduled:
        return {"scheduled": 0, "message": "No unscheduled tasks found."}

    scheduled = list(session.exec(
        select(Task).where(Task.status == TaskStatus.SCHEDULED, Task.user_id == current_user.id)
    ))

    calendar_events = list(session.exec(
        select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)
    ))

    preferences = session.exec(
        select(Preference).where(Preference.user_id == current_user.id)
    ).first()
    if not preferences:
        preferences = Preference()

    context_map = _load_context_map(current_user.id, session)
    suggestions = generate_schedule_suggestions(
        unscheduled, scheduled, calendar_events, preferences, context_map=context_map
    )

    if not suggestions:
        return {"scheduled": 0, "message": "Could not generate any schedule suggestions."}

    suggestion = suggestions[0]
    applied_count = 0
    newly_scheduled: list[Task] = []

    for task_id_str, placement in suggestion["placements"].items():
        task_id = UUID(task_id_str)
        task = session.get(Task, task_id)
        if task and task.user_id == current_user.id:
            task.status = TaskStatus.SCHEDULED
            task.scheduled_start_at = datetime.fromisoformat(placement["start"])
            task.scheduled_end_at = datetime.fromisoformat(placement["end"])
            session.add(task)
            newly_scheduled.append(task)
            applied_count += 1

    _push_scheduled_tasks(newly_scheduled, session)
    session.commit()
    return {
        "scheduled": applied_count,
        "strategy": suggestion["name"],
        "message": f"Successfully auto-scheduled {applied_count} tasks using {suggestion['name']} strategy"
    }
