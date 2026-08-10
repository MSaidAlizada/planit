from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, timedelta

from app.models import Habit, HabitCompletion

_WEEKDAY_MAP = {
    "mon": 0,
    "monday": 0,
    "tue": 1,
    "tues": 1,
    "tuesday": 1,
    "wed": 2,
    "wednesday": 2,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "thursday": 3,
    "fri": 4,
    "friday": 4,
    "sat": 5,
    "saturday": 5,
    "sun": 6,
    "sunday": 6,
}


def format_recurrence_label(rule: str) -> str:
    rule = rule.strip().lower()
    if rule == "daily":
        return "Every day"
    if rule == "weekdays":
        return "Weekdays"
    if rule == "weekly":
        return "Weekly"
    if rule.startswith("every_n_days:"):
        try:
            days = int(rule.split(":", 1)[1])
            return f"Every {days} days"
        except (ValueError, IndexError):
            return "Custom"
    if rule.startswith("custom:"):
        days = rule.split(":", 1)[1]
        return f"Custom ({days.replace(',', ', ')})"
    return rule.capitalize() if rule else "Custom"


def _parse_weekdays(value: str) -> set[int]:
    days = set()
    for raw in value.split(","):
        key = raw.strip().lower()
        if key in _WEEKDAY_MAP:
            days.add(_WEEKDAY_MAP[key])
    return days


def next_due_at_from_rule(rule: str, reference: datetime) -> datetime:
    normalized = rule.strip().lower()
    if normalized == "daily":
        return reference + timedelta(days=1)

    if normalized == "weekdays":
        candidate = reference + timedelta(days=1)
        while candidate.weekday() >= 5:
            candidate += timedelta(days=1)
        return candidate

    if normalized == "weekly":
        return reference + timedelta(days=7)

    if normalized.startswith("every_n_days:"):
        try:
            days = max(1, int(normalized.split(":", 1)[1]))
        except (ValueError, IndexError):
            days = 1
        return reference + timedelta(days=days)

    if normalized.startswith("custom:"):
        allowed_days = _parse_weekdays(normalized.split(":", 1)[1])
        if not allowed_days:
            return reference + timedelta(days=1)
        candidate = reference + timedelta(days=1)
        for _ in range(14):
            if candidate.weekday() in allowed_days:
                return candidate
            candidate += timedelta(days=1)
        return candidate

    return reference + timedelta(days=1)


def _unique_completion_days(completions: Iterable[HabitCompletion]) -> list[datetime]:
    seen: set[str] = set()
    days: list[datetime] = []
    for completion in sorted(completions, key=lambda item: item.completed_at):
        key = completion.completed_at.date().isoformat()
        if key not in seen:
            seen.add(key)
            days.append(completion.completed_at)
    return days


def expand_occurrences(habit: Habit, start_date: date, end_date: date) -> list[date]:
    """Return every date in [start_date, end_date] on which this habit should occur.

    Uses next_due_at_from_rule to walk forward from the habit's created_at
    so all rule types (every_n_days, custom weekdays, weekly) are respected.
    """
    # Walk from created_at up to end_date, collecting dates in range
    current = habit.created_at  # naive UTC datetime
    end_dt = datetime.combine(end_date, datetime.max.time())
    results: list[date] = []

    for _ in range(1000):  # safety cap
        if current > end_dt:
            break
        if current.date() >= start_date:
            results.append(current.date())
        current = next_due_at_from_rule(habit.recurrence_rule, current)

    return results


def compute_habit_metrics(habit: Habit, completions: list[HabitCompletion], now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    completion_days = _unique_completion_days(completions)

    streak_count = 0
    best_streak = 0

    if completion_days:
        streak_count = 1
        best_streak = 1
        current_streak = 1

        for prev, cur in zip(completion_days, completion_days[1:]):
            if (cur.date() - prev.date()).days == 1:
                current_streak += 1
            else:
                best_streak = max(best_streak, current_streak)
                current_streak = 1

        best_streak = max(best_streak, current_streak)
        streak_count = current_streak

    last_completed_at = completion_days[-1] if completion_days else None
    if last_completed_at is None:
        next_due_at = habit.created_at
    else:
        next_due_at = next_due_at_from_rule(habit.recurrence_rule, last_completed_at)

    return {
        "streak_count": streak_count,
        "best_streak": best_streak,
        "last_completed_at": last_completed_at,
        "next_due_at": next_due_at,
        "completions_count": len(completion_days),
        "is_due": habit.is_active and next_due_at <= now,
        "recurrence_label": format_recurrence_label(habit.recurrence_rule),
    }