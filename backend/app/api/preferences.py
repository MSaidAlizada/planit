from typing import Iterator

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Preference, User

router = APIRouter(prefix="/preferences", tags=["preferences"])


def session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


@router.get("", response_model=Preference)
def get_preferences(
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Preference:
    prefs = session.exec(select(Preference).where(Preference.user_id == current_user.id)).first()
    if not prefs:
        prefs = Preference(user_id=current_user.id)
        session.add(prefs)
        session.commit()
        session.refresh(prefs)
    return prefs


@router.patch("", response_model=Preference)
def update_preferences(
    payload: dict,
    session: Session = Depends(session_dep),
    current_user: User = Depends(get_current_user),
) -> Preference:
    prefs = session.exec(select(Preference).where(Preference.user_id == current_user.id)).first()
    if not prefs:
        prefs = Preference(user_id=current_user.id)
        session.add(prefs)

    for key, value in payload.items():
        if hasattr(prefs, key) and key != "user_id":
            setattr(prefs, key, value)

    session.add(prefs)
    session.commit()
    session.refresh(prefs)
    return prefs
