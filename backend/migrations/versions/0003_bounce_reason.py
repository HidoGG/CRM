"""Agrega columna bounce_reason a contacts.

Almacena el motivo clasificado del rebote detectado via Sync Gmail.
Valores posibles: usuario_inexistente, casilla_llena, dominio_invalido,
casilla_desactivada, rechazado_politica, persona_no_trabaja,
rebote_temporario, rebote_email (genérico).

Idempotente: usa IF NOT EXISTS — seguro en producción sin downtime.

Referencias:
- RFC 3464 (DSN): https://www.rfc-editor.org/rfc/rfc3464
- RFC 3463 (Enhanced status codes): https://www.rfc-editor.org/rfc/rfc3463

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-21
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bounce_reason TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS bounce_reason")
