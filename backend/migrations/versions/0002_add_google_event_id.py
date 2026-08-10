"""Add google_event_id column to task table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})")).mappings().all()
    return any(row["name"] == column for row in result)


def upgrade() -> None:
    if not _column_exists("task", "google_event_id"):
        with op.batch_alter_table("task") as batch_op:
            batch_op.add_column(sa.Column("google_event_id", sa.String(), nullable=True))


def downgrade() -> None:
    if _column_exists("task", "google_event_id"):
        with op.batch_alter_table("task") as batch_op:
            batch_op.drop_column("google_event_id")
