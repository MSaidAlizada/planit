from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    display_name: str = ""
    hashed_password: str
    created_at: datetime = Field(default_factory=_utcnow)
    # Email digest
    email: str = ""
    email_verified: bool = False
    email_verify_token: str = ""
    email_verify_expires: Optional[datetime] = None
    # Auth hardening
    is_admin: bool = False
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None


class RefreshToken(SQLModel, table=True):
    """Opaque, rotating refresh tokens. Only a hash of the token is stored,
    so a DB read never discloses a usable credential. `family_id` links every
    token descended from one login — reusing an already-rotated token revokes
    the whole family (theft/replay detection)."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    family_id: UUID = Field(index=True)
    token_hash: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    expires_at: datetime
    revoked_at: Optional[datetime] = None


class InviteCode(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    code: str = Field(unique=True, index=True)
    created_by_user_id: UUID = Field(foreign_key="user.id")
    max_uses: int = 1
    use_count: int = 0
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_utcnow)
    is_active: bool = True


class TaskStatus(str, Enum):
    UNSCHEDULED = "unscheduled"
    SCHEDULED   = "scheduled"
    COMPLETED   = "completed"
    SKIPPED     = "skipped"


class Task(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    title: str
    description: str = ""
    duration_minutes: int
    category_name: Optional[str] = None
    context_name: Optional[str] = None
    deadline_at: Optional[datetime] = None
    mental_load: int = 1
    priority: int = 0
    status: TaskStatus = TaskStatus.UNSCHEDULED
    scheduled_start_at: Optional[datetime] = None
    scheduled_end_at: Optional[datetime] = None
    google_event_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class Habit(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    title: str
    duration_minutes: int
    mental_load: int = 1
    recurrence_rule: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utcnow)


class HabitCompletion(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    habit_id: UUID = Field(foreign_key="habit.id", index=True)
    completed_at: datetime = Field(default_factory=_utcnow, index=True)
    notes: str = ""


class Category(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    color: str = "#c9ad93"
    created_at: datetime = Field(default_factory=_utcnow)


class Context(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    color: str = "#7b9e87"
    # JSON array: [{"days": [0..6], "start": "HH:MM", "end": "HH:MM"}, ...]
    # days use Python weekday: 0=Mon, 6=Sun
    availability: str = "[]"
    created_at: datetime = Field(default_factory=_utcnow)


class CalendarEvent(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    external_id: Optional[str] = None
    title: str
    start_at: datetime
    end_at: datetime
    source_calendar: str = "local"
    is_busy: bool = True
    is_imported: bool = False


class Preference(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    sleep_start: str = "23:00"       # HH:MM in `timezone` below
    sleep_end: str = "07:00"         # HH:MM in `timezone` below
    buffer_minutes: int = 15
    max_daily_load: int = 8
    # IANA name, e.g. "America/New_York" — all wall-clock preferences above
    # and below are interpreted in this zone, not UTC.
    timezone: str = "UTC"
    # Email digest
    digest_enabled: bool = False
    digest_frequency: str = "daily"  # "daily" | "weekly"
    digest_time: str = "07:00"       # HH:MM in `timezone` above
    digest_day: int = 1              # ISO weekday 1=Mon … 7=Sun (weekly only)


class CalendarFeed(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    url: str
    last_synced_at: Optional[datetime] = None
    event_count: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utcnow)


class Subtask(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="task.id", index=True)
    title: str
    is_completed: bool = False
    position: int = 0
    created_at: datetime = Field(default_factory=_utcnow)


class GoogleCredential(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    email: str = ""
    access_token: str
    refresh_token: str = ""
    token_expiry: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
