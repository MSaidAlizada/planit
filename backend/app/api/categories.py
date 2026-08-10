from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Category, Task, User
from app.schemas import CategoryCreate, CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


@router.get("", response_model=list[CategoryRead])
def list_categories(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> list[Category]:
    return list(session.exec(
        select(Category).where(Category.user_id == current_user.id).order_by(Category.created_at.desc())
    ))


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Category:
    existing = session.exec(
        select(Category).where(Category.name == payload.name.strip(), Category.user_id == current_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")

    category = Category(name=payload.name.strip(), color=payload.color, user_id=current_user.id)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}")
def delete_category(
    category_id: UUID,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    category = session.get(Category, category_id)
    if category is None or category.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    tasks = list(session.exec(
        select(Task).where(Task.category_name == category.name, Task.user_id == current_user.id)
    ))
    for task in tasks:
        task.category_name = None
        task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(task)

    session.delete(category)
    session.commit()
    return {"message": "Category deleted", "uncategorized_tasks": len(tasks)}
