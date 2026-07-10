"""Agrega columna cv_content a career_sessions para guardar el CV generado por el agente.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-27
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS cv_content TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS cv_content")
