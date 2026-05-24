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


def _generate_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(96)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def _get_credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        return creds
    return None


def get_auth_url() -> str:
    from google_auth_oauthlib.flow import Flow

    verifier, challenge = _generate_pkce()
    _VERIFIER_FILE.write_text(verifier)

    flow = Flow.from_client_secrets_file(
        str(CREDENTIALS_FILE),
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

    verifier = _VERIFIER_FILE.read_text().strip() if _VERIFIER_FILE.exists() else None

    flow = Flow.from_client_secrets_file(
        str(CREDENTIALS_FILE),
        scopes=SCOPES,
        redirect_uri=f"{_backend_url()}/gmail/callback",
    )
    kwargs: dict = {"code": code}
    if verifier:
        kwargs["code_verifier"] = verifier
    flow.fetch_token(**kwargs)
    TOKEN_FILE.write_text(flow.credentials.to_json())
    if _VERIFIER_FILE.exists():
        _VERIFIER_FILE.unlink()


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

    if cv_path and Path(cv_path).exists():
        msg = MIMEMultipart()
        msg.attach(MIMEText(body, "plain", "utf-8"))
        with open(cv_path, "rb") as f:
            part = MIMEApplication(f.read(), Name=cv_filename or Path(cv_path).name)
        part["Content-Disposition"] = f'attachment; filename="{cv_filename or Path(cv_path).name}"'
        msg.attach(part)
    else:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body, "plain", "utf-8"))

    msg["To"] = to
    msg["Subject"] = subject

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()
    return result.get("id", "")


def get_status() -> dict:
    if not CREDENTIALS_FILE.exists():
        return {"authorized": False, "reason": "credentials.json no encontrado"}
    creds = _get_credentials()
    if not creds:
        return {"authorized": False, "reason": "Token no generado. Completá la autorización."}
    return {"authorized": True, "reason": "Listo para enviar"}
