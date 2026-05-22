from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


DATA_DIR = Path.home() / "AppData" / "Local" / "CRMIA"
DB_PATH = DATA_DIR / "crm.sqlite3"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                company TEXT,
                title TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                next_action TEXT,
                suggested_message TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS imports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            );

            CREATE TABLE IF NOT EXISTS import_candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_id INTEGER NOT NULL,
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
                created_at TEXT NOT NULL,
                FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                message TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reporting_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            );

            CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
            CREATE INDEX IF NOT EXISTS idx_import_candidates_import_id ON import_candidates(import_id);
            CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at);
            CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_date ON reporting_snapshots(snapshot_date);
            """
        )
        ensure_column(conn, "imports", "mime_type", "TEXT")
        ensure_column(conn, "imports", "total_ready", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "imports", "total_duplicates", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "imports", "total_invalid", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "imports", "confirmed_contacts", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "imports", "status", "TEXT NOT NULL DEFAULT 'draft'")
        ensure_column(conn, "imports", "confirmed_at", "TEXT")
        ensure_column(conn, "contacts", "next_action", "TEXT")
        ensure_column(conn, "contacts", "suggested_message", "TEXT")
        ensure_column(conn, "contacts", "follow_up_date", "TEXT")
        ensure_column(conn, "contacts", "portal_url", "TEXT")
        ensure_column(conn, "contacts", "portal_status", "TEXT")
        ensure_column(conn, "contacts", "discard_reason", "TEXT")
        ensure_column(conn, "import_candidates", "next_action", "TEXT")
        ensure_column(conn, "import_candidates", "suggested_message", "TEXT")
        ensure_column(conn, "reporting_snapshots", "total_contacts", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "active_total", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "overdue_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "due_today_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "due_this_week_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "without_date_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "reporting_snapshots", "statuses_json", "TEXT")
        ensure_column(conn, "reporting_snapshots", "actions_json", "TEXT")
        ensure_column(conn, "reporting_snapshots", "updated_at", "TEXT")


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def insert_history(
    conn: sqlite3.Connection,
    *,
    event_type: str,
    entity_type: str,
    entity_id: str | None,
    message: str,
    metadata_json: str | None = None,
) -> int:
    cursor = conn.execute(
        """
        INSERT INTO history (
            event_type,
            entity_type,
            entity_id,
            message,
            metadata_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            event_type,
            entity_type,
            entity_id,
            message,
            metadata_json,
            now_iso(),
        ),
    )
    return int(cursor.lastrowid)


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    existing = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in existing:
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
