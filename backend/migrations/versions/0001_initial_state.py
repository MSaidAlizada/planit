"""Initial state — stamps existing databases at baseline without modifying schema.

All tables and columns that existed before Alembic was introduced are managed
by SQLModel's create_all() + legacy PRAGMA migrations in db.py. This revision
is a no-op that gives Alembic a starting point.

Revision ID: 0001
Revises:
Create Date: 2026-05-11
"""
from typing import Sequence, Union

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
