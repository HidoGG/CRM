"""Reenvío automático programado por chat del Asistente de RRHH.

Cada career_session puede tener una tanda de reenvíos propia: mismo email +
mismo CV, al mismo destinatario, en horarios exactos elegidos por el usuario
(ej. 08:00 y 13:00) durante varios días. Cada envío programado es una fila en
career_resend_jobs — mismo patrón que email_jobs (scheduled_at/status/sent_at).

- career_sessions.recipient_email: destinatario guardado para la tanda (antes
  el "to" no se persistía, se tipeaba en cada envío manual).
- career_resend_jobs: una fila por envío automático programado.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-24
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS recipient_email TEXT")
    op.execute("""
        CREATE TABLE IF NOT EXISTS career_resend_jobs (
            id            SERIAL PRIMARY KEY,
            session_id    INTEGER NOT NULL REFERENCES career_sessions(id) ON DELETE CASCADE,
            scheduled_at  TIMESTAMPTZ NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending',
            sent_at       TIMESTAMPTZ,
            error_message TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_career_resend_jobs_session ON career_resend_jobs (session_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_career_resend_jobs_due "
        "ON career_resend_jobs (scheduled_at) WHERE status = 'pending'"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS career_resend_jobs")
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS recipient_email")
