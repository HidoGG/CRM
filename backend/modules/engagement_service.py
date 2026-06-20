"""Engagement: detección de respuestas, rebotes y métricas de conversión.

Cierra el ciclo del outreach: hoy el CRM envía correos pero no sabe quién
contestó ni qué direcciones rebotaron. Mantener el bounce rate bajo es
crítico para no perder reputación del remitente en Gmail.

Requiere el scope gmail.readonly (además de gmail.send). Si el token vigente
no lo tiene, las funciones devuelven un resultado informativo sin lanzar.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import bindparam, text

from modules.database import get_session, insert_history, now_utc, row_to_dict

EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)

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
    print(
        f"[engagement] Sync — threads revisados: {threads_checked}, "
        f"respuestas: {replies}, rebotes: {bounces}"
    )
    return {
        "ok": True,
        "replies_found": replies,
        "bounces_found": bounces,
        "threads_checked": threads_checked,
    }


def _check_replies(service, my_email: str) -> tuple[int, int]:
    """Revisa los threads de jobs enviados sin respuesta registrada.

    Un thread con un mensaje cuyo From no es la cuenta propia = respuesta.
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
                format="metadata", metadataHeaders=["From"],
            ).execute()
        except Exception as exc:
            print(f"[engagement] No se pudo leer thread {job['thread_id']}: {exc}")
            continue
        checked += 1

        messages = thread.get("messages", [])
        if len(messages) < 2:
            continue

        replied = False
        for msg in messages:
            headers = msg.get("payload", {}).get("headers", [])
            from_value = next(
                (h.get("value", "") for h in headers if h.get("name", "").lower() == "from"),
                "",
            ).lower()
            if not from_value:
                continue
            # Respuesta = mensaje del thread que no envió la cuenta propia
            if my_email and my_email in from_value:
                continue
            if job["email"] and job["email"].lower() in from_value:
                replied = True
                break
            # From de otro remitente del mismo dominio (ej. RRHH respondió
            # desde otra casilla) también cuenta como respuesta del thread.
            if my_email and my_email not in from_value:
                replied = True
                break

        if not replied:
            continue

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

    El destinatario fallido se extrae del header X-Failed-Recipients (cuando
    existe) y de los emails presentes en el snippet del aviso. Idempotente:
    sólo actúa sobre contactos con bounced_at IS NULL.
    """
    try:
        listing = service.users().messages().list(
            userId="me", q=BOUNCE_QUERY, maxResults=BOUNCE_BATCH_LIMIT
        ).execute()
    except Exception as exc:
        print(f"[engagement] No se pudieron listar rebotes: {exc}")
        return 0

    candidates: set[str] = set()
    for item in listing.get("messages", []):
        try:
            msg = service.users().messages().get(
                userId="me", id=item["id"],
                format="metadata", metadataHeaders=["X-Failed-Recipients", "Subject"],
            ).execute()
        except Exception as exc:
            print(f"[engagement] No se pudo leer aviso {item.get('id')}: {exc}")
            continue
        headers = msg.get("payload", {}).get("headers", [])
        failed_header = next(
            (h.get("value", "") for h in headers
             if h.get("name", "").lower() == "x-failed-recipients"),
            "",
        )
        text_sources = f"{failed_header} {msg.get('snippet', '')}"
        for email in EMAIL_RE.findall(text_sources):
            candidates.add(email.lower())

    if not candidates:
        return 0

    now = now_utc()
    bounced = 0
    with get_session() as session:
        rows = session.execute(
            text("""
                SELECT id, email FROM contacts
                WHERE lower(email) IN :emails AND bounced_at IS NULL
            """).bindparams(bindparam("emails", expanding=True)),
            {"emails": sorted(candidates)},
        ).fetchall()
        for row in rows:
            contact = row_to_dict(row)
            session.execute(
                text("""
                    UPDATE contacts
                    SET bounced_at = :now, status = 'sacar', next_action = 'descartar',
                        discard_reason = COALESCE(discard_reason, 'rebote_email'),
                        updated_at = :now
                    WHERE id = :id
                """),
                {"now": now, "id": contact["id"]},
            )
            session.execute(
                text("""
                    UPDATE email_jobs
                    SET status = 'failed',
                        error_message = 'Rebote: dirección inválida o dominio inexistente'
                    WHERE contact_id = :id AND status = 'sent'
                """),
                {"id": contact["id"]},
            )
            insert_history(
                session,
                event_type="email.bounced",
                entity_type="contact",
                entity_id=str(contact["id"]),
                message=f"Rebote detectado para {contact['email']} — contacto marcado para sacar",
                metadata_json=json.dumps({"email": contact["email"]}, ensure_ascii=True),
            )
            bounced += 1
            print(f"[engagement] Rebote: {contact['email']} marcado como inválido.")
    return bounced


def send_daily_reminder() -> dict:
    """Envía a la propia casilla un resumen de seguimientos vencidos o del día."""
    from modules import gmail_service

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
