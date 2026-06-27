"""Crea tablas para el agente de RRHH: career_sessions y career_messages.

career_sessions: una fila por búsqueda analizada. Guarda empresa, cargo,
resumen de requisitos y el email generado, para referencia rápida.

career_messages: historial de chat de cada sesión (rol user/assistant).

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-26
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS career_sessions (
            id          SERIAL PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'Nueva búsqueda',
            company     TEXT,
            role        TEXT,
            summary     TEXT,
            email_subject TEXT,
            email_body  TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS career_messages (
            id          SERIAL PRIMARY KEY,
            session_id  INTEGER NOT NULL REFERENCES career_sessions(id) ON DELETE CASCADE,
            role        TEXT NOT NULL,
            content     TEXT NOT NULL,
            has_image   BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_career_messages_session ON career_messages(session_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS career_messages")
    op.execute("DROP TABLE IF EXISTS career_sessions")
