from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
CREDENTIALS_FILE = Path(__file__).parent.parent / "credentials.json"
TOKEN_FILE = Path(__file__).parent.parent / "token.json"
_VERIFIER_FILE = Path(__file__).parent.parent / ".oauth_verifier"


def _backend_url() -> str:
    return os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")


def _get_client_config() -> dict:
    """Lee credenciales desde credentials.json o desde variables de entorno."""
    if CREDENTIALS_FILE.exists():
        with open(CREDENTIALS_FILE) as f:
            return json.load(f)

    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise RuntimeError(
            "Gmail no configurado: falta credentials.json o las variables "
            "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
        )
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://accounts.google.com/o/oauth2/token",
            "redirect_uris": [f"{_backend_url()}/gmail/callback"],
        }
    }


# ---------------------------------------------------------------------------
# Token persistido en DB (para produccion) o en archivo (local)
# ---------------------------------------------------------------------------

def _load_token_str() -> str | None:
    """Carga el token desde DB o desde archivo local."""
    # Primero intenta desde la DB
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            row = session.execute(
                text("SELECT value FROM system_settings WHERE key = 'gmail_token'")
            ).fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    # Fallback: archivo local
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text()
    return None


def _save_token_str(token_json: str) -> None:
    """Guarda el token en DB y en archivo local si es posible."""
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            session.execute(text("""
                INSERT INTO system_settings (key, value) VALUES ('gmail_token', :v)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """), {"v": token_json})
    except Exception:
        pass
    # También guarda en archivo local como respaldo
    try:
        TOKEN_FILE.write_text(token_json)
    except Exception:
        pass


def _generate_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(96)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def _load_verifier() -> str | None:
    """Carga el PKCE verifier desde DB o archivo."""
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            row = session.execute(
                text("SELECT value FROM system_settings WHERE key = 'oauth_verifier'")
            ).fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    if _VERIFIER_FILE.exists():
        return _VERIFIER_FILE.read_text().strip()
    return None


def _save_verifier(verifier: str) -> None:
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            session.execute(text("""
                INSERT INTO system_settings (key, value) VALUES ('oauth_verifier', :v)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """), {"v": verifier})
    except Exception:
        pass
    try:
        _VERIFIER_FILE.write_text(verifier)
    except Exception:
        pass


def _delete_verifier() -> None:
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            session.execute(
                text("DELETE FROM system_settings WHERE key = 'oauth_verifier'")
            )
    except Exception:
        pass
    if _VERIFIER_FILE.exists():
        try:
            _VERIFIER_FILE.unlink()
        except Exception:
            pass


def _get_credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    token_str = _load_token_str()
    if not token_str:
        return None

    creds = Credentials.from_authorized_user_info(json.loads(token_str), SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_token_str(creds.to_json())
        return creds
    return None


def get_auth_url() -> str:
    from google_auth_oauthlib.flow import Flow

    verifier, challenge = _generate_pkce()
    _save_verifier(verifier)

    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=f"{_backend_url()}/gmail/callback",
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        code_challenge=challenge,
        code_challenge_method="S256",
    )
    return auth_url


def exchange_code(code: str) -> None:
    from google_auth_oauthlib.flow import Flow

    verifier = _load_verifier()

    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=f"{_backend_url()}/gmail/callback",
    )
    kwargs: dict = {"code": code}
    if verifier:
        kwargs["code_verifier"] = verifier
    flow.fetch_token(**kwargs)
    _save_token_str(flow.credentials.to_json())
    _delete_verifier()


def is_authorized() -> bool:
    return _get_credentials() is not None


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    cv_path: str | None = None,
    cv_filename: str | None = None,
) -> str:
    from googleapiclient.discovery import build

    creds = _get_credentials()
    if not creds:
        raise RuntimeError("Gmail no está autorizado. Completá el flujo OAuth primero.")

    service = build("gmail", "v1", credentials=creds)

    msg = MIMEMultipart()
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if cv_path and Path(cv_path).exists():
        with open(cv_path, "rb") as f:
            part = MIMEApplication(f.read(), Name=cv_filename or Path(cv_path).name)
        part["Content-Disposition"] = f'attachment; filename="{cv_filename or Path(cv_path).name}"'
        msg.attach(part)

    msg["To"] = to
    msg["Subject"] = subject

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()
    return result.get("id", "")


def get_status() -> dict:
    try:
        _get_client_config()
    except RuntimeError as e:
        return {"authorized": False, "reason": str(e)}
    creds = _get_credentials()
    if not creds:
        return {"authorized": False, "reason": "Token no generado. Completá la autorización."}
    return {"authorized": True, "reason": "Listo para enviar"}
