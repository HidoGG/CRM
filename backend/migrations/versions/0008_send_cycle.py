"""Agrega last_sent_at a contacts y tabla app_settings para ciclo de envío.

- contacts.last_sent_at: timestamp del último email enviado a ese contacto.
- app_settings: tabla clave-valor para configuración del sistema.
  Inicializa 'cycle_started_at' con la fecha actual.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-09
"""
from alembic import op
from datetime import datetime, timezone

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ")
    op.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('cycle_started_at', NOW()::TEXT, NOW())
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS last_sent_at")
    op.execute("DROP TABLE IF EXISTS app_settings")
