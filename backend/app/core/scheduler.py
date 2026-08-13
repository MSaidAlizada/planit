from datetime import datetime, timedelta, timezone
from typing import List
from zoneinfo import ZoneInfo
import copy
import json

from app.models import CalendarEvent, Context, Task, Preference


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _local_tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def _local_wall_time_to_utc(local_date, hour: int, minute: int, tz: ZoneInfo) -> datetime:
    """A user's wall-clock hour:minute on a given local calendar date, as naive UTC.

    Goes through an aware datetime so DST transitions are handled correctly
    for that specific date, then strips tzinfo to match the rest of the
    scheduler's naive-UTC convention.
    """
    aware = datetime(local_date.year, local_date.month, local_date.day, hour, minute, tzinfo=tz)
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def _local_dates_spanning(start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> list:
    """Local calendar dates (inclusive) covering a naive-UTC datetime range."""
    start_local = start_utc.replace(tzinfo=timezone.utc).astimezone(tz).date()
    end_local = end_utc.replace(tzinfo=timezone.utc).astimezone(tz).date()
    dates = []
    day = start_local
    while day <= end_local:
        dates.append(day)
        day += timedelta(days=1)
    return dates


def find_free_slots(
    busy_events: List[CalendarEvent],
    start_date: datetime,
    end_date: datetime,
    min_slot_duration: int = 30,
    preferences: Preference | None = None,
) -> List[tuple[datetime, datetime]]:
    if preferences is None:
        preferences = Preference()

    sleep_start_hour = int(preferences.sleep_start.split(":")[0])
    sleep_end_hour = int(preferences.sleep_end.split(":")[0])
    buffer_mins = preferences.buffer_minutes
    tz = _local_tz(preferences.timezone)

    busy_blocks: list[tuple[datetime, datetime]] = []
    for event in busy_events:
        if event.is_busy:
            # event.start_at / end_at are already datetime objects from SQLModel
            busy_blocks.append((event.start_at, event.end_at))

    # Add sleep windows for each local calendar day in the range — sleep_start
    # / sleep_end are wall-clock hours in the user's own timezone, not UTC.
    for local_day in _local_dates_spanning(start_date, end_date, tz):
        sleep_start_dt = _local_wall_time_to_utc(local_day, sleep_start_hour, 0, tz)
        sleep_end_dt = _local_wall_time_to_utc(local_day + timedelta(days=1), sleep_end_hour, 0, tz)
        busy_blocks.append((sleep_start_dt, sleep_end_dt))

    busy_blocks.sort(key=lambda x: x[0])

    # Merge overlapping / adjacent blocks (with buffer)
    merged: list[tuple[datetime, datetime]] = []
    for start, end in busy_blocks:
        if merged and start <= merged[-1][1] + timedelta(minutes=buffer_mins):
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    # Collect gaps
    free_slots: list[tuple[datetime, datetime]] = []
    cursor = start_date
    for busy_start, busy_end in merged:
        if cursor < busy_start:
            gap_mins = (busy_start - cursor).total_seconds() / 60
            if gap_mins >= min_slot_duration:
                free_slots.append((cursor, busy_start))
        cursor = max(cursor, busy_end + timedelta(minutes=buffer_mins))

    if cursor < end_date:
        gap_mins = (end_date - cursor).total_seconds() / 60
        if gap_mins >= min_slot_duration:
            free_slots.append((cursor, end_date))

    return free_slots


def score_schedule(task: Task, slot_start: datetime, slot_end: datetime, preferences: Preference | None = None) -> float:
    if preferences is None:
        preferences = Preference()

    score = 100.0

    if task.deadline_at:
        deadline = task.deadline_at  # already a datetime
        hours_until = (deadline - slot_end).total_seconds() / 3600
        if hours_until < 0:
            score -= 500  # past deadline
        elif hours_until < 1:
            score -= 100  # very tight

    if task.priority >= 8:
        hours_from_now = (slot_start - _now()).total_seconds() / 3600
        if hours_from_now > 48:
            score -= 20

    slot_duration = (slot_end - slot_start).total_seconds() / 60
    if slot_duration < task.duration_minutes:
        score -= 1000  # doesn't fit
    elif slot_duration > task.duration_minutes * 2:
        score -= 5  # wasteful gap

    return score


def _clip_slot_to_context(
    slot_start: datetime,
    slot_end: datetime,
    availability_json: str,
    tz: ZoneInfo = ZoneInfo("UTC"),
) -> list[tuple[datetime, datetime]]:
    """Return sub-intervals of [slot_start, slot_end] within the context's availability windows.

    Window start/end/days are wall-clock hours and weekdays in the user's own
    timezone (e.g. "Work" = Mon-Fri 09:00-17:00 local), not UTC.
    """
    try:
        windows = json.loads(availability_json)
    except (json.JSONDecodeError, TypeError):
        return [(slot_start, slot_end)]

    if not windows:
        # No windows defined — context is available at all times
        return [(slot_start, slot_end)]

    results: list[tuple[datetime, datetime]] = []
    for local_day in _local_dates_spanning(slot_start, slot_end, tz):
        weekday = local_day.weekday()  # 0=Mon, 6=Sun
        for window in windows:
            if weekday not in window.get("days", []):
                continue
            try:
                wh, wm = map(int, window["start"].split(":"))
                eh, em = map(int, window["end"].split(":"))
            except (KeyError, ValueError):
                continue
            win_start = _local_wall_time_to_utc(local_day, wh, wm, tz)
            win_end = _local_wall_time_to_utc(local_day, eh, em, tz)
            clip_start = max(slot_start, win_start)
            clip_end = min(slot_end, win_end)
            if clip_start < clip_end:
                results.append((clip_start, clip_end))

    results.sort(key=lambda x: x[0])
    return results


def generate_schedule_suggestions(
    unscheduled_tasks: List[Task],
    scheduled_tasks: List[Task],
    calendar_events: List[CalendarEvent],
    preferences: Preference | None = None,
    num_suggestions: int = 3,
    context_map: dict[str, Context] | None = None,
) -> List[dict]:
    if preferences is None:
        preferences = Preference()

    if not unscheduled_tasks:
        return []

    now = _now()
    search_end = now + timedelta(days=14)

    # Treat already-scheduled tasks as busy blocks alongside calendar events
    task_busy_events = [
        CalendarEvent(
            title=t.title,
            start_at=t.scheduled_start_at,
            end_at=t.scheduled_end_at,
            is_busy=True,
        )
        for t in scheduled_tasks
        if t.scheduled_start_at and t.scheduled_end_at
    ]
    all_busy = list(calendar_events) + task_busy_events
    base_free_slots = find_free_slots(all_busy, now, search_end, preferences=preferences)

    if not base_free_slots:
        return []

    suggestions = []

    # Strategy 1: Deadline-first
    deadline_sorted = sorted(
        unscheduled_tasks,
        key=lambda t: (t.deadline_at or search_end, -t.priority),
    )
    ctx = context_map or {}
    result_1 = _fit_tasks_into_slots(deadline_sorted, copy.deepcopy(base_free_slots), preferences, ctx)
    if result_1["placements"]:
        suggestions.append({
            "name": "Deadline-First",
            "description": "Prioritises tasks with nearer deadlines, keeps you safe before cutoffs",
            "placements": result_1["placements"],
            "score": result_1["score"],
            "placed": result_1["placed"],
            "total": result_1["total"],
        })

    # Strategy 2: Balanced load (spread heavy tasks across days)
    load_sorted = sorted(unscheduled_tasks, key=lambda t: -t.mental_load)
    result_2 = _fit_tasks_into_slots(load_sorted, copy.deepcopy(base_free_slots), preferences, ctx)
    if result_2["placements"]:
        suggestions.append({
            "name": "Balanced Load",
            "description": "Spreads high mental-load tasks across different days to avoid burnout",
            "placements": result_2["placements"],
            "score": result_2["score"],
            "placed": result_2["placed"],
            "total": result_2["total"],
        })

    # Strategy 3: Priority-first (highest priority ASAP)
    priority_sorted = sorted(unscheduled_tasks, key=lambda t: -t.priority)
    result_3 = _fit_tasks_into_slots(priority_sorted, copy.deepcopy(base_free_slots), preferences, ctx)
    if result_3["placements"]:
        suggestions.append({
            "name": "Priority-First",
            "description": "Gets your highest-priority tasks onto the calendar as soon as possible",
            "placements": result_3["placements"],
            "score": result_3["score"],
            "placed": result_3["placed"],
            "total": result_3["total"],
        })

    # Deduplicate: remove strategies with identical task→time placements
    seen: set[frozenset] = set()
    unique: list[dict] = []
    for s in suggestions:
        key = frozenset(
            (task_id, p["start"]) for task_id, p in s["placements"].items()
        )
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique[:num_suggestions]


def _fit_tasks_into_slots(
    tasks: List[Task],
    free_slots: List[tuple[datetime, datetime]],
    preferences: Preference | None = None,
    context_map: dict[str, Context] | None = None,
) -> dict:
    if preferences is None:
        preferences = Preference()
    if context_map is None:
        context_map = {}
    tz = _local_tz(preferences.timezone)

    placements: dict[str, dict] = {}
    total_score = 0.0

    for task in tasks:
        context = context_map.get(task.context_name) if task.context_name else None

        for i, (slot_start, slot_end) in enumerate(free_slots):
            if context is not None:
                # Clip this free slot to the context's availability windows
                sub_slots = _clip_slot_to_context(slot_start, slot_end, context.availability, tz)
                placed = False
                for sub_start, sub_end in sub_slots:
                    if (sub_end - sub_start).total_seconds() / 60 < task.duration_minutes:
                        continue
                    task_end = sub_start + timedelta(minutes=task.duration_minutes)
                    placements[str(task.id)] = {
                        "task_id": str(task.id),
                        "title": task.title,
                        "start": sub_start.isoformat(),
                        "end": task_end.isoformat(),
                        "duration": task.duration_minutes,
                    }
                    total_score += score_schedule(task, sub_start, task_end, preferences)
                    new_start = task_end + timedelta(minutes=preferences.buffer_minutes)
                    remaining = (slot_end - new_start).total_seconds() / 60
                    if remaining >= 30:
                        free_slots[i] = (new_start, slot_end)
                    else:
                        free_slots.pop(i)
                    placed = True
                    break
                if placed:
                    break
            else:
                slot_duration = (slot_end - slot_start).total_seconds() / 60
                if slot_duration < task.duration_minutes:
                    continue

                task_end = slot_start + timedelta(minutes=task.duration_minutes)
                placements[str(task.id)] = {
                    "task_id": str(task.id),
                    "title": task.title,
                    "start": slot_start.isoformat(),
                    "end": task_end.isoformat(),
                    "duration": task.duration_minutes,
                }
                total_score += score_schedule(task, slot_start, task_end, preferences)

                new_start = task_end + timedelta(minutes=preferences.buffer_minutes)
                remaining = (slot_end - new_start).total_seconds() / 60
                if remaining >= 30:
                    free_slots[i] = (new_start, slot_end)
                else:
                    free_slots.pop(i)
                break

    return {
        "placements": placements,
        "score": total_score,
        "placed": len(placements),
        "total": len(tasks),
    }
