"""Google Calendar OAuth endpoints.

The callback route is registered at the top-level app (not under /api) so that
the Google-registered redirect URI can be http://localhost:8000/auth/google/callback.
The rest are under /api/google for frontend use.
"""
import logging
from datetime import datetime, timezone
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.config import settings
from app.core.deps import get_current_user
from app.db import get_session
from app.models import GoogleCredential, User
from app.services import google_calendar_service as gcs

logger = logging.getLogger(__name__)

# ── Two routers ───────────────────────────────────────────────────────────
# oauth_router  → mounted at /auth  (handles the redirect from Google)
# api_router    → mounted at /api/google
oauth_router = APIRouter(prefix="/auth", tags=["google-oauth"])
api_router   = APIRouter(prefix="/google", tags=["google"])


def _session() -> Iterator[Session]:
    with get_session() as session:
        yield session


# ── Status schema ─────────────────────────────────────────────────────────

class GoogleStatus(BaseModel):
    connected:      bool
    email:          str
    last_synced_at: datetime | None = None
    configured:     bool


# ── /api/google endpoints (called by the frontend) ───────────────────────

@api_router.get("/status", response_model=GoogleStatus)
def google_status(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> GoogleStatus:
    configured = bool(settings.google_client_id and settings.google_client_secret)
    cred = session.exec(select(GoogleCredential).where(GoogleCredential.user_id == current_user.id)).first()
    if not cred:
        return GoogleStatus(connected=False, email="", configured=configured)
    return GoogleStatus(
        connected      = True,
        email          = cred.email,
        last_synced_at = cred.updated_at,
        configured     = configured,
    )


@api_router.get("/auth-url")
def get_auth_url(current_user: User = Depends(get_current_user)) -> dict[str, str]:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env",
        )
    url, state = gcs.create_auth_url(user_id=str(current_user.id))
    return {"url": url, "state": state}


@api_router.post("/sync")
def sync_google(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    cred = session.exec(select(GoogleCredential).where(GoogleCredential.user_id == current_user.id)).first()
    if not cred:
        raise HTTPException(status_code=400, detail="Google Calendar is not connected.")

    try:
        count, updated_cred = gcs.sync_google_events(cred, session)
    except Exception:
        logger.exception("Google Calendar sync failed for user %s", current_user.id)
        raise HTTPException(status_code=400, detail="Google Calendar sync failed. Try reconnecting.")

    session.add(updated_cred)
    session.commit()
    return {"synced": count, "message": f"Imported {count} events from Google Calendar"}


@api_router.delete("/disconnect", status_code=204)
def disconnect_google(
    session: Session = Depends(_session),
    current_user: User = Depends(get_current_user),
) -> None:
    from app.models import CalendarEvent

    cred = session.exec(select(GoogleCredential).where(GoogleCredential.user_id == current_user.id)).first()
    if cred:
        session.delete(cred)

    old = session.exec(
        select(CalendarEvent).where(
            CalendarEvent.source_calendar == "google",
            CalendarEvent.user_id == current_user.id,
        )
    ).all()
    for ev in old:
        session.delete(ev)

    session.commit()


# ── /auth/google/callback (Google redirects here after consent) ───────────
# NOTE: state encodes the user_id so the callback can associate the credential.

@oauth_router.get("/google/callback")
def google_callback(
    code:  str | None  = None,
    state: str | None  = None,
    error: str | None  = None,
    session: Session   = Depends(_session),
) -> RedirectResponse:
    frontend = settings.frontend_url

    if error or not code:
        return RedirectResponse(f"{frontend}/settings?google=error&reason={error or 'no_code'}")

    # Validate state before exchanging the code — no state means we can't
    # safely associate the credential with a user, so reject immediately.
    import logging
    user_id = gcs.pop_user_id_for_state(state or "")
    if not user_id:
        logging.warning("Google OAuth callback: missing or unrecognised state param")
        return RedirectResponse(f"{frontend}/settings?google=error&reason=invalid_state")

    try:
        new_cred = gcs.exchange_code(code, state or "")
    except Exception:
        logging.exception("Google OAuth exchange failed")
        return RedirectResponse(f"{frontend}/settings?google=error&reason=exchange_failed")

    # Replace any existing credential for this user
    existing = session.exec(
        select(GoogleCredential).where(GoogleCredential.user_id == user_id)
    ).first()
    if existing:
        session.delete(existing)
    new_cred.user_id = user_id

    session.add(new_cred)
    session.commit()

    return RedirectResponse(f"{frontend}/settings?google=connected")
