from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Context, Task, User
from app.schemas import ContextCreate, ContextRead

router = APIRouter(prefix="/contexts", tags=["contexts"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


@router.get("", response_model=list[ContextRead])
def list_contexts(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[Context]:
    return list(session.exec(
        select(Context).where(Context.user_id == current_user.id).order_by(Context.created_at.desc())
    ))


@router.post("", response_model=ContextRead, status_code=status.HTTP_201_CREATED)
def create_context(
    payload: ContextCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Context:
    existing = session.exec(
        select(Context).where(Context.name == payload.name.strip(), Context.user_id == current_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Context already exists")

    ctx = Context(
        name=payload.name.strip(),
        color=payload.color,
        availability=payload.availability,
        user_id=current_user.id,
    )
    session.add(ctx)
    session.commit()
    session.refresh(ctx)
    return ctx


@router.patch("/{context_id}", response_model=ContextRead)
def update_context(
    context_id: UUID,
    payload: ContextCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Context:
    ctx = session.get(Context, context_id)
    if ctx is None or ctx.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Context not found")

    ctx.name = payload.name.strip()
    ctx.color = payload.color
    ctx.availability = payload.availability
    session.add(ctx)
    session.commit()
    session.refresh(ctx)
    return ctx


@router.delete("/{context_id}")
def delete_context(
    context_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    ctx = session.get(Context, context_id)
    if ctx is None or ctx.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Context not found")

    tasks = list(session.exec(
        select(Task).where(Task.context_name == ctx.name, Task.user_id == current_user.id)
    ))
    for task in tasks:
        task.context_name = None
        task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(task)

    session.delete(ctx)
    session.commit()
    return {"message": "Context deleted", "untagged_tasks": len(tasks)}
