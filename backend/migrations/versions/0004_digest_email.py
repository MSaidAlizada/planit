"""Add email verification and digest preferences.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})")).mappings().all()
    return any(row["name"] == column for row in result)


def upgrade() -> None:
    # User — email fields
    with op.batch_alter_table("user") as batch_op:
        if not _column_exists("user", "email"):
            batch_op.add_column(sa.Column("email", sa.String(), nullable=False, server_default=""))
        if not _column_exists("user", "email_verified"):
            batch_op.add_column(sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="0"))
        if not _column_exists("user", "email_verify_token"):
            batch_op.add_column(sa.Column("email_verify_token", sa.String(), nullable=False, server_default=""))
        if not _column_exists("user", "email_verify_expires"):
            batch_op.add_column(sa.Column("email_verify_expires", sa.DateTime(), nullable=True))

    # Preference — digest fields
    with op.batch_alter_table("preference") as batch_op:
        if not _column_exists("preference", "digest_enabled"):
            batch_op.add_column(sa.Column("digest_enabled", sa.Boolean(), nullable=False, server_default="0"))
        if not _column_exists("preference", "digest_frequency"):
            batch_op.add_column(sa.Column("digest_frequency", sa.String(), nullable=False, server_default="daily"))
        if not _column_exists("preference", "digest_time"):
            batch_op.add_column(sa.Column("digest_time", sa.String(), nullable=False, server_default="07:00"))
        if not _column_exists("preference", "digest_day"):
            batch_op.add_column(sa.Column("digest_day", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    with op.batch_alter_table("preference") as batch_op:
        for col in ("digest_day", "digest_time", "digest_frequency", "digest_enabled"):
            if _column_exists("preference", col):
                batch_op.drop_column(col)

    with op.batch_alter_table("user") as batch_op:
        for col in ("email_verify_expires", "email_verify_token", "email_verified", "email"):
            if _column_exists("user", col):
                batch_op.drop_column(col)
