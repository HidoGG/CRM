from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from sqlalchemy import text
from sqlmodel import Session, create_engine


DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=2,
    max_overflow=0,
    connect_args={"prepare_threshold": None},
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def init_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                company TEXT,
                title TEXT,
                status TEXT NOT NULL DEFAULT 'revisar',
                next_action TEXT,
                suggested_message TEXT,
                follow_up_date TEXT,
                portal_url TEXT,
                portal_status TEXT,
                discard_reason TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
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
                created_at TEXT NOT NULL,
                confirmed_at TEXT
            )
        """))
        conn.execute(text("""
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
                created_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                message TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reporting_snapshots (
                id SERIAL PRIMARY KEY,
                snapshot_date TEXT NOT NULL UNIQUE,
                total_contacts INTEGER NOT NULL DEFAULT 0,
                active_total INTEGER NOT NULL DEFAULT 0,
                overdue_count INTEGER NOT NULL DEFAULT 0,
                due_today_count INTEGER NOT NULL DEFAULT 0,
                due_this_week_count INTEGER NOT NULL DEFAULT 0,
                without_date_count INTEGER NOT NULL DEFAULT 0,
                statuses_json TEXT,
                actions_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_import_candidates_import_id ON import_candidates(import_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_date ON reporting_snapshots(snapshot_date)"))
        conn.commit()


def row_to_dict(row) -> dict:
    return dict(row._mapping)


def insert_history(
    session: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: str | None,
    message: str,
    metadata_json: str | None = None,
) -> int:
    result = session.execute(
        text("""
            INSERT INTO history (event_type, entity_type, entity_id, message, metadata_json, created_at)
            VALUES (:event_type, :entity_type, :entity_id, :message, :metadata_json, :created_at)
            RETURNING id
        """),
        {
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "message": message,
            "metadata_json": metadata_json,
            "created_at": now_iso(),
        },
    )
    return int(result.fetchone()[0])
