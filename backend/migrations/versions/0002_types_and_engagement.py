"""Conversión TEXT → timestamptz/date + columnas de engagement y retry.

Para bases creadas por el viejo init_db() (columnas TEXT con strings ISO):
- Convierte timestamps a timestamptz y fechas a date. Los strings sin offset
  se interpretan como UTC (SET LOCAL TimeZone = 'UTC'): el código viejo
  generaba tanto '...+00:00' como naive-UTC (reprogramaciones de ventana).
- Agrega las columnas nuevas: retry_count, thread_id, replied_at (jobs)
  y replied_at, bounced_at (contacts).

Idempotente: cada ALTER TYPE se ejecuta sólo si la columna sigue siendo TEXT
(en bases nuevas la 0001 ya creó los tipos finales y esto es no-op).

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-12
"""
from alembic import op
from sqlalchemy import text

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# (tabla, columna, tipo destino)
_TIMESTAMP_COLUMNS = [
    ("contacts", "created_at", "timestamptz"),
    ("contacts", "updated_at", "timestamptz"),
    ("contacts", "follow_up_date", "date"),
    ("imports", "created_at", "timestamptz"),
    ("imports", "confirmed_at", "timestamptz"),
    ("import_candidates", "created_at", "timestamptz"),
    ("history", "created_at", "timestamptz"),
    ("reporting_snapshots", "snapshot_date", "date"),
    ("reporting_snapshots", "created_at", "timestamptz"),
    ("reporting_snapshots", "updated_at", "timestamptz"),
    ("message_templates", "created_at", "timestamptz"),
    ("message_templates", "updated_at", "timestamptz"),
    ("cv_files", "created_at", "timestamptz"),
    ("delivery_schedules", "created_at", "timestamptz"),
    ("email_jobs", "scheduled_at", "timestamptz"),
    ("email_jobs", "sent_at", "timestamptz"),
    ("email_jobs", "created_at", "timestamptz"),
]


def _column_is_text(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text("""
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table AND column_name = :column
        """),
        {"table": table, "column": column},
    ).fetchone()
    return row is not None and row[0] == "text"


def upgrade() -> None:
    conn = op.get_bind()

    # Los strings ISO sin offset deben interpretarse como UTC al castear.
    conn.execute(text("SET LOCAL TimeZone = 'UTC'"))

    for table, column, target_type in _TIMESTAMP_COLUMNS:
        if _column_is_text(conn, table, column):
            conn.execute(text(
                f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {target_type} "
                f"USING NULLIF(TRIM({column}), '')::{target_type}"
            ))

    # Columnas nuevas (no-op en bases creadas por la 0001)
    op.execute("ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS thread_id TEXT")
    op.execute("ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ")
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ")
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id)")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("SET LOCAL TimeZone = 'UTC'"))
    for table, column, _ in _TIMESTAMP_COLUMNS:
        if not _column_is_text(conn, table, column):
            conn.execute(text(
                f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT "
                f"USING {column}::text"
            ))
    op.execute("ALTER TABLE email_jobs DROP COLUMN IF EXISTS retry_count")
    op.execute("ALTER TABLE email_jobs DROP COLUMN IF EXISTS thread_id")
    op.execute("ALTER TABLE email_jobs DROP COLUMN IF EXISTS replied_at")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS replied_at")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS bounced_at")
