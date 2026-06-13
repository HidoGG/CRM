"""Baseline: esquema completo con tipos finales.

Idempotente (IF NOT EXISTS): en una base existente creada por el viejo
init_db() no toca nada — la conversión de tipos la hace la revisión 0002.
En una base nueva crea todo directamente con los tipos correctos.

Revision ID: 0001
Revises:
Create Date: 2026-06-12
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            company TEXT,
            title TEXT,
            status TEXT NOT NULL DEFAULT 'revisar',
            next_action TEXT,
            suggested_message TEXT,
            follow_up_date DATE,
            portal_url TEXT,
            portal_status TEXT,
            discard_reason TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            notes TEXT,
            replied_at TIMESTAMPTZ,
            bounced_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS imports (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL,
            mime_type TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            total_contacts INTEGER NOT NULL DEFAULT 0,
            total_ready INTEGER NOT NULL DEFAULT 0,
            total_duplicates INTEGER NOT NULL DEFAULT 0,
            total_invalid INTEGER NOT NULL DEFAULT 0,
            confirmed_contacts INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            confirmed_at TIMESTAMPTZ
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS import_candidates (
            id SERIAL PRIMARY KEY,
            import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
            email TEXT,
            name TEXT NOT NULL,
            company TEXT,
            title TEXT,
            status TEXT NOT NULL DEFAULT 'revisar',
            next_action TEXT,
            suggested_message TEXT,
            source TEXT NOT NULL DEFAULT 'importacion',
            notes TEXT,
            raw_text TEXT,
            decision TEXT NOT NULL DEFAULT 'pending',
            reason TEXT,
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id SERIAL PRIMARY KEY,
            event_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            message TEXT NOT NULL,
            metadata_json TEXT,
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS reporting_snapshots (
            id SERIAL PRIMARY KEY,
            snapshot_date DATE NOT NULL UNIQUE,
            total_contacts INTEGER NOT NULL DEFAULT 0,
            active_total INTEGER NOT NULL DEFAULT 0,
            overdue_count INTEGER NOT NULL DEFAULT 0,
            due_today_count INTEGER NOT NULL DEFAULT 0,
            due_this_week_count INTEGER NOT NULL DEFAULT 0,
            without_date_count INTEGER NOT NULL DEFAULT 0,
            statuses_json TEXT,
            actions_json TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS message_templates (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS cv_files (
            id SERIAL PRIMARY KEY,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            comment TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS delivery_schedules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            interval_minutes INTEGER NOT NULL DEFAULT 30,
            start_hour_art INTEGER NOT NULL DEFAULT 8,
            end_hour_art INTEGER NOT NULL DEFAULT 18,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS email_jobs (
            id SERIAL PRIMARY KEY,
            contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
            template_id INTEGER REFERENCES message_templates(id) ON DELETE SET NULL,
            cv_file_id INTEGER REFERENCES cv_files(id) ON DELETE SET NULL,
            frequency_days INTEGER NOT NULL DEFAULT 0,
            schedule_id INTEGER REFERENCES delivery_schedules(id) ON DELETE SET NULL,
            scheduled_at TIMESTAMPTZ NOT NULL,
            sent_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            gmail_message_id TEXT,
            thread_id TEXT,
            replied_at TIMESTAMPTZ,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_import_candidates_import_id ON import_candidates(import_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_date ON reporting_snapshots(snapshot_date)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_jobs_scheduled ON email_jobs(scheduled_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_jobs_schedule ON email_jobs(schedule_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_email_jobs_pending_sched ON email_jobs(status, scheduled_at)")


def downgrade() -> None:
    # Baseline: no se revierte (sería destruir todos los datos).
    raise RuntimeError("No se puede revertir la migración baseline.")
