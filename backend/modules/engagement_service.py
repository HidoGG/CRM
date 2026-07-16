"""Engagement: detección de respuestas, rebotes y métricas de conversión.

Cierra el ciclo del outreach: hoy el CRM envía correos pero no sabe quién
contestó ni qué direcciones rebotaron. Mantener el bounce rate bajo es
crítico para no perder reputación del remitente en Gmail.

Requiere el scope gmail.readonly (además de gmail.send). Si el token vigente
no lo tiene, las funciones devuelven un resultado informativo sin lanzar.
"""
from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

_ART_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

from sqlalchemy import bindparam, text

from modules.database import get_session, insert_history, now_utc, row_to_dict

EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)

# ── Bounce reason helpers ──────────────────────────────────────────────────────
# Clasificación basada en:
#   RFC 3463 (Enhanced Mail System Status Codes): https://www.rfc-editor.org/rfc/rfc3463
#   RFC 3464 (DSN format): https://www.rfc-editor.org/rfc/rfc3464

# Mapeo de prefijo de status code (RFC 3463) → razón clasificada
_STATUS_CODE_MAP = [
    ("5.1.1", "usuario_inexistente"),   # Bad destination mailbox address
    ("5.1.2", "dominio_invalido"),      # Bad destination system address
    ("5.1.3", "direccion_invalida"),    # Bad destination mailbox address syntax
    ("5.1.6", "usuario_inexistente"),   # Mailbox moved permanently (no forwarding)
    ("5.2.1", "casilla_desactivada"),   # Mailbox disabled, not accepting messages
    ("5.2.2", "casilla_llena"),         # Mailbox full
    ("5.2.3", "tamano_excedido"),       # Message length exceeds administrative limit
    ("5.4.4", "dominio_invalido"),      # Unable to route (DNS failure)
    ("5.7.0", "rechazado_politica"),    # Other security/policy status
    ("5.7.1", "rechazado_politica"),    # Delivery not authorized
]

# Frases heurísticas: inglés + español (Gmail genera notificaciones en el idioma del usuario).
# Las frases en español cubren los rebotes generados por Google (mailer-daemon@googlemail.com)
# cuando no hay parte MIME message/delivery-status separada.
_HEURISTIC_RULES = [
    # Usuario inexistente
    (["user unknown", "no such user", "does not exist", "invalid user",
      "no mailbox", "bad destination", "user not found",
      "mailbox not found", "recipient not found",
      # español (Gmail)
      "no se encuentra o no puede recibir"], "usuario_inexistente"),
    # Casilla llena
    (["mailbox full", "over quota", "quota exceeded", "storage limit",
      "mailbox size limit", "user over quota",
      # español
      "casilla llena", "cuota excedida"], "casilla_llena"),
    # Dominio inválido / DNS
    (["domain not found", "host not found", "no mx", "invalid domain",
      "name or service not known", "domain lookup failed",
      "nxdomain", "domain name not found", "dns error",
      # español (Gmail: "no encontramos el dominio")
      "no encontramos el dominio", "dominio no encontrado"], "dominio_invalido"),
    # Cuenta desactivada
    (["account disabled", "account closed", "account deactivated",
      "mailbox disabled", "account does not exist", "inactive account",
      # variantes con "account" genérico + rechazo
      "account suspended"], "casilla_desactivada"),
    # Rechazado por política / spam
    (["spam", "blocked", "blacklist", "dmarc", "spf", "policy violation",
      "policy rejection", "rejected due to", "address rejected"], "rechazado_politica"),
    # Persona ya no trabaja ahí
    (["no longer works", "has left", "person has", "left the company",
      "no longer with", "no longer employed", "no longer at",
      # español
      "ya no trabaja", "no trabaja más"], "persona_no_trabaja"),
    # Rebote temporario
    (["temporary", "try again", "temporarily",
      # español (Gmail: "Hubo un problema temporal")
      "problema temporal", "entrega no se completó",
      "seguirá intentando"], "rebote_temporario"),
]


def _decode_part_data(data: str) -> str:
    """Decodifica base64url de Gmail API a string UTF-8."""
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    except Exception:
        return ""


def _find_mime_parts(payload: dict, mime_prefix: str) -> list[dict]:
    """Recorre recursivamente las partes MIME y devuelve las que coinciden."""
    results = []
    if payload.get("mimeType", "").lower().startswith(mime_prefix.lower()):
        results.append(payload)
    for part in payload.get("parts", []):
        results.extend(_find_mime_parts(part, mime_prefix))
    return results


def _parse_bounce_reason(payload: dict) -> str:
    """
    Clasifica el motivo de rebote a partir del payload de Gmail API (format=full).

    Estrategia en tres niveles:
    1. RFC 3464 DSN MIME: busca la parte message/delivery-status (fuente autoritativa).
    2. Regex sobre texto plano: Gmail embebe los campos Status/Diagnostic-Code
       directamente en el body text/plain en lugar de una parte MIME separada.
    3. Heurística de frases: cubre inglés y español para servidores no estándar.

    Referencias:
    - RFC 3464: https://www.rfc-editor.org/rfc/rfc3464
    - RFC 3463: https://www.rfc-editor.org/rfc/rfc3463
    """
    status_code = ""
    diagnostic_text = ""

    # Recopilar todo el texto plano del mensaje
    plain_parts = _find_mime_parts(payload, "text/plain")
    all_text = ""
    for part in plain_parts:
        all_text += " " + _decode_part_data(part.get("body", {}).get("data", "")).lower()
    all_text += " " + payload.get("snippet", "").lower()

    # Nivel 1: buscar parte MIME message/delivery-status (RFC 3464)
    dsn_parts = _find_mime_parts(payload, "message/delivery-status")
    for part in dsn_parts:
        raw = _decode_part_data(part.get("body", {}).get("data", ""))
        for line in raw.splitlines():
            key, _, val = line.partition(":")
            key_low = key.strip().lower()
            if key_low == "status" and not status_code:
                status_code = val.strip()
            elif key_low == "diagnostic-code" and not diagnostic_text:
                diagnostic_text = val.strip().lower()

    # Nivel 2: si no hubo parte DSN separada, extraer Status del texto plano.
    # Gmail embebe los campos RFC 3464 directamente en el text/plain body.
    if not status_code:
        m = re.search(r"\bstatus:\s*([45]\.\d+\.\d+)", all_text, re.IGNORECASE)
        if m:
            status_code = m.group(1).strip()
    if not diagnostic_text:
        m = re.search(r"diagnostic-code:\s*smtp;\s*(.+?)(?:\n|$)", all_text, re.IGNORECASE)
        if m:
            diagnostic_text = m.group(1).strip().lower()

    all_text = diagnostic_text + " " + all_text

    # Clasificar por código de status (RFC 3463) — fuente más confiable
    if status_code:
        for prefix, reason in _STATUS_CODE_MAP:
            if status_code.startswith(prefix):
                return reason
        if status_code.startswith("4."):
            return "rebote_temporario"
        if status_code.startswith("5."):
            return "direccion_invalida"

    # Nivel 3: heurística sobre texto (inglés + español)
    for keywords, reason in _HEURISTIC_RULES:
        if any(kw in all_text for kw in keywords):
            return reason

    return "rebote_email"  # fallback genérico


# ── Auto-reply (respuestas automáticas) ───────────────────────────────────────
# Ordenadas de más específico a más genérico para que la primera coincidencia gane.

_AUTOREPLY_REASON_RULES = [
    (["maternity leave", "paternity leave", "parental leave", "on maternity", "on paternity",
      "baby leave", "pregnancy leave",
      "licencia de maternidad", "licencia maternal", "licencia de paternidad",
      "licencia parental", "maternidad", "paternidad", "baja por maternidad",
      "baja maternal", "embarazada", "licencia por maternidad"],
     "licencia_maternidad"),
    (["medical leave", "sick leave", "medical absence", "health reasons",
      "on medical", "health issue", "ill health",
      "licencia médica", "licencia por enfermedad", "baja médica",
      "motivos de salud", "por enfermedad", "baja por enfermedad",
      "enfermedad", "internado", "licencia por salud"],
     "licencia_medica"),
    (["out of office", "on vacation", "away from the office", "on leave",
      "will be back", "currently away", "currently out", "will return",
      "back on", "out of the office until", "off until", "annual leave",
      "ausente", "fuera de la oficina", "de vacaciones", "en vacaciones",
      "regreso el", "estaré de vuelta", "no me encuentro",
      "no estoy disponible", "licencia", "periodo vacacional",
      "en este momento me encuentro fuera"],
     "ausencia_temporal"),
]

_AUTOREPLY_SUBJECT_KEYWORDS = [
    "automatic reply", "out of office", "autoreply", "auto-reply", "auto reply",
    "respuesta automática", "respuesta automatica", "fuera de la oficina",
    "ausencia temporal", "autorespuesta",
]

# Patrones contextuales para extraer email alternativo del cuerpo del mensaje
_ALT_EMAIL_CONTEXT_PATTERNS = [
    r"(?:please\s+)?(?:contact|email|reach)\s+[\w\s]{0,25}?(?:at|en)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    r"(?:please\s+)?(?:contact|email|write\s+to)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    r"forward(?:ing)?\s+(?:to|at)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    r"(?:puede[sn]?\s+)?(?:escribir|contactar|comunicar(?:se)?)\s+(?:a[l]?\s+)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    r"(?:escriba|escribirme|escribame)\s+(?:a\s+)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    r"(?:contactar\s+con|comunicarse\s+con)\s+\S+\s+(?:en|a[l]?)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
]

_KNOWN_NOREPLY_DOMAINS = {"google.com", "googlemail.com", "microsoft.com", "outlook.com"}


def _is_autoreply_message(header_map: dict, subject: str, body_snippet: str) -> bool:
    """Detecta si un mensaje es una auto-respuesta por headers, asunto y cuerpo."""
    auto_submitted = header_map.get("auto-submitted", "").lower()
    if auto_submitted and auto_submitted != "no":
        return True
    if header_map.get("x-autoreply") or header_map.get("x-autoresponder") or header_map.get("x-auto-response-suppress"):
        return True
    if any(kw in subject.lower() for kw in _AUTOREPLY_SUBJECT_KEYWORDS):
        return True
    autoreply_body_triggers = [
        "out of office", "fuera de la oficina", "this is an automatic",
        "esta es una respuesta automática", "auto-reply", "autorespuesta",
        "respuesta automática",
    ]
    return any(kw in body_snippet.lower() for kw in autoreply_body_triggers)


def _classify_autoreply_reason(text: str) -> str:
    """Clasifica el tipo de ausencia a partir del texto de la auto-respuesta."""
    text_lower = text.lower()
    for keywords, reason in _AUTOREPLY_REASON_RULES:
        if any(kw in text_lower for kw in keywords):
            return reason
    return "ausencia_temporal"


def _extract_alternative_email(body_text: str, original_email: str) -> str | None:
    """Extrae un email alternativo/de reenvío del cuerpo de la auto-respuesta."""
    original_lower = original_email.lower()
    text_lower = body_text.lower()

    # Primero prueba patrones contextuales (más precisos)
    for pattern in _ALT_EMAIL_CONTEXT_PATTERNS:
        m = re.search(pattern, text_lower, re.IGNORECASE)
        if m:
            candidate = m.group(1).lower()
            domain = candidate.split("@")[-1] if "@" in candidate else ""
            if candidate != original_lower and domain not in _KNOWN_NOREPLY_DOMAINS:
                return candidate

    # Fallback: si hay exactamente un email diferente en el cuerpo, es el alternativo
    all_emails = list({e.lower() for e in EMAIL_RE.findall(body_text)})
    others = [
        e for e in all_emails
        if e != original_lower
        and not any(e.endswith(f"@{d}") for d in _KNOWN_NOREPLY_DOMAINS)
        and "noreply" not in e
        and "no-reply" not in e
    ]
    return others[0] if len(others) == 1 else None


def _store_autoreply_detection(job: dict, reason: str, alt_email: str | None) -> None:
    """Persiste la detección de auto-respuesta: actualiza contacto e inserta historial."""
    now = now_utc()
    set_parts = [
        "autoreply_reason = :reason",
        "next_action = 'revisar'",
        "status = 'revisar'",
        "updated_at = :now",
    ]
    params: dict = {"reason": reason, "now": now, "id": job["contact_id"]}
    if alt_email:
        set_parts.append("alternative_email = :alt_email")
        params["alt_email"] = alt_email

    msg = f"Auto-respuesta de {job['email']} — motivo: {reason}"
    if alt_email:
        msg += f" — email alternativo: {alt_email}"

    with get_session() as session:
        session.execute(
            text(f"UPDATE contacts SET {', '.join(set_parts)} WHERE id = :id"),
            params,
        )
        session.execute(
            text("UPDATE email_jobs SET replied_at = :now WHERE id = :job_id AND replied_at IS NULL"),
            {"now": now, "job_id": job["id"]},
        )
        # El contacto pasa a 'revisar': cancelar su job pendiente para que no
        # se le siga enviando. "Volver a cola" lo re-crea si corresponde.
        session.execute(
            text("""
                UPDATE email_jobs SET status = 'cancelled', error_message = :err
                WHERE contact_id = :id AND status = 'pending'
            """),
            {"err": f"Auto-respuesta: {reason}", "id": job["contact_id"]},
        )
        insert_history(
            session,
            event_type="email.autoreply",
            entity_type="contact",
            entity_id=str(job["contact_id"]),
            message=msg,
            metadata_json=json.dumps(
                {"job_id": job["id"], "autoreply_reason": reason, "alternative_email": alt_email},
                ensure_ascii=True,
            ),
        )
    print(f"[engagement] Auto-respuesta: {job['email']} — {reason}" + (f" → {alt_email}" if alt_email else ""))


# Ventanas y límites conservadores de cuota:
# threads.get cuesta 10 unidades; 40 threads/ciclo = 400 unidades,
# muy por debajo del límite por usuario de la Gmail API.
REPLY_WINDOW_DAYS = 30
REPLY_BATCH_LIMIT = 40
BOUNCE_QUERY = "from:(mailer-daemon OR postmaster) newer_than:90d"
BOUNCE_BATCH_LIMIT = 25


def sync_replies_and_bounces() -> dict:
    """Job del scheduler (y endpoint manual): busca respuestas y rebotes."""
    from modules import gmail_service

    if not gmail_service.is_authorized():
        return {"ok": False, "reason": "Gmail no autorizado.", "replies_found": 0, "bounces_found": 0}
    if not gmail_service.has_readonly_scope():
        return {
            "ok": False,
            "reason": "El token actual no tiene permiso de lectura. Re-autorizá Gmail desde Envíos.",
            "replies_found": 0,
            "bounces_found": 0,
        }

    try:
        service = gmail_service._build_service()
    except Exception as exc:
        return {"ok": False, "reason": str(exc), "replies_found": 0, "bounces_found": 0}

    my_email = gmail_service.get_profile_email().lower()
    replies, threads_checked = _check_replies(service, my_email)
    bounces = _check_bounces(service)
    reclassified = _backfill_bounce_reasons(service)
    print(
        f"[engagement] Sync — threads revisados: {threads_checked}, "
        f"respuestas: {replies}, rebotes: {bounces}, reclasificados: {reclassified}"
    )
    return {
        "ok": True,
        "replies_found": replies,
        "bounces_found": bounces,
        "threads_checked": threads_checked,
    }


def _check_replies(service, my_email: str) -> tuple[int, int]:
    """Revisa los threads de jobs enviados sin respuesta registrada.

    Distingue entre respuesta real y auto-respuesta (vacaciones, enfermedad,
    maternidad, etc.). Las auto-respuestas actualizan autoreply_reason y
    alternative_email en el contacto sin marcarlo como seguimiento respondido.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=REPLY_WINDOW_DAYS)
    with get_session() as session:
        rows = session.execute(
            text("""
                SELECT ej.id, ej.contact_id, ej.thread_id, c.email
                FROM email_jobs ej
                JOIN contacts c ON ej.contact_id = c.id
                WHERE ej.status = 'sent'
                  AND ej.thread_id IS NOT NULL AND ej.thread_id != ''
                  AND ej.replied_at IS NULL
                  AND ej.sent_at >= :cutoff
                ORDER BY ej.sent_at DESC
                LIMIT :limit
            """),
            {"cutoff": cutoff, "limit": REPLY_BATCH_LIMIT},
        ).fetchall()
        jobs = [row_to_dict(r) for r in rows]

    found = 0
    checked = 0
    for job in jobs:
        try:
            thread = service.users().threads().get(
                userId="me", id=job["thread_id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Auto-Submitted",
                                 "X-Autoreply", "X-Autoresponder", "X-Auto-Response-Suppress"],
            ).execute()
        except Exception as exc:
            print(f"[engagement] No se pudo leer thread {job['thread_id']}: {exc}")
            continue
        checked += 1

        messages = thread.get("messages", [])
        if len(messages) < 2:
            continue

        # Buscar primer mensaje que no sea del propio remitente
        reply_msg_id = None
        reply_header_map: dict[str, str] = {}
        reply_subject = ""

        for msg in messages:
            raw_headers = msg.get("payload", {}).get("headers", [])
            hmap = {h.get("name", "").lower(): h.get("value", "") for h in raw_headers}
            from_val = hmap.get("from", "").lower()
            if not from_val:
                continue
            if my_email and my_email in from_val:
                continue
            # Los avisos de rebote llegan al mismo thread: NO son respuestas
            # del contacto (de esos se encarga _check_bounces).
            if "mailer-daemon" in from_val or "postmaster" in from_val:
                continue
            reply_msg_id = msg["id"]
            reply_header_map = hmap
            reply_subject = hmap.get("subject", "")
            break

        if not reply_msg_id:
            continue

        # Detectar auto-respuesta por headers y asunto (sin consumir cuota extra)
        auto_submitted = reply_header_map.get("auto-submitted", "").lower()
        has_autoreply_header = (
            (auto_submitted and auto_submitted != "no")
            or bool(reply_header_map.get("x-autoreply"))
            or bool(reply_header_map.get("x-autoresponder"))
            or bool(reply_header_map.get("x-auto-response-suppress"))
        )
        subject_signals_autoreply = any(
            kw in reply_subject.lower() for kw in _AUTOREPLY_SUBJECT_KEYWORDS
        )

        if has_autoreply_header or subject_signals_autoreply:
            # Fetch completo del cuerpo para clasificar motivo y extraer email alternativo
            try:
                full_msg = service.users().messages().get(
                    userId="me", id=reply_msg_id, format="full"
                ).execute()
                body_parts = _find_mime_parts(full_msg.get("payload", {}), "text/plain")
                body_text = " ".join(
                    _decode_part_data(p.get("body", {}).get("data", "")) for p in body_parts
                )
                snippet = full_msg.get("snippet", "")
                if _is_autoreply_message(reply_header_map, reply_subject, snippet):
                    combined = f"{reply_subject} {body_text} {snippet}"
                    reason = _classify_autoreply_reason(combined)
                    alt_email = _extract_alternative_email(body_text, job["email"])
                    _store_autoreply_detection(job, reason, alt_email)
                    found += 1
                    continue
            except Exception as exc:
                print(f"[engagement] Error procesando auto-respuesta {reply_msg_id}: {exc}")
                # Si falla el fetch, cae al registro como respuesta normal

        # Respuesta real
        now = now_utc()
        with get_session() as session:
            session.execute(
                text("UPDATE email_jobs SET replied_at = :now WHERE id = :id"),
                {"now": now, "id": job["id"]},
            )
            session.execute(
                text("""
                    UPDATE contacts SET replied_at = :now, updated_at = :now
                    WHERE id = :id AND replied_at IS NULL
                """),
                {"now": now, "id": job["contact_id"]},
            )
            insert_history(
                session,
                event_type="email.replied",
                entity_type="contact",
                entity_id=str(job["contact_id"]),
                message=f"Respuesta detectada de {job['email']}",
                metadata_json=json.dumps(
                    {"job_id": job["id"], "thread_id": job["thread_id"]},
                    ensure_ascii=True,
                ),
            )
        found += 1
        print(f"[engagement] Respuesta detectada: {job['email']} (job {job['id']})")
    return found, checked


def _check_bounces(service) -> int:
    """Busca avisos de mailer-daemon/postmaster y marca contactos rebotados.

    Cambio respecto a la versión anterior: usa format='full' (mismo costo de
    quota que 'metadata': 5 unidades/llamada según la Gmail API) para obtener
    el cuerpo MIME completo y así clasificar el motivo del rebote via RFC 3464
    DSN o heurística de texto.

    Construye un dict {email_lower: reason} en vez de un set, para asociar
    cada dirección con el motivo específico de su bounce message.

    Idempotente: sólo actúa sobre contactos con bounced_at IS NULL.

    Referencias:
    - Gmail API quota: https://developers.google.com/gmail/api/reference/quota
    - RFC 3464 (DSN): https://www.rfc-editor.org/rfc/rfc3464
    """
    try:
        listing = service.users().messages().list(
            userId="me", q=BOUNCE_QUERY, maxResults=BOUNCE_BATCH_LIMIT
        ).execute()
    except Exception as exc:
        print(f"[engagement] No se pudieron listar rebotes: {exc}")
        return 0

    # Dict email_lower → reason (si hay dos mensajes para el mismo email, gana el último)
    candidates: dict[str, str] = {}

    for item in listing.get("messages", []):
        try:
            msg = service.users().messages().get(
                userId="me", id=item["id"],
                format="full",
            ).execute()
        except Exception as exc:
            print(f"[engagement] No se pudo leer aviso {item.get('id')}: {exc}")
            continue

        payload = msg.get("payload", {})
        headers = payload.get("headers", [])

        # Extraer emails candidatos: primero X-Failed-Recipients (más preciso),
        # luego snippet del mensaje (fallback).
        failed_header = next(
            (h.get("value", "") for h in headers
             if h.get("name", "").lower() == "x-failed-recipients"),
            "",
        )
        text_sources = f"{failed_header} {msg.get('snippet', '')}"
        emails_in_msg = [e.lower() for e in EMAIL_RE.findall(text_sources)]

        if not emails_in_msg:
            continue

        # Clasificar el motivo usando el payload completo
        reason = _parse_bounce_reason(payload)

        for email in emails_in_msg:
            candidates[email] = reason

    if not candidates:
        return 0

    now = now_utc()
    bounced = 0
    emails_sorted = sorted(candidates.keys())

    with get_session() as session:
        # ── Caso 1: nuevos rebotes (bounced_at IS NULL) — registro completo ──
        new_rows = session.execute(
            text("""
                SELECT id, email FROM contacts
                WHERE lower(email) IN :emails AND bounced_at IS NULL
            """).bindparams(bindparam("emails", expanding=True)),
            {"emails": emails_sorted},
        ).fetchall()

        for row in new_rows:
            contact = row_to_dict(row)
            reason = candidates.get(contact["email"].lower(), "rebote_email")
            session.execute(
                text("""
                    UPDATE contacts
                    SET bounced_at = :now, status = 'revisar', next_action = 'revisar',
                        discard_reason = COALESCE(discard_reason, 'rebote_email'),
                        bounce_reason = :reason, updated_at = :now
                    WHERE id = :id
                """),
                {"now": now, "reason": reason, "id": contact["id"]},
            )
            session.execute(
                text("""
                    UPDATE email_jobs SET status = 'failed', error_message = :err
                    WHERE contact_id = :id AND status = 'sent'
                """),
                {"err": f"Rebote: {reason}", "id": contact["id"]},
            )
            # Cancelar el job pendiente de la cola circular: a una dirección
            # que rebotó no se le vuelve a enviar (protege la reputación).
            session.execute(
                text("""
                    UPDATE email_jobs SET status = 'cancelled', error_message = :err
                    WHERE contact_id = :id AND status = 'pending'
                """),
                {"err": f"Rebote: {reason}", "id": contact["id"]},
            )
            insert_history(
                session,
                event_type="email.bounced",
                entity_type="contact",
                entity_id=str(contact["id"]),
                message=f"Rebote detectado para {contact['email']} — motivo: {reason}",
                metadata_json=json.dumps(
                    {"email": contact["email"], "bounce_reason": reason},
                    ensure_ascii=True,
                ),
            )
            bounced += 1
            print(f"[engagement] Rebote nuevo: {contact['email']} — {reason}")

        # ── Caso 2: rebotes ya registrados sin razón específica ──
        # Cubre: bounce_reason IS NULL (anteriores a la feature) y
        # bounce_reason = 'rebote_email' (clasificados con el fallback genérico
        # antes del fix del parser). Solo se actualiza bounce_reason.
        stale_rows = session.execute(
            text("""
                SELECT id, email FROM contacts
                WHERE lower(email) IN :emails
                  AND bounced_at IS NOT NULL
                  AND (bounce_reason IS NULL OR bounce_reason = 'rebote_email')
            """).bindparams(bindparam("emails", expanding=True)),
            {"emails": emails_sorted},
        ).fetchall()

        for row in stale_rows:
            contact = row_to_dict(row)
            reason = candidates.get(contact["email"].lower(), "rebote_email")
            session.execute(
                text("UPDATE contacts SET bounce_reason = :reason WHERE id = :id"),
                {"reason": reason, "id": contact["id"]},
            )
            print(f"[engagement] Razón actualizada: {contact['email']} — {reason}")

    return bounced


def _backfill_bounce_reasons(service) -> int:
    """Busca en Gmail el bounce email específico de cada contacto sin clasificar.

    A diferencia de _check_bounces (que toma los 25 más recientes), este
    método busca por dirección de email individual, garantizando que contactos
    con bounces antiguos también se reclasifiquen.

    Procesa hasta 20 contactos por Sync para no exceder cuota de Gmail API.
    Cada iteración usa ~6 unidades (1 list + 5 get); 20 × 6 = 120 unidades.
    """
    import time

    with get_session() as session:
        rows = session.execute(
            text("""
                SELECT id, email FROM contacts
                WHERE bounced_at IS NOT NULL
                  AND (bounce_reason IS NULL OR bounce_reason = 'rebote_email')
                ORDER BY bounced_at DESC
                LIMIT 20
            """)
        ).fetchall()

    if not rows:
        return 0

    updated = 0
    for row in rows:
        contact = row_to_dict(row)
        email = contact["email"]
        try:
            listing = service.users().messages().list(
                userId="me",
                q=f"from:(mailer-daemon OR postmaster) {email} newer_than:90d",
                maxResults=1,
            ).execute()
            msgs = listing.get("messages", [])
            if not msgs:
                continue
            msg = service.users().messages().get(
                userId="me", id=msgs[0]["id"], format="full"
            ).execute()
            reason = _parse_bounce_reason(msg.get("payload", {}))
            if reason == "rebote_email":
                continue  # sin mejora, mantener para el próximo intento
            with get_session() as session:
                session.execute(
                    text("UPDATE contacts SET bounce_reason = :reason WHERE id = :id"),
                    {"reason": reason, "id": contact["id"]},
                )
            updated += 1
            print(f"[engagement] Razón actualizada (backfill): {email} — {reason}")
            time.sleep(0.3)  # evitar rate limiting de la API
        except Exception as exc:
            print(f"[engagement] Error en backfill para {email}: {exc}")

    return updated


def send_daily_reminder() -> dict:
    """Envía a la propia casilla un resumen de seguimientos vencidos o del día."""
    from modules import gmail_service

    # Domingo (weekday 6) = no se manda recordatorio, igual que los envíos masivos
    if datetime.now(_ART_TZ).weekday() == 6:
        return {"sent": False, "reason": "Domingo — recordatorio suspendido."}

    if not gmail_service.is_authorized():
        return {"sent": False, "reason": "Gmail no autorizado."}

    today = datetime.now(timezone.utc).date()
    with get_session() as session:
        # Evitar duplicados si el proceso se reinicia el mismo día
        last = session.execute(
            text("SELECT value FROM system_settings WHERE key = 'last_reminder_date'")
        ).fetchone()
        if last and last[0] == today.isoformat():
            return {"sent": False, "reason": "Recordatorio de hoy ya enviado."}

        rows = session.execute(
            text("""
                SELECT name, email, company, next_action, follow_up_date
                FROM contacts
                WHERE next_action IN ('enviar', 'seguir', 'portal', 'descartar')
                  AND follow_up_date IS NOT NULL
                  AND follow_up_date <= :today
                ORDER BY follow_up_date ASC
                LIMIT 30
            """),
            {"today": today},
        ).fetchall()
        due = [row_to_dict(r) for r in rows]

    if not due:
        return {"sent": False, "reason": "Sin seguimientos vencidos para hoy."}

    to = gmail_service.get_profile_email()
    if not to:
        return {"sent": False, "reason": "No se pudo determinar la casilla propia."}

    lines = [
        f"- {c['company'] or c['name'] or c['email']} ({c['email']}) — "
        f"{c['next_action']} — vencía {c['follow_up_date']}"
        for c in due
    ]
    body = (
        f"Tenés {len(due)} seguimiento(s) vencido(s) o para hoy en el CRM:\n\n"
        + "\n".join(lines)
        + "\n\nEntrá a la bandeja de Operaciones para resolverlos."
    )
    try:
        gmail_service.send_email(
            to=to,
            subject=f"CRM: {len(due)} seguimiento(s) pendiente(s) — {today.isoformat()}",
            body=body,
        )
    except Exception as exc:
        print(f"[engagement] No se pudo enviar recordatorio: {exc}")
        return {"sent": False, "reason": str(exc)}

    with get_session() as session:
        session.execute(
            text("""
                INSERT INTO system_settings (key, value) VALUES ('last_reminder_date', :v)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """),
            {"v": today.isoformat()},
        )
        insert_history(
            session,
            event_type="reminder.sent",
            entity_type="system",
            entity_id=None,
            message=f"Recordatorio diario enviado ({len(due)} seguimientos)",
        )
    print(f"[engagement] Recordatorio diario enviado a {to} ({len(due)} items).")
    return {"sent": True, "count": len(due)}


def get_template_stats() -> dict:
    """Métricas de conversión por plantilla: enviados, respuestas y tasa."""
    with get_session() as session:
        rows = session.execute(text("""
            SELECT mt.id, mt.name,
                   COUNT(*) FILTER (WHERE ej.status = 'sent') AS sent_count,
                   COUNT(*) FILTER (WHERE ej.replied_at IS NOT NULL) AS replied_count
            FROM email_jobs ej
            JOIN message_templates mt ON ej.template_id = mt.id
            GROUP BY mt.id, mt.name
            ORDER BY sent_count DESC
        """)).fetchall()
        totals = session.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'sent') AS sent_total,
                COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied_total
            FROM email_jobs
        """)).fetchone()
        bounced_total = session.execute(text(
            "SELECT COUNT(*) FROM contacts WHERE bounced_at IS NOT NULL"
        )).scalar()

    templates = []
    for row in rows:
        t = row_to_dict(row)
        sent = int(t["sent_count"] or 0)
        replied = int(t["replied_count"] or 0)
        templates.append({
            "template_id": t["id"],
            "name": t["name"],
            "sent": sent,
            "replied": replied,
            "response_rate": round(replied / sent * 100, 1) if sent else 0.0,
        })

    sent_total = int(totals[0] or 0)
    replied_total = int(totals[1] or 0)
    return {
        "templates": templates,
        "totals": {
            "sent": sent_total,
            "replied": replied_total,
            "response_rate": round(replied_total / sent_total * 100, 1) if sent_total else 0.0,
            "bounced_contacts": int(bounced_total or 0),
        },
    }
