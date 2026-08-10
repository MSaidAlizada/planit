"""Email sending and digest HTML builder."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, time
from typing import TYPE_CHECKING

from sqlmodel import Session, select

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)


# ── Transport ─────────────────────────────────────────────────────────────

def _send(to: str, subject: str, html: str) -> None:
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from app.core.config import settings

    if not settings.smtp_user or not settings.smtp_password:
        logger.info("SMTP not configured — skipping send to %s (subject: %s)", to, subject)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, [to], msg.as_string())
        logger.info("Email sent to %s: %s", to, subject)
    except Exception:
        logger.exception("Failed to send email to %s", to)


# ── Verification email ─────────────────────────────────────────────────────

def send_verification_email(to: str, code: str) -> None:
    html = f"""
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0e6d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
    <table width="400" cellpadding="0" cellspacing="0" style="background:#fffcf7;border:1px solid #e8dcc8;border-radius:16px;overflow:hidden;">
      <tr><td style="background:#18100a;padding:20px 28px;">
        <span style="font-size:18px;font-weight:700;color:#fffcf7;">planit</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h2 style="margin:0 0 12px;font-size:20px;color:#251508;">Verify your email</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#5a3d28;line-height:1.6;">
          Enter this code in planit to confirm your email address:
        </p>
        <div style="font-size:40px;font-weight:700;letter-spacing:10px;color:#b8723a;text-align:center;padding:20px;background:#faf4ea;border-radius:12px;margin-bottom:20px;">
          {code}
        </div>
        <p style="margin:0;font-size:12px;color:#9c7e65;">
          This code expires in 15 minutes. If you didn't request this, you can ignore this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""
    _send(to, "Your planit verification code", html)


# ── Digest email ──────────────────────────────────────────────────────────

def send_digest_email(to: str, display_name: str, html: str) -> None:
    name = display_name or "there"
    _send(to, f"Good morning, {name} — your planit digest", html)


def build_digest_html(user: "User", session: Session) -> str:
    from app.models import Task, TaskStatus, Habit, HabitCompletion
    from app.core.habits import expand_occurrences

    now = datetime.utcnow()
    today = now.date()
    yesterday = today - timedelta(days=1)
    three_days_later = today + timedelta(days=3)

    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)
    yesterday_start = datetime.combine(yesterday, time.min)

    # Today's scheduled tasks
    today_tasks = sorted(
        session.exec(
            select(Task).where(
                Task.user_id == user.id,
                Task.status == TaskStatus.SCHEDULED,
                Task.scheduled_start_at >= today_start,
                Task.scheduled_start_at <= today_end,
            )
        ).all(),
        key=lambda t: t.scheduled_start_at or now,
    )

    # Overdue (deadline passed, not done/skipped)
    overdue_tasks = session.exec(
        select(Task).where(
            Task.user_id == user.id,
            Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.SKIPPED]),  # type: ignore[attr-defined]
            Task.deadline_at < today_start,
            Task.deadline_at.isnot(None),  # type: ignore[attr-defined]
        )
    ).all()

    # Upcoming deadlines — today through 3 days out
    upcoming_tasks = sorted(
        session.exec(
            select(Task).where(
                Task.user_id == user.id,
                Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.SKIPPED]),  # type: ignore[attr-defined]
                Task.deadline_at >= today_start,
                Task.deadline_at <= datetime.combine(three_days_later, time.max),
            )
        ).all(),
        key=lambda t: t.deadline_at or now,
    )

    # Habits due today
    habits_all = session.exec(
        select(Habit).where(Habit.user_id == user.id, Habit.is_active == True)  # noqa: E712
    ).all()
    habits_today: list[Habit] = []
    for habit in habits_all:
        if today in expand_occurrences(habit, today, today):
            habits_today.append(habit)

    # Yesterday's completion rate
    yesterday_tasks = session.exec(
        select(Task).where(
            Task.user_id == user.id,
            Task.scheduled_start_at >= yesterday_start,
            Task.scheduled_start_at < today_start,
        )
    ).all()
    completed_yesterday = sum(1 for t in yesterday_tasks if t.status == TaskStatus.COMPLETED)
    total_yesterday = len(yesterday_tasks)
    completion_pct = round(completed_yesterday / total_yesterday * 100) if total_yesterday else 0

    name = user.display_name or user.username
    today_str = now.strftime("%A, %B %-d")

    return _render_digest(
        name=name,
        today_str=today_str,
        today_tasks=today_tasks,
        overdue_tasks=overdue_tasks,
        upcoming_tasks=upcoming_tasks,
        habits_today=habits_today,
        completed_yesterday=completed_yesterday,
        total_yesterday=total_yesterday,
        completion_pct=completion_pct,
        now=now,
    )


# ── HTML renderer ─────────────────────────────────────────────────────────

_CATEGORY_COLORS = [
    "#b8723a", "#4070b0", "#3e8a5c", "#b07820",
    "#7a5ab5", "#b83a70", "#9c7e65",
]


def _task_color(task: "Task") -> str:
    if not task.category_name:
        return "#9c7e65"
    idx = hash(task.category_name) % len(_CATEGORY_COLORS)
    return _CATEGORY_COLORS[idx]


def _fmt_time(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.strftime("%-I:%M %p").replace(" AM", " am").replace(" PM", " pm")


def _days_label(dt: datetime, now: datetime) -> str:
    delta = (dt.date() - now.date()).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    return dt.strftime("%a, %b %-d")


def _render_digest(
    *,
    name: str,
    today_str: str,
    today_tasks: list,
    overdue_tasks: list,
    upcoming_tasks: list,
    habits_today: list,
    completed_yesterday: int,
    total_yesterday: int,
    completion_pct: int,
    now: datetime,
) -> str:
    task_count = len(today_tasks)
    habit_count = len(habits_today)

    # ── Today's schedule rows ──
    schedule_rows = ""
    if today_tasks:
        for task in today_tasks:
            color = _task_color(task)
            t = _fmt_time(task.scheduled_start_at)
            meta = f"{task.duration_minutes} min"
            if task.category_name:
                meta += f" · {task.category_name}"
            schedule_rows += f"""
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
              <tr>
                <td width="60" style="vertical-align:top;padding-top:4px;">
                  <span style="font-size:12px;color:#9c7e65;">{t}</span>
                </td>
                <td>
                  <div style="background:#faf4ea;border:1px solid #e8dcc8;border-left:3px solid {color};border-radius:8px;padding:10px 14px;">
                    <span style="font-size:14px;font-weight:600;color:#251508;">{task.title}</span>
                    <span style="display:block;font-size:12px;color:#9c7e65;margin-top:2px;">{meta}</span>
                  </div>
                </td>
              </tr>
            </table>"""
    else:
        schedule_rows = '<p style="color:#9c7e65;font-size:14px;margin:0;">Nothing scheduled for today.</p>'

    # ── Overdue block ──
    overdue_block = ""
    if overdue_tasks:
        rows = ""
        for task in overdue_tasks[:5]:
            delta = (now.date() - task.deadline_at.date()).days if task.deadline_at else 0
            label = f"{delta} day{'s' if delta != 1 else ''} late"
            rows += f"""
            <tr>
              <td style="padding:5px 0;border-bottom:1px solid rgba(184,58,48,0.12);">
                <span style="font-size:14px;color:#251508;font-weight:500;">● {task.title}</span>
                <span style="float:right;font-size:12px;color:#b83a30;">{label}</span>
              </td>
            </tr>"""
        overdue_block = f"""
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="background:#fce8e6;border:1px solid #f5c8c4;border-radius:12px;padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#b83a30;letter-spacing:1px;text-transform:uppercase;">Overdue</p>
              <table width="100%" cellpadding="0" cellspacing="0">{rows}</table>
            </div>
          </td>
        </tr>"""

    # ── Upcoming deadlines ──
    upcoming_block = ""
    if upcoming_tasks:
        rows = ""
        for task in upcoming_tasks[:4]:
            label = _days_label(task.deadline_at, now) if task.deadline_at else ""
            color = "#b07820" if task.deadline_at and task.deadline_at.date() == now.date() + timedelta(days=1) else "#9c7e65"
            rows += f"""
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #f0e6d4;">
                <span style="font-size:14px;color:#251508;font-weight:500;">{task.title}</span>
                <span style="float:right;font-size:12px;font-weight:600;color:{color};">{label}</span>
              </td>
            </tr>"""
        upcoming_block = f"""
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#9c7e65;letter-spacing:1px;text-transform:uppercase;">Upcoming Deadlines</p>
            <table width="100%" cellpadding="0" cellspacing="0">{rows}</table>
          </td>
        </tr>"""

    # ── Habits ──
    habits_block = ""
    if habits_today:
        rows = ""
        for habit in habits_today:
            rows += f"""
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #f0e6d4;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="24"><div style="width:14px;height:14px;border-radius:50%;border:2px solid #e8dcc8;"></div></td>
                  <td style="font-size:14px;color:#251508;">{habit.title}</td>
                  <td align="right" style="font-size:12px;color:#9c7e65;">{habit.duration_minutes} min</td>
                </tr></table>
              </td>
            </tr>"""
        habits_block = f"""
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#9c7e65;letter-spacing:1px;text-transform:uppercase;">Habits for Today</p>
            <table width="100%" cellpadding="0" cellspacing="0">{rows}</table>
          </td>
        </tr>"""

    # ── Yesterday's stat ──
    bar_width = completion_pct
    stat_block = ""
    if total_yesterday > 0:
        stat_block = f"""
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="background:#faf4ea;border:1px solid #e8dcc8;border-radius:12px;padding:16px 18px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td>
                  <span style="font-size:12px;color:#9c7e65;">Yesterday's completion</span>
                  <span style="display:block;font-size:22px;font-weight:700;color:#251508;margin-top:2px;">{completed_yesterday} / {total_yesterday} tasks</span>
                </td>
                <td align="right" style="width:100px;">
                  <div style="width:90px;height:8px;background:#e8dcc8;border-radius:99px;overflow:hidden;">
                    <div style="width:{bar_width}%;height:100%;background:#b8723a;border-radius:99px;"></div>
                  </div>
                  <span style="display:block;text-align:right;font-size:12px;color:#b8723a;margin-top:4px;font-weight:600;">{completion_pct}%</span>
                </td>
              </tr></table>
            </div>
          </td>
        </tr>"""

    summary = f"You have <strong style='color:#251508;'>{task_count} task{'s' if task_count != 1 else ''}</strong> scheduled today"
    if habit_count:
        summary += f" and <strong style='color:#251508;'>{habit_count} habit{'s' if habit_count != 1 else ''}</strong> to check off"
    summary += "."

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0e6d4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0e6d4;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fffcf7;border-radius:20px;border:1px solid #e8dcc8;overflow:hidden;">

      <tr><td style="background:#18100a;padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <span style="font-size:20px;font-weight:700;color:#fffcf7;letter-spacing:-0.5px;">planit</span>
            <span style="display:block;font-size:11px;color:rgba(255,245,230,0.45);margin-top:2px;letter-spacing:0.5px;text-transform:uppercase;">Daily Digest</span>
          </td>
          <td align="right"><span style="font-size:12px;color:rgba(255,245,230,0.45);">{today_str}</span></td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:28px 32px 0;">
        <p style="margin:0;font-size:24px;font-weight:600;color:#251508;line-height:1.2;">Good morning, {name}.</p>
        <p style="margin:8px 0 0;font-size:14px;color:#9c7e65;line-height:1.5;">{summary}</p>
      </td></tr>

      <tr><td style="padding:20px 32px 0;"><div style="height:1px;background:#f0e6d4;"></div></td></tr>

      <tr><td style="padding:20px 32px 0;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:600;color:#9c7e65;letter-spacing:1px;text-transform:uppercase;">Today's Schedule</p>
        {schedule_rows}
      </td></tr>

      {overdue_block}
      {upcoming_block}
      {habits_block}
      {stat_block}

      <tr><td style="padding:28px 32px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:#b8723a;border-radius:10px;">
            <a href="#" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fffcf7;text-decoration:none;">Open planit →</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#faf4ea;border-top:1px solid #e8dcc8;padding:14px 32px;border-radius:0 0 20px 20px;">
        <p style="margin:0;font-size:12px;color:#9c7e65;line-height:1.6;">
          You're receiving this because daily digest is enabled in your planit settings.
          Manage in <a href="#" style="color:#b8723a;text-decoration:none;">settings</a>.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>"""
