"""Agrega clasificación de rubros a contactos.

Cambios:
- contacts.industry TEXT: sector detectado (oilgas/industria/generalista/tecnologia)
- company_sectors: memoria empresa → sector (evita reclasificar cada vez)
- sector_defaults: mapeo sector → template_id / cv_file_id por defecto

Idempotente: usa IF NOT EXISTS / ON CONFLICT — seguro en producción.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-24
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS industry TEXT")

    op.execute("""
        CREATE TABLE IF NOT EXISTS company_sectors (
            company_name TEXT PRIMARY KEY,
            industry     TEXT NOT NULL,
            updated_at   TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS sector_defaults (
            sector      TEXT PRIMARY KEY,
            template_id INT REFERENCES message_templates(id) ON DELETE SET NULL,
            cv_file_id  INT REFERENCES cv_files(id) ON DELETE SET NULL
        )
    """)

    op.execute("""
        INSERT INTO sector_defaults (sector) VALUES
            ('oilgas'), ('industria'), ('generalista'), ('tecnologia')
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sector_defaults")
    op.execute("DROP TABLE IF EXISTS company_sectors")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS industry")
