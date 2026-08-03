"""Guarda la lista de keywords ATS detectadas por el asistente de RRHH.

Cambios:
- career_sessions.keywords_ats TEXT: lista de keywords ATS del aviso,
  separadas por coma, tal como las detecta el chat. Antes se perdían:
  el generador de CV reutilizaba el resumen como si fueran las keywords.

Idempotente: usa IF NOT EXISTS — seguro en producción.

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-03
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS keywords_ats TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS keywords_ats")
