from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Subtask, Task, TaskStatus, User
from app.schemas import TaskCreate, TaskRead, TaskUpdate
from app.services import google_calendar_service as gcs

router = APIRouter(prefix="/tasks", tags=["tasks"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _push_google(task: Task, session: Session) -> None:
    """Push a scheduled task to Google Calendar if credentials exist. Updates task in-place."""
    if not task.user_id:
        return
    cred = gcs.get_user_credential(task.user_id, session)
    if not cred:
        return
    event_id = gcs.push_task_event(task, cred)
    if event_id:
        task.google_event_id = event_id


def _delete_google(task: Task, session: Session) -> None:
    """Delete a task's Google Calendar event if one exists."""
    if not task.google_event_id or not task.user_id:
        return
    cred = gcs.get_user_credential(task.user_id, session)
    if cred:
        gcs.delete_task_event(task.google_event_id, cred)
    task.google_event_id = None


def _inject_subtask_counts(tasks: list[Task], session: Session) -> list[TaskRead]:
    task_ids = [t.id for t in tasks]
    counts: dict = {t.id: [0, 0] for t in tasks}
    if task_ids:
        for sub in session.exec(select(Subtask).where(Subtask.task_id.in_(task_ids))):
            counts[sub.task_id][0] += 1
            if sub.is_completed:
                counts[sub.task_id][1] += 1
    result = []
    for task in tasks:
        tr = TaskRead.model_validate(task.model_dump())
        tr.subtask_count = counts[task.id][0]
        tr.completed_subtask_count = counts[task.id][1]
        result.append(tr)
    return result


@router.get("", response_model=list[TaskRead])
def list_tasks(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    tasks = list(session.exec(
        select(Task).where(Task.user_id == current_user.id).order_by(Task.created_at.desc())
    ))
    return _inject_subtask_counts(tasks, session)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = Task.model_validate(payload)
    task.user_id = current_user.id
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return _inject_subtask_counts([task], session)[0]


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(task, key, value)

    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/{task_id}/complete", response_model=TaskRead)
def mark_task_complete(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _delete_google(task, session)
    task.status = TaskStatus.COMPLETED
    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/{task_id}/skip", response_model=TaskRead)
def skip_task(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _delete_google(task, session)
    task.status = TaskStatus.SKIPPED
    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/{task_id}/reschedule", response_model=TaskRead)
def reschedule_task(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _delete_google(task, session)
    task.status = TaskStatus.UNSCHEDULED
    task.scheduled_start_at = None
    task.scheduled_end_at = None
    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/{task_id}/pin", response_model=TaskRead)
def pin_task(
    task_id: UUID,
    payload: TaskUpdate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if payload.scheduled_start_at is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="scheduled_start_at is required")

    from datetime import timedelta
    start = payload.scheduled_start_at
    end   = start + timedelta(minutes=task.duration_minutes)

    task.scheduled_start_at = start
    task.scheduled_end_at   = end
    task.status             = TaskStatus.SCHEDULED
    task.updated_at         = datetime.now(timezone.utc).replace(tzinfo=None)

    _push_google(task, session)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/clear-completed")
def clear_completed_tasks(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict[str, int | str]:
    completed_tasks = list(session.exec(
        select(Task).where(Task.status == TaskStatus.COMPLETED, Task.user_id == current_user.id)
    ))
    cleared = len(completed_tasks)
    for task in completed_tasks:
        session.delete(task)
    session.commit()
    return {"cleared": cleared, "message": f"Cleared {cleared} completed task(s)."}


@router.delete("/{task_id}")
def delete_task(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    task = session.get(Task, task_id)
    if task is None or task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    _delete_google(task, session)
    for sub in session.exec(select(Subtask).where(Subtask.task_id == task_id)):
        session.delete(sub)
    session.delete(task)
    session.commit()
    return {"message": "Task deleted"}
