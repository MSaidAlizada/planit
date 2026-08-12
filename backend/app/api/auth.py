import secrets
from datetime import datetime, timedelta, timezone
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.config import settings
from app.core.deps import get_current_user, require_admin
from app.core.limiter import limiter
from app.db import get_session
from app.models import InviteCode, RefreshToken, User
from app.services.auth_service import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TokenBundle(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    username: str
    display_name: str


def _issue_tokens(user: User, session: Session, family_id=None) -> TokenBundle:
    from uuid import uuid4

    access_token = create_access_token(str(user.id))
    refresh_token = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or uuid4(),
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expiry(),
        )
    )
    session.commit()
    return TokenBundle(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=str(user.id),
        username=user.username,
        display_name=user.display_name,
    )


class RegisterBody(BaseModel):
    username: str
    password: str = Field(min_length=8, description="At least 8 characters")
    display_name: str = ""
    invite_code: Optional[str] = None


class LoginBody(BaseModel):
    username: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


class LogoutBody(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/register", response_model=TokenBundle, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(
    request: Request,
    body: RegisterBody,
    session: Session = Depends(_session_dep),
) -> TokenBundle:
    normalized = body.username.strip().lower()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username is required")

    existing = session.exec(select(User).where(User.username == normalized)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    is_first_user = session.exec(select(User)).first() is None
    invite: Optional[InviteCode] = None

    if not is_first_user and settings.registration_requires_invite:
        code = (body.invite_code or "").strip()
        if not code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="An invite code is required to sign up")
        invite = session.exec(select(InviteCode).where(InviteCode.code == code)).first()
        now = _utcnow()
        if (
            not invite
            or not invite.is_active
            or invite.use_count >= invite.max_uses
            or (invite.expires_at is not None and invite.expires_at < now)
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired invite code")

    user = User(
        username=normalized,
        display_name=body.display_name.strip() or body.username.strip(),
        hashed_password=hash_password(body.password),
        is_admin=is_first_user,
    )
    session.add(user)

    if invite is not None:
        invite.use_count += 1
        if invite.use_count >= invite.max_uses:
            invite.is_active = False
        session.add(invite)

    session.commit()
    session.refresh(user)

    return _issue_tokens(user, session)


@router.post("/login", response_model=TokenBundle)
@limiter.limit("10/minute")
def login(
    request: Request,
    body: LoginBody,
    session: Session = Depends(_session_dep),
) -> TokenBundle:
    normalized = body.username.strip().lower()
    user = session.exec(select(User).where(User.username == normalized)).first()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
    )
    if not user:
        raise invalid_credentials

    now = _utcnow()
    if user.locked_until and user.locked_until > now:
        remaining = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {remaining} minute(s).",
        )

    if not verify_password(body.password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        session.add(user)
        session.commit()
        raise invalid_credentials

    user.failed_login_attempts = 0
    user.locked_until = None
    session.add(user)
    session.commit()
    session.refresh(user)

    return _issue_tokens(user, session)


@router.post("/refresh", response_model=TokenBundle)
@limiter.limit("30/minute")
def refresh(
    request: Request,
    body: RefreshBody,
    session: Session = Depends(_session_dep),
) -> TokenBundle:
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    token_hash = hash_refresh_token(body.refresh_token)
    stored = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    if not stored:
        raise invalid

    now = _utcnow()
    if stored.revoked_at is not None:
        # Reuse of an already-rotated token — likely theft. Kill the whole family.
        family_tokens = session.exec(
            select(RefreshToken).where(RefreshToken.family_id == stored.family_id, RefreshToken.revoked_at.is_(None))
        ).all()
        for t in family_tokens:
            t.revoked_at = now
            session.add(t)
        session.commit()
        raise invalid

    if stored.expires_at < now:
        raise invalid

    user = session.get(User, stored.user_id)
    if not user:
        raise invalid

    stored.revoked_at = now
    session.add(stored)
    session.commit()

    return _issue_tokens(user, session, family_id=stored.family_id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutBody, session: Session = Depends(_session_dep)) -> None:
    if not body.refresh_token:
        return
    token_hash = hash_refresh_token(body.refresh_token)
    stored = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    if not stored:
        return
    now = _utcnow()
    family_tokens = session.exec(
        select(RefreshToken).where(RefreshToken.family_id == stored.family_id, RefreshToken.revoked_at.is_(None))
    ).all()
    for t in family_tokens:
        t.revoked_at = now
        session.add(t)
    session.commit()


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "user_id": str(current_user.id),
        "username": current_user.username,
        "display_name": current_user.display_name,
        "is_admin": current_user.is_admin,
    }


class UpdateProfileBody(BaseModel):
    display_name: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.patch("/me", status_code=200)
def update_profile(
    body: UpdateProfileBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(_session_dep),
) -> dict:
    user = session.get(User, current_user.id)
    user.display_name = body.display_name.strip() or user.display_name
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"user_id": str(user.id), "username": user.username, "display_name": user.display_name}


@router.post("/me/change-password", status_code=204)
def change_password(
    body: ChangePasswordBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(_session_dep),
) -> None:
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user = session.get(User, current_user.id)
    user.hashed_password = hash_password(body.new_password)
    session.add(user)
    # Changing the password invalidates every other active session.
    now = _utcnow()
    for t in session.exec(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ).all():
        t.revoked_at = now
        session.add(t)
    session.commit()


class ConfirmDeleteBody(BaseModel):
    password: str


@router.delete("/me", status_code=204)
def delete_account(
    body: ConfirmDeleteBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(_session_dep),
) -> None:
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
    user = session.get(User, current_user.id)
    for t in session.exec(select(RefreshToken).where(RefreshToken.user_id == user.id)).all():
        session.delete(t)
    session.delete(user)
    session.commit()


# ── Invite codes (admin only) ───────────────────────────────────────────────

class CreateInviteBody(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_in_days: Optional[int] = Field(default=None, ge=1)


class InviteResponse(BaseModel):
    code: str
    max_uses: int
    use_count: int
    is_active: bool
    expires_at: Optional[datetime]
    created_at: datetime


@router.post("/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: CreateInviteBody,
    admin: User = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> InviteCode:
    code = secrets.token_urlsafe(6).replace("_", "").replace("-", "")[:8].upper()
    invite = InviteCode(
        code=code,
        created_by_user_id=admin.id,
        max_uses=body.max_uses,
        expires_at=(_utcnow() + timedelta(days=body.expires_in_days)) if body.expires_in_days else None,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return invite


@router.get("/invites", response_model=list[InviteResponse])
def list_invites(
    admin: User = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> list[InviteCode]:
    return list(session.exec(select(InviteCode).order_by(InviteCode.created_at.desc())).all())


@router.delete("/invites/{code}", status_code=204)
def revoke_invite(
    code: str,
    admin: User = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> None:
    invite = session.exec(select(InviteCode).where(InviteCode.code == code.upper())).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found")
    invite.is_active = False
    session.add(invite)
    session.commit()
