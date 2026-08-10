from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.config import settings
from app.db import get_session
from app.core.deps import get_current_user
from app.models import User
from app.services.auth_service import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME    = "planit_session"
_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 days


def _session_dep() -> Iterator[Session]:
    with get_session() as session:
        yield session


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict",
        secure=(settings.environment == "production"),
        path="/",
    )


class RegisterBody(BaseModel):
    username: str
    password: str = Field(min_length=8, description="At least 8 characters")
    display_name: str = ""


class LoginBody(BaseModel):
    username: str
    password: str


class UserInfoResponse(BaseModel):
    user_id: str
    username: str
    display_name: str


@router.post("/register", response_model=UserInfoResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterBody,
    response: Response,
    session: Session = Depends(_session_dep),
) -> UserInfoResponse:
    normalized = body.username.strip().lower()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username is required")

    existing = session.exec(select(User).where(User.username == normalized)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(
        username=normalized,
        display_name=body.display_name.strip() or body.username.strip(),
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    _set_auth_cookie(response, create_token(str(user.id)))
    return UserInfoResponse(user_id=str(user.id), username=user.username, display_name=user.display_name)


@router.post("/login", response_model=UserInfoResponse)
def login(
    body: LoginBody,
    response: Response,
    session: Session = Depends(_session_dep),
) -> UserInfoResponse:
    normalized = body.username.strip().lower()
    user = session.exec(select(User).where(User.username == normalized)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    _set_auth_cookie(response, create_token(str(user.id)))
    return UserInfoResponse(user_id=str(user.id), username=user.username, display_name=user.display_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/")


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "user_id": str(current_user.id),
        "username": current_user.username,
        "display_name": current_user.display_name,
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
    session.commit()


class ConfirmDeleteBody(BaseModel):
    password: str


@router.delete("/me", status_code=204)
def delete_account(
    body: ConfirmDeleteBody,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(_session_dep),
) -> None:
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
    user = session.get(User, current_user.id)
    session.delete(user)
    session.commit()
    response.delete_cookie(key=_COOKIE_NAME, path="/")
