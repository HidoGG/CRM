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

# gmail.send: envío de correos. gmail.readonly: detección de respuestas y
# rebotes. Un token emitido sólo con gmail.send sigue sirviendo para enviar;
# las funciones de lectura informan que falta re-autorizar.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]
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
# Token persistido en DB (produccion) o en archivo (local)
# ---------------------------------------------------------------------------

def _load_token_str() -> str | None:
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
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text()
    return None


def _save_token_str(token_json: str) -> None:
    db_ok = False
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            session.execute(text("""
                INSERT INTO system_settings (key, value) VALUES ('gmail_token', :v)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """), {"v": token_json})
        db_ok = True
    except Exception as exc:
        print(f"[gmail_service] No se pudo guardar token en DB: {exc}")
    try:
        TOKEN_FILE.write_text(token_json)
    except Exception as exc:
        # Si tampoco se pudo en DB, el token se perdería: dejar registro claro.
        level = "CRÍTICO" if not db_ok else "aviso"
        print(f"[gmail_service] ({level}) No se pudo guardar token en archivo: {exc}")


def _clear_token() -> None:
    """Elimina el token de la DB y del archivo local. Fuerza re-autorización."""
    try:
        from modules.database import get_session
        from sqlalchemy import text
        with get_session() as session:
            session.execute(
                text("DELETE FROM system_settings WHERE key = 'gmail_token'")
            )
    except Exception:
        pass
    if TOKEN_FILE.exists():
        try:
            TOKEN_FILE.unlink()
        except Exception:
            pass


def _generate_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(96)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def _load_verifier() -> str | None:
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
    """Carga y refresca credenciales. Si el refresh falla, limpia el token."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    token_str = _load_token_str()
    if not token_str:
        return None

    try:
        creds = Credentials.from_authorized_user_info(json.loads(token_str), SCOPES)
    except Exception:
        _clear_token()
        return None

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            _save_token_str(creds.to_json())
            return creds
        except Exception as exc:
            # Token revocado o vencido sin posibilidad de refresh
            print(f"[gmail_service] Token refresh fallido, limpiando: {exc}")
            _clear_token()
            return None

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


def _build_service():
    """Construye el cliente de la Gmail API o lanza RuntimeError si no hay token."""
    from googleapiclient.discovery import build

    creds = _get_credentials()
    if not creds:
        raise RuntimeError(
            "Gmail no está autorizado. Completá el flujo OAuth desde la sección Envíos."
        )
    return build("gmail", "v1", credentials=creds)


def get_profile_email() -> str:
    """Email de la cuenta autorizada (vacío si no se pudo obtener)."""
    try:
        service = _build_service()
        profile = service.users().getProfile(userId="me").execute()
        return profile.get("emailAddress", "")
    except Exception as exc:
        print(f"[gmail_service] No se pudo obtener perfil: {exc}")
        return ""


def has_readonly_scope() -> bool:
    """¿El token ya otorgado incluye gmail.readonly?

    Se lee del token guardado (scopes realmente otorgados), no de SCOPES
    (scopes solicitados): un token viejo puede tener sólo gmail.send.
    """
    token_str = _load_token_str()
    if not token_str:
        return False
    try:
        granted = json.loads(token_str).get("scopes") or []
    except Exception:
        return False
    return "https://www.googleapis.com/auth/gmail.readonly" in granted


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    cv_bytes: bytes | None = None,
    cv_filename: str | None = None,
) -> dict:
    """Envía un email via Gmail API.

    Lanza RuntimeError si no hay credenciales.
    cv_bytes: contenido binario del PDF adjunto, descargado previamente de Supabase Storage.
    Retorna {"id": <gmail message id>, "thread_id": <gmail thread id>}.
    """
    service = _build_service()

    # Obtener email del remitente para el header From
    sender_email = ""
    try:
        profile = service.users().getProfile(userId="me").execute()
        sender_email = profile.get("emailAddress", "")
    except Exception as exc:
        print(f"[gmail_service] No se pudo obtener perfil del remitente: {exc}")

    msg = MIMEMultipart()
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if cv_bytes:
        name = cv_filename or "cv.pdf"
        part = MIMEApplication(cv_bytes, Name=name)
        part["Content-Disposition"] = f'attachment; filename="{name}"'
        msg.attach(part)

    if sender_email:
        msg["From"] = sender_email
    msg["To"] = to
    msg["Subject"] = subject

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()
    return {"id": result.get("id", ""), "thread_id": result.get("threadId", "")}


def create_draft(
    *,
    subject: str,
    body: str,
    to: str | None = None,
    cv_bytes: bytes | None = None,
    cv_filename: str | None = None,
) -> dict:
    """Crea un borrador en Gmail con asunto, cuerpo y CV adjunto opcional.

    Retorna {"draft_id": ..., "url": "https://mail.google.com/mail/u/0/#drafts/<id>"}.
    """
    service = _build_service()

    msg = MIMEMultipart()
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if cv_bytes:
        name = cv_filename or "cv.pdf"
        part = MIMEApplication(cv_bytes, Name=name)
        part["Content-Disposition"] = f'attachment; filename="{name}"'
        msg.attach(part)

    msg["Subject"] = subject
    if to:
        msg["To"] = to

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = service.users().drafts().create(
        userId="me",
        body={"message": {"raw": raw}},
    ).execute()
    draft_id = result.get("id", "")
    return {
        "draft_id": draft_id,
        "url": f"https://mail.google.com/mail/u/0/#drafts/{draft_id}",
    }


def get_status() -> dict:
    try:
        _get_client_config()
    except RuntimeError as e:
        return {"authorized": False, "has_readonly": False, "reason": str(e)}
    creds = _get_credentials()
    if not creds:
        return {
            "authorized": False,
            "has_readonly": False,
            "reason": "Token no generado. Completá la autorización.",
        }
    readonly = has_readonly_scope()
    reason = "Listo para enviar" if readonly else (
        "Listo para enviar. Para detectar respuestas y rebotes, "
        "volvé a autorizar Gmail (falta el permiso de lectura)."
    )
    return {"authorized": True, "has_readonly": readonly, "reason": reason}
