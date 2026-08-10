"""Email digest — verification and settings."""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import get_session
from app.models import Preference, User

router = APIRouter(prefix="/digest", tags=["digest"])


def _session() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_or_create_prefs(user_id, session: Session) -> Preference:
    prefs = session.exec(select(Preference).where(Preference.user_id == user_id)).first()
    if not prefs:
        prefs = Preference(user_id=user_id)
        session.add(prefs)
        session.flush()
    return prefs


# ── Status ────────────────────────────────────────────────────────────────

@router.get("/status")
def get_status(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    prefs = _get_or_create_prefs(current_user.id, session)
    session.commit()
    return {
        "email": current_user.email,
        "email_verified": current_user.email_verified,
        "digest_enabled": prefs.digest_enabled,
        "digest_frequency": prefs.digest_frequency,
        "digest_time": prefs.digest_time,
        "digest_day": prefs.digest_day,
    }


# ── Email verification ─────────────────────────────────────────────────────

class SendCodePayload(BaseModel):
    email: str


@router.post("/send-code")
def send_code(
    payload: SendCodePayload,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not payload.email or "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    code = "".join(random.choices(string.digits, k=6))
    user.email = payload.email.strip().lower()
    user.email_verified = False
    user.email_verify_token = code
    user.email_verify_expires = _utcnow() + timedelta(minutes=15)
    session.add(user)
    session.commit()

    from app.services.email_service import send_verification_email
    send_verification_email(user.email, code)
    return {"message": "Verification code sent"}


class ConfirmCodePayload(BaseModel):
    code: str


@router.post("/confirm-code")
def confirm_code(
    payload: ConfirmCodePayload,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = _utcnow()
    token_ok = (
        user.email_verify_token
        and user.email_verify_token == payload.code.strip()
        and user.email_verify_expires
        and user.email_verify_expires > now
    )
    if not token_ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    user.email_verified = True
    user.email_verify_token = ""
    user.email_verify_expires = None
    session.add(user)
    session.commit()
    return {"message": "Email verified"}


# ── Digest settings ───────────────────────────────────────────────────────

class DigestSettingsPayload(BaseModel):
    digest_enabled: bool | None = None
    digest_frequency: str | None = None
    digest_time: str | None = None
    digest_day: int | None = None


@router.patch("/settings")
def update_settings(
    payload: DigestSettingsPayload,
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    prefs = _get_or_create_prefs(current_user.id, session)

    if payload.digest_enabled is not None:
        if payload.digest_enabled and not current_user.email_verified:
            raise HTTPException(status_code=400, detail="Verify your email before enabling the digest")
        prefs.digest_enabled = payload.digest_enabled

    if payload.digest_frequency is not None:
        if payload.digest_frequency not in ("daily", "weekly"):
            raise HTTPException(status_code=400, detail="frequency must be 'daily' or 'weekly'")
        prefs.digest_frequency = payload.digest_frequency

    if payload.digest_time is not None:
        prefs.digest_time = payload.digest_time

    if payload.digest_day is not None:
        if not 1 <= payload.digest_day <= 7:
            raise HTTPException(status_code=400, detail="digest_day must be 1–7 (Mon–Sun)")
        prefs.digest_day = payload.digest_day

    session.add(prefs)
    session.commit()
    session.refresh(prefs)
    return {
        "digest_enabled": prefs.digest_enabled,
        "digest_frequency": prefs.digest_frequency,
        "digest_time": prefs.digest_time,
        "digest_day": prefs.digest_day,
    }


# ── Test send ─────────────────────────────────────────────────────────────

@router.post("/send-test")
def send_test(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.email_verified:
        raise HTTPException(status_code=400, detail="Verify your email first")

    from app.services.email_service import build_digest_html, send_digest_email
    html = build_digest_html(user, session)
    send_digest_email(user.email, user.display_name, html)
    return {"message": f"Test digest sent to {user.email}"}
