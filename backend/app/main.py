import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import select

from app.api.auth import router as auth_router
from app.api.routes import api_router
from app.api.google_auth import oauth_router
from app.core.config import settings
from app.core.limiter import limiter
from app.db import get_session, init_db

logger = logging.getLogger(__name__)

app = FastAPI(title="planit API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Auth is Authorization-header (Bearer) based, not cookies, so credentialed
# CORS is unnecessary — this lets allow_origins list the GitHub Pages origin
# without also having to reason about SameSite/third-party cookie behavior.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")
app.include_router(oauth_router)

# ── Background scheduler ──────────────────────────────────────────────────
# Only start the scheduler in the main process. When uvicorn runs with
# --reload, watchfiles spawns a reloader child; WATCHFILES_FORCE_COLOR is
# set in that child so we can detect it and skip starting a second scheduler.

_scheduler = BackgroundScheduler(timezone="UTC")


def _sync_google() -> None:
    from app.models import GoogleCredential
    from app.services.google_calendar_service import sync_google_events
    try:
        with get_session() as session:
            creds = session.exec(select(GoogleCredential)).all()
            for cred in creds:
                try:
                    count, updated = sync_google_events(cred, session)
                    session.add(updated)
                    session.commit()
                    logger.info("Auto-synced %d Google Calendar events for user %s", count, cred.user_id)
                except Exception:
                    logger.exception("Google Calendar auto-sync failed for user %s", cred.user_id)
    except Exception:
        logger.exception("Google Calendar auto-sync failed")


def _sync_feeds() -> None:
    from app.models import CalendarFeed
    from app.services.ical_service import sync_feed
    try:
        with get_session() as session:
            feeds = session.exec(
                select(CalendarFeed).where(CalendarFeed.is_active == True)  # noqa: E712
            ).all()
            for feed in feeds:
                try:
                    sync_feed(feed, session)
                    session.commit()
                except Exception:
                    logger.exception("iCal feed sync failed for feed %s", feed.id)
    except Exception:
        logger.exception("iCal feeds auto-sync failed")


def _send_digests() -> None:
    """Fire digest emails for users whose configured time matches now (UTC, minute precision)."""
    from app.models import User, Preference
    from app.services.email_service import build_digest_html, send_digest_email

    now = datetime.now(timezone.utc)
    current_hhmm = now.strftime("%H:%M")
    current_isoweekday = now.isoweekday()  # 1=Mon … 7=Sun

    try:
        with get_session() as session:
            users = session.exec(
                select(User).where(User.email_verified == True)  # noqa: E712
            ).all()
            for user in users:
                prefs = session.exec(
                    select(Preference).where(Preference.user_id == user.id)
                ).first()
                if not prefs or not prefs.digest_enabled:
                    continue
                matches_daily = (
                    prefs.digest_frequency == "daily"
                    and prefs.digest_time == current_hhmm
                )
                matches_weekly = (
                    prefs.digest_frequency == "weekly"
                    and prefs.digest_day == current_isoweekday
                    and prefs.digest_time == current_hhmm
                )
                if matches_daily or matches_weekly:
                    try:
                        html = build_digest_html(user, session)
                        send_digest_email(user.email, user.display_name, html)
                    except Exception:
                        logger.exception("Failed to send digest to user %s", user.id)
    except Exception:
        logger.exception("Digest job failed")


def _backup_db() -> None:
    """Copy the SQLite file to a timestamped backup in the same directory."""
    db_url = settings.database_url
    if not db_url.startswith("sqlite:///"):
        return
    db_path = Path(db_url.replace("sqlite:///", ""))
    if not db_path.exists():
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    dest = backup_dir / f"planit_{stamp}.db"
    shutil.copy2(db_path, dest)
    # Keep only the 7 most recent backups
    backups = sorted(backup_dir.glob("planit_*.db"))
    for old in backups[:-7]:
        old.unlink()
    logger.info("DB backed up to %s", dest)


def _is_reloader_process() -> bool:
    """Return True when running inside uvicorn's watchfiles reloader child."""
    return os.environ.get("_UVICORN_RELOADER_PROCESS") == "true" or (
        # Older uvicorn/watchfiles detection via RUN_MAIN (like Django)
        os.environ.get("RUN_MAIN") == "true"
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    if not _is_reloader_process():
        _scheduler.add_job(_sync_google,   "interval", minutes=30, id="google_sync",  replace_existing=True)
        _scheduler.add_job(_sync_feeds,    "interval", hours=1,   id="feed_sync",    replace_existing=True)
        _scheduler.add_job(_backup_db,     "cron",     hour=3,    id="db_backup",    replace_existing=True)
        _scheduler.add_job(_send_digests,  "cron",     minute="*",id="digest_send",  replace_existing=True)
        _scheduler.start()
        logger.info("Background scheduler started")


@app.on_event("shutdown")
def on_shutdown() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
