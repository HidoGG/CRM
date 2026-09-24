"""Guarda las imágenes adjuntadas en el chat del Asistente de RRHH.

Antes la imagen se mandaba a la IA para leerla una sola vez y se perdía —
solo quedaba el texto "[imagen adjunta]" como recordatorio. Ahora se guarda
en el mismo Storage donde ya se guardan los CVs, para poder verla/descargarla
después desde el chat.

- career_messages.image_path: object_key en Supabase Storage (NULL si el
  mensaje no tiene imagen, o si es un mensaje viejo de antes de este cambio).
- career_messages.image_mime: content-type original, para servirla bien al
  descargarla.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-24
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE career_messages ADD COLUMN IF NOT EXISTS image_path TEXT")
    op.execute("ALTER TABLE career_messages ADD COLUMN IF NOT EXISTS image_mime TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE career_messages DROP COLUMN IF EXISTS image_mime")
    op.execute("ALTER TABLE career_messages DROP COLUMN IF EXISTS image_path")
