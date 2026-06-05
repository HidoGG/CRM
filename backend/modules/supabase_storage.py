from __future__ import annotations

import os

from supabase import create_client


def _client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def _bucket() -> str:
    return os.getenv("SUPABASE_STORAGE_BUCKET", "cvs")


def upload(file_bytes: bytes, object_key: str) -> str:
    """Sube bytes al bucket de Storage. Devuelve el object_key."""
    _client().storage.from_(_bucket()).upload(
        path=object_key,
        file=file_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    return object_key


def download(object_key: str) -> bytes:
    """Descarga un CV del bucket. Lanza RuntimeError si no existe."""
    try:
        data = _client().storage.from_(_bucket()).download(path=object_key)
        return bytes(data)
    except Exception as exc:
        raise RuntimeError(
            f"No se pudo descargar el CV '{object_key}' de Supabase Storage: {exc}. "
            "Borrá el registro y volvé a subir el CV desde la sección Envíos."
        ) from exc


def delete(object_key: str) -> None:
    """Elimina un CV del bucket (best-effort, no lanza si no existe)."""
    try:
        _client().storage.from_(_bucket()).remove(paths=[object_key])
    except Exception:
        pass
