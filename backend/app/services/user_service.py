from sqlmodel import Session, select

from app.models import (
    CalendarEvent,
    CalendarFeed,
    Category,
    Context,
    GoogleCredential,
    Habit,
    HabitCompletion,
    InviteCode,
    Preference,
    RefreshToken,
    Subtask,
    Task,
    User,
)


def delete_user_and_data(session: Session, user: User) -> dict[str, int]:
    """Delete a user and every row that belongs to them. Caller must commit."""
    counts: dict[str, int] = {}

    task_ids = list(session.exec(select(Task.id).where(Task.user_id == user.id)))
    if task_ids:
        subtasks = session.exec(select(Subtask).where(Subtask.task_id.in_(task_ids))).all()
        counts["subtasks"] = len(subtasks)
        for row in subtasks:
            session.delete(row)

    for model, key in [
        (RefreshToken, "refresh_tokens"),
        (Task, "tasks"),
        (Habit, "habits"),
        (HabitCompletion, "habit_completions"),
        (Category, "categories"),
        (Context, "contexts"),
        (CalendarEvent, "calendar_events"),
        (Preference, "preferences"),
        (CalendarFeed, "calendar_feeds"),
        (GoogleCredential, "google_credentials"),
    ]:
        rows = session.exec(select(model).where(model.user_id == user.id)).all()
        counts[key] = len(rows)
        for row in rows:
            session.delete(row)

    invites = session.exec(select(InviteCode).where(InviteCode.created_by_user_id == user.id)).all()
    counts["invite_codes"] = len(invites)
    for row in invites:
        session.delete(row)

    session.delete(user)
    return counts
