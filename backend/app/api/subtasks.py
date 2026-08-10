from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Subtask, Task, TaskStatus, User
from app.schemas import SubtaskCreate, SubtaskRead, SubtaskUpdate

router = APIRouter(prefix="/tasks", tags=["subtasks"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _get_task_or_404(task_id: UUID, user: User, session: Session) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("/{task_id}/subtasks", response_model=list[SubtaskRead])
def list_subtasks(
    task_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[Subtask]:
    _get_task_or_404(task_id, current_user, session)
    return list(session.exec(
        select(Subtask).where(Subtask.task_id == task_id).order_by(Subtask.position, Subtask.created_at)
    ))


@router.post("/{task_id}/subtasks", response_model=SubtaskRead, status_code=status.HTTP_201_CREATED)
def create_subtask(
    task_id: UUID,
    payload: SubtaskCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Subtask:
    _get_task_or_404(task_id, current_user, session)
    subtask = Subtask(task_id=task_id, **payload.model_dump())
    session.add(subtask)
    session.commit()
    session.refresh(subtask)
    return subtask


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=SubtaskRead)
def update_subtask(
    task_id: UUID,
    subtask_id: UUID,
    payload: SubtaskUpdate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Subtask:
    task = _get_task_or_404(task_id, current_user, session)
    subtask = session.get(Subtask, subtask_id)
    if subtask is None or subtask.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subtask, key, value)
    session.add(subtask)
    session.commit()
    session.refresh(subtask)

    # Auto-complete parent task when all subtasks are checked
    subtasks = list(session.exec(select(Subtask).where(Subtask.task_id == task_id)))
    if subtasks and all(s.is_completed for s in subtasks) and task.status != TaskStatus.COMPLETED:
        task.status = TaskStatus.COMPLETED
        task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(task)
        session.commit()

    return subtask


@router.delete("/{task_id}/subtasks/{subtask_id}")
def delete_subtask(
    task_id: UUID,
    subtask_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    _get_task_or_404(task_id, current_user, session)
    subtask = session.get(Subtask, subtask_id)
    if subtask is None or subtask.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    session.delete(subtask)
    session.commit()
    return {"message": "Subtask deleted"}
