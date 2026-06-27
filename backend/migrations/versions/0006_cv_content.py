"""Agrega columna cv_content a career_sessions para guardar el CV generado por el agente.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-27
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS cv_content TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS cv_content")
