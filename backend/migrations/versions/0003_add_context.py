"""Add context table and task.context_name column.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": name},
    ).fetchone()
    return result is not None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})")).mappings().all()
    return any(row["name"] == column for row in result)


def upgrade() -> None:
    if not _table_exists("context"):
        op.create_table(
            "context",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("color", sa.String(), nullable=False, server_default="#7b9e87"),
            sa.Column("availability", sa.String(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_context_user_id", "context", ["user_id"])

    if not _column_exists("task", "context_name"):
        with op.batch_alter_table("task") as batch_op:
            batch_op.add_column(sa.Column("context_name", sa.String(), nullable=True))


def downgrade() -> None:
    if _column_exists("task", "context_name"):
        with op.batch_alter_table("task") as batch_op:
            batch_op.drop_column("context_name")

    if _table_exists("context"):
        op.drop_index("ix_context_user_id", table_name="context")
        op.drop_table("context")
