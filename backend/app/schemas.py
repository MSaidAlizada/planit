from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import TaskStatus


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    duration_minutes: int
    category_name: str | None = None
    context_name: str | None = None
    deadline_at: datetime | None = None
    mental_load: int = Field(default=1, ge=1, le=5)
    priority: int = Field(default=0, ge=0, le=10)


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    category_name: str | None = None
    context_name: str | None = None
    deadline_at: datetime | None = None
    mental_load: int | None = Field(default=None, ge=1, le=5)
    priority: int | None = Field(default=None, ge=0, le=10)
    status: TaskStatus | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None


class TaskRead(TaskCreate):
    id: UUID
    status: TaskStatus
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    google_event_id: str | None = None
    created_at: datetime
    updated_at: datetime
    subtask_count: int = 0
    completed_subtask_count: int = 0


class ContextCreate(BaseModel):
    name: str
    color: str = Field(default="#7b9e87")
    availability: str = "[]"


class ContextRead(ContextCreate):
    id: UUID
    created_at: datetime


class CategoryCreate(BaseModel):
    name: str
    color: str = Field(default="#c9ad93")


class CategoryRead(CategoryCreate):
    id: UUID
    created_at: datetime


class CalendarEventCreate(BaseModel):
    external_id: str | None = None
    title: str
    start_at: datetime
    end_at: datetime
    source_calendar: str = "local"
    is_busy: bool = True
    is_imported: bool = False


class CalendarEventRead(CalendarEventCreate):
    id: UUID


class HabitCreate(BaseModel):
    title: str
    duration_minutes: int = Field(default=15, gt=0)
    mental_load: int = Field(default=1, ge=1, le=5)
    recurrence_rule: str = Field(default="daily")
    is_active: bool = True


class HabitUpdate(BaseModel):
    title: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    mental_load: int | None = Field(default=None, ge=1, le=5)
    recurrence_rule: str | None = None
    is_active: bool | None = None


class HabitRead(HabitCreate):
    id: UUID
    created_at: datetime
    streak_count: int = 0
    best_streak: int = 0
    last_completed_at: datetime | None = None
    next_due_at: datetime | None = None
    completions_count: int = 0
    is_due: bool = False
    recurrence_label: str = ""


class HabitCompletionRead(BaseModel):
    id: UUID
    habit_id: UUID
    completed_at: datetime
    notes: str = ""


class SubtaskCreate(BaseModel):
    title: str
    position: int = 0


class SubtaskUpdate(BaseModel):
    title: str | None = None
    is_completed: bool | None = None
    position: int | None = None


class SubtaskRead(SubtaskCreate):
    id: UUID
    task_id: UUID
    is_completed: bool
    created_at: datetime
