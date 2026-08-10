from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(settings.database_url, echo=False)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"

_USER_ID_TABLES = [
    "task",
    "habit",
    "habitcompletion",
    "category",
    "calendarevent",
    "preference",
    "calendarfeed",
    "googlecredential",
]


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_task_category_name()   # legacy — pre-Alembic
    _migrate_add_user_id()           # legacy — pre-Alembic
    _migrate_task_google_event_id()  # legacy — safety guard; Alembic 0002 also handles this
    _migrate_task_context_name()     # legacy — safety guard; Alembic 0003 also handles this
    _run_alembic_migrations()


def _run_alembic_migrations() -> None:
    """Run pending Alembic migrations (idempotent — safe to call every startup)."""
    if not _ALEMBIC_INI.exists():
        return
    try:
        from alembic.config import Config
        from alembic import command as alembic_cmd

        cfg = Config(str(_ALEMBIC_INI))
        alembic_cmd.upgrade(cfg, "head")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Alembic migration failed: %s", exc)


def _migrate_task_category_name() -> None:
    from sqlalchemy import text

    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(task)")).mappings().all()
        has_category_name = any(column["name"] == "category_name" for column in columns)
        if not has_category_name:
            conn.execute(text("ALTER TABLE task ADD COLUMN category_name VARCHAR"))


def _migrate_add_user_id() -> None:
    """Add user_id column to all data tables if missing, then backfill from the first user."""
    from sqlalchemy import text

    with engine.begin() as conn:
        first_user = conn.execute(text("SELECT id FROM user ORDER BY rowid LIMIT 1")).fetchone()
        first_user_id = str(first_user[0]) if first_user else None

        for table in _USER_ID_TABLES:
            cols = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
            has_user_id = any(c["name"] == "user_id" for c in cols)
            if not has_user_id:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id VARCHAR"))
                if first_user_id:
                    conn.execute(
                        text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"),
                        {"uid": first_user_id},
                    )


def _migrate_task_google_event_id() -> None:
    from sqlalchemy import text

    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(task)")).mappings().all()
        if not any(c["name"] == "google_event_id" for c in columns):
            conn.execute(text("ALTER TABLE task ADD COLUMN google_event_id VARCHAR"))


def _migrate_task_context_name() -> None:
    from sqlalchemy import text

    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(task)")).mappings().all()
        if not any(c["name"] == "context_name" for c in columns):
            conn.execute(text("ALTER TABLE task ADD COLUMN context_name VARCHAR"))


def get_session() -> Session:
    return Session(engine)
