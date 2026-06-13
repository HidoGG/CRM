from __future__ import annotations

import os
import time

from supabase import Client, create_client

_supabase: Client | None = None


def _client() -> Client:
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _supabase = create_client(url, key)
    return _supabase


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


def download(object_key: str, *, retries: int = 3) -> bytes:
    """Descarga un CV del bucket con retry + exponential backoff.

    La Python SDK de Supabase v2 no tiene retry automático a diferencia de la JS SDK.
    Errores transitorios de red fallan el job permanentemente sin este wrapper.
    """
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            data = _client().storage.from_(_bucket()).download(path=object_key)
            return bytes(data)
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                print(
                    f"[supabase_storage] Intento {attempt + 1}/{retries} falló "
                    f"descargando '{object_key}': {exc}. Reintentando en {wait}s..."
                )
                time.sleep(wait)
    raise RuntimeError(
        f"No se pudo descargar el CV '{object_key}' tras {retries} intentos: {last_exc}. "
        "Borrá el registro y volvé a subir el CV desde la sección Envíos."
    ) from last_exc


def delete(object_key: str) -> None:
    """Elimina un CV del bucket (best-effort, no lanza si no existe)."""
    try:
        _client().storage.from_(_bucket()).remove(paths=[object_key])
    except Exception:
        pass
