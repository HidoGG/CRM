"""Agrega columnas para auto-respuestas y email alternativo en contacts.

- alternative_email: dirección de reenvío detectada en auto-respuestas
- autoreply_reason: tipo de ausencia clasificado (ausencia_temporal,
  licencia_medica, licencia_maternidad)

Idempotente: usa IF NOT EXISTS.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-07
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS alternative_email TEXT")
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS autoreply_reason TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS alternative_email")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS autoreply_reason")
