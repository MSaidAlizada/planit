"""Add timezone column to preference table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})")).mappings().all()
    return any(row["name"] == column for row in result)


def upgrade() -> None:
    with op.batch_alter_table("preference") as batch_op:
        if not _column_exists("preference", "timezone"):
            batch_op.add_column(sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"))


def downgrade() -> None:
    with op.batch_alter_table("preference") as batch_op:
        if _column_exists("preference", "timezone"):
            batch_op.drop_column("timezone")
