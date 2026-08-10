from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.core.habits import compute_habit_metrics, expand_occurrences
from app.db import get_session
from app.models import Habit, HabitCompletion, User
from app.schemas import HabitCompletionRead, HabitCreate, HabitRead, HabitUpdate

router = APIRouter(prefix="/habits", tags=["habits"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _serialize_habit(habit: Habit, completions: list[HabitCompletion]) -> dict:
    metrics = compute_habit_metrics(habit, completions)
    return {
        "id": habit.id,
        "title": habit.title,
        "duration_minutes": habit.duration_minutes,
        "mental_load": habit.mental_load,
        "recurrence_rule": habit.recurrence_rule,
        "is_active": habit.is_active,
        "created_at": habit.created_at,
        **metrics,
    }


@router.get("/heatmap")
def get_heatmap(
    year: int | None = None,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return per-day completion ratio for the given year (defaults to current year)."""
    from datetime import date, time, timedelta

    today = datetime.now(timezone.utc).date()
    if year is None:
        year = today.year

    start_date = date(year, 1, 1)
    end_date   = date(year, 12, 31)
    if end_date > today:
        end_date = today

    habits = list(session.exec(
        select(Habit).where(Habit.user_id == current_user.id, Habit.is_active == True)  # noqa: E712
    ))

    due_by_date: dict[date, set] = {}
    for habit in habits:
        for d in expand_occurrences(habit, start_date, end_date):
            due_by_date.setdefault(d, set()).add(str(habit.id))

    completions = list(session.exec(
        select(HabitCompletion).where(
            HabitCompletion.user_id == current_user.id,
            HabitCompletion.completed_at >= datetime.combine(start_date, time.min),
            HabitCompletion.completed_at <= datetime.combine(end_date, time.max),
        )
    ))
    completed_by_date: dict[date, set] = {}
    for c in completions:
        completed_by_date.setdefault(c.completed_at.date(), set()).add(str(c.habit_id))

    result = []
    current = start_date
    while current <= end_date:
        due       = due_by_date.get(current, set())
        completed = completed_by_date.get(current, set()) & due
        n_due       = len(due)
        n_completed = len(completed)
        result.append({
            "date":      current.isoformat(),
            "completed": n_completed,
            "due":       n_due,
            "ratio":     n_completed / n_due if n_due > 0 else 0,
        })
        current += timedelta(days=1)
    return result


@router.get("/occurrences")
def list_habit_occurrences(
    start: str,
    end: str,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return all habit occurrence dates within the given range (YYYY-MM-DD)."""
    from datetime import date as date_type
    start_date = date_type.fromisoformat(start)
    end_date   = date_type.fromisoformat(end)

    habits = list(session.exec(
        select(Habit).where(Habit.user_id == current_user.id, Habit.is_active == True)  # noqa: E712
    ))

    result = []
    for habit in habits:
        for d in expand_occurrences(habit, start_date, end_date):
            result.append({
                "habit_id":         str(habit.id),
                "title":            habit.title,
                "date":             d.isoformat(),
                "duration_minutes": habit.duration_minutes,
                "mental_load":      habit.mental_load,
            })
    return result


@router.get("", response_model=list[HabitRead])
def list_habits(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    habits = list(session.exec(
        select(Habit).where(Habit.user_id == current_user.id).order_by(Habit.created_at.desc())
    ))
    completions = list(session.exec(
        select(HabitCompletion)
        .where(HabitCompletion.user_id == current_user.id)
        .order_by(HabitCompletion.completed_at.asc())
    ))

    by_habit: dict[UUID, list[HabitCompletion]] = {}
    for completion in completions:
        by_habit.setdefault(completion.habit_id, []).append(completion)

    return [_serialize_habit(habit, by_habit.get(habit.id, [])) for habit in habits]


@router.post("", response_model=HabitRead, status_code=status.HTTP_201_CREATED)
def create_habit(
    payload: HabitCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    habit = Habit.model_validate(payload)
    habit.user_id = current_user.id
    session.add(habit)
    session.commit()
    session.refresh(habit)
    return _serialize_habit(habit, [])


@router.patch("/{habit_id}", response_model=HabitRead)
def update_habit(
    habit_id: UUID,
    payload: HabitUpdate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    habit = session.get(Habit, habit_id)
    if habit is None or habit.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(habit, key, value)

    session.add(habit)
    session.commit()
    session.refresh(habit)

    completions = list(session.exec(
        select(HabitCompletion)
        .where(HabitCompletion.habit_id == habit.id, HabitCompletion.user_id == current_user.id)
        .order_by(HabitCompletion.completed_at.asc())
    ))
    return _serialize_habit(habit, completions)


@router.post("/{habit_id}/complete", response_model=HabitRead)
def complete_habit(
    habit_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    habit = session.get(Habit, habit_id)
    if habit is None or habit.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now.date()
    existing_completion = session.exec(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit.id,
            HabitCompletion.user_id == current_user.id,
            HabitCompletion.completed_at >= datetime.combine(today, datetime.min.time()),
            HabitCompletion.completed_at < datetime.combine(today, datetime.max.time()),
        )
    ).first()

    if existing_completion is None:
        session.add(HabitCompletion(habit_id=habit.id, user_id=current_user.id, completed_at=now))
        session.commit()

    completions = list(session.exec(
        select(HabitCompletion)
        .where(HabitCompletion.habit_id == habit.id, HabitCompletion.user_id == current_user.id)
        .order_by(HabitCompletion.completed_at.asc())
    ))
    return _serialize_habit(habit, completions)


@router.get("/{habit_id}/completions", response_model=list[HabitCompletionRead])
def list_habit_completions(
    habit_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[HabitCompletion]:
    habit = session.get(Habit, habit_id)
    if habit is None or habit.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    return list(session.exec(
        select(HabitCompletion)
        .where(HabitCompletion.habit_id == habit_id, HabitCompletion.user_id == current_user.id)
        .order_by(HabitCompletion.completed_at.desc())
    ))


@router.delete("/{habit_id}/complete", response_model=HabitRead)
def uncomplete_habit(
    habit_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    habit = session.get(Habit, habit_id)
    if habit is None or habit.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now.date()
    completion = session.exec(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit.id,
            HabitCompletion.user_id == current_user.id,
            HabitCompletion.completed_at >= datetime.combine(today, datetime.min.time()),
            HabitCompletion.completed_at < datetime.combine(today, datetime.max.time()),
        )
    ).first()

    if completion:
        session.delete(completion)
        session.commit()

    completions = list(session.exec(
        select(HabitCompletion)
        .where(HabitCompletion.habit_id == habit.id, HabitCompletion.user_id == current_user.id)
        .order_by(HabitCompletion.completed_at.asc())
    ))
    return _serialize_habit(habit, completions)


@router.delete("/{habit_id}")
def delete_habit(
    habit_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict:
    habit = session.get(Habit, habit_id)
    if habit is None or habit.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    completions = list(session.exec(
        select(HabitCompletion).where(HabitCompletion.habit_id == habit_id)
    ))
    for c in completions:
        session.delete(c)

    session.delete(habit)
    session.commit()
    return {"message": "Habit deleted", "deleted_completions": len(completions)}
