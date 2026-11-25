"""Varias imágenes por mensaje, detalle del aviso y edición del CV con /groq.

- career_messages.images JSONB: lista [{path, mime}] de las imágenes
  adjuntadas en el mensaje (puede haber varias). Los mensajes viejos siguen
  usando image_path/image_mime (una sola imagen).
- career_messages.agent TEXT: NULL = chat normal (Gemini); 'groq' = mensaje
  del comando /groq (corrección del CV). Los de Groq no se le mandan a Gemini
  como historial.
- career_sessions.aviso_detail TEXT: transcripción completa del aviso que
  guarda Gemini, para que la IA del CV (que no ve el aviso) tenga todo.
- career_sessions.cv_history JSONB: versiones anteriores del CV (para
  "/groq deshacer"), la más reciente al final.
- career_sessions.cv_user_notes TEXT: pedidos/datos que Gabriel dio con /groq
  — se respetan al regenerar el CV y la revisión automática los toma como
  datos reales.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-25
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_messages ADD COLUMN IF NOT EXISTS images JSONB")
    op.execute("ALTER TABLE career_messages ADD COLUMN IF NOT EXISTS agent TEXT")
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS aviso_detail TEXT")
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS cv_history JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE career_sessions ADD COLUMN IF NOT EXISTS cv_user_notes TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS cv_user_notes")
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS cv_history")
    op.execute("ALTER TABLE career_sessions DROP COLUMN IF EXISTS aviso_detail")
    op.execute("ALTER TABLE career_messages DROP COLUMN IF EXISTS agent")
    op.execute("ALTER TABLE career_messages DROP COLUMN IF EXISTS images")
