from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
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


def now_utc() -> datetime:
    """Instante actual UTC (aware). Se almacena en columnas timestamptz."""
    return datetime.now(timezone.utc).replace(microsecond=0)


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def run_migrations() -> None:
    """Aplica las migraciones Alembic pendientes al arrancar.

    El esquema es propiedad de Alembic (backend/migrations/versions).
    Corre ANTES de cualquier otra operación de DB: el código nuevo escribe
    datetime/date y requiere columnas timestamptz/date.
    """
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")
    print("[startup] Migraciones Alembic aplicadas (head).")


def init_db() -> None:
    """Tareas de runtime al arrancar (el DDL vive en las migraciones Alembic)."""
    with engine.connect() as conn:
        # Si ya existe algún cronograma sin default asignado, el primero pasa a ser default
        conn.execute(text("""
            UPDATE delivery_schedules SET is_default = 1
            WHERE id = (
                SELECT id FROM delivery_schedules ORDER BY id ASC LIMIT 1
            )
            AND NOT EXISTS (
                SELECT 1 FROM delivery_schedules WHERE is_default = 1
            )
        """))
        # Recovery: jobs que quedaron en 'processing' por un crash o restart anterior
        # vuelven a 'pending' para ser reintentados en el próximo ciclo.
        result = conn.execute(text(
            "UPDATE email_jobs SET status = 'pending', error_message = NULL WHERE status = 'processing'"
        ))
        if result.rowcount > 0:
            print(f"[startup] Recovery: {result.rowcount} job(s) 'processing' reseteados a 'pending'.")
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
            "created_at": now_utc(),
        },
    )
    return int(result.fetchone()[0])
