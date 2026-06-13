from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine

config = context.config


def _get_url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL no está definida para las migraciones.")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_get_url(), literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        _get_url(),
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None},
    )
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
