"""Auth hardening: refresh tokens, invite codes, account lockout, admin flag.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})")).mappings().all()
    return any(row["name"] == column for row in result)


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"), {"t": table}
    ).first()
    return result is not None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch_op:
        if not _column_exists("user", "is_admin"):
            batch_op.add_column(sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="0"))
        if not _column_exists("user", "failed_login_attempts"):
            batch_op.add_column(sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"))
        if not _column_exists("user", "locked_until"):
            batch_op.add_column(sa.Column("locked_until", sa.DateTime(), nullable=True))

    if not _table_exists("refreshtoken"):
        op.create_table(
            "refreshtoken",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("family_id", sa.Uuid(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False, unique=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_refreshtoken_user_id", "refreshtoken", ["user_id"])
        op.create_index("ix_refreshtoken_family_id", "refreshtoken", ["family_id"])
        op.create_index("ix_refreshtoken_token_hash", "refreshtoken", ["token_hash"], unique=True)

    if not _table_exists("invitecode"):
        op.create_table(
            "invitecode",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("code", sa.String(), nullable=False, unique=True),
            sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        )
        op.create_index("ix_invitecode_code", "invitecode", ["code"], unique=True)


def downgrade() -> None:
    if _table_exists("invitecode"):
        op.drop_table("invitecode")
    if _table_exists("refreshtoken"):
        op.drop_table("refreshtoken")
    with op.batch_alter_table("user") as batch_op:
        for col in ("locked_until", "failed_login_attempts", "is_admin"):
            if _column_exists("user", col):
                batch_op.drop_column(col)
