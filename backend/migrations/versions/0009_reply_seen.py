"""Marca de "respuesta vista" para el panel de Respuestas recibidas.

Cambios:
- contacts.reply_seen_at TIMESTAMPTZ: cuándo el usuario marcó la respuesta
  como vista (botón "Visto" en Hoy). NULL = respuesta sin revisar.

Idempotente: usa IF NOT EXISTS — seguro en producción.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-16
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reply_seen_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS reply_seen_at")
