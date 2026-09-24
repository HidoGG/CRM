"""Reenvío automático programado del Asistente de RRHH (por chat/sesión).

Cada career_session puede tener su propia tanda de envíos: mismo email +
mismo CV, mismo destinatario, en horarios exactos elegidos por Gabriel
(ej. "08:00" y "13:00") durante N días. Cada envío programado es una fila en
career_resend_jobs, en el mismo espíritu que email_jobs para Contactos, pero
totalmente separado de esa cola — esto es un mecanismo propio del Asistente.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from modules.crm_service import ART_TZ
from modules.database import get_session, row_to_dict


def build_schedule_slots(days: int, hours: list[str], now_art: datetime | None = None) -> list[datetime]:
    """Arma la lista de horarios (en UTC) para los próximos `days` días, en cada
    uno de los `hours` (formato "HH:MM", hora ART). Descarta los horarios de
    hoy que ya pasaron — no se corren para el día siguiente, simplemente no
    se programan. Devuelve la lista ordenada.
    """
    now_art = now_art or datetime.now(ART_TZ)
    today = now_art.date()
    slots: list[datetime] = []
    for day_offset in range(days):
        day = today + timedelta(days=day_offset)
        for h in hours:
            hh, mm = h.split(":")
            slot_art = datetime(day.year, day.month, day.day, int(hh), int(mm), tzinfo=ART_TZ)
            if slot_art > now_art:
                slots.append(slot_art.astimezone(timezone.utc))
    slots.sort()
    return slots


def create_schedule(session_id: int, to: str, days: int, hours: list[str]) -> dict:
    """Reemplaza la tanda de reenvíos pendientes de una sesión por una nueva.

    Cancela lo que hubiera pendiente (si el usuario reconfigura) y guarda el
    destinatario en la sesión para que el envío automático sepa a quién mandar.
    """
    slots = build_schedule_slots(days, hours)
    with get_session() as db:
        session_row = db.execute(
            text("SELECT id FROM career_sessions WHERE id = :id"), {"id": session_id}
        ).fetchone()
        if not session_row:
            raise ValueError("Sesión no encontrada.")

        db.execute(
            text("DELETE FROM career_resend_jobs WHERE session_id = :id AND status = 'pending'"),
            {"id": session_id},
        )
        db.execute(
            text("UPDATE career_sessions SET recipient_email = :to, updated_at = NOW() WHERE id = :id"),
            {"to": to, "id": session_id},
        )
        for slot in slots:
            db.execute(
                text("""
                    INSERT INTO career_resend_jobs (session_id, scheduled_at, status)
                    VALUES (:session_id, :scheduled_at, 'pending')
                """),
                {"session_id": session_id, "scheduled_at": slot},
            )

    return {
        "created": len(slots),
        "next_at": slots[0].isoformat() if slots else None,
    }


def cancel_schedule(session_id: int) -> int:
    """Cancela (borra) los envíos pendientes de una sesión. Devuelve cuántos borró."""
    with get_session() as db:
        result = db.execute(
            text("DELETE FROM career_resend_jobs WHERE session_id = :id AND status = 'pending'"),
            {"id": session_id},
        )
        return result.rowcount or 0


def get_schedule_status(session_id: int) -> dict:
    """Resumen para la UI: cuántos se mandaron, cuántos quedan y el próximo horario."""
    with get_session() as db:
        rows = db.execute(
            text("""
                SELECT status, scheduled_at, sent_at FROM career_resend_jobs
                WHERE session_id = :id ORDER BY scheduled_at ASC
            """),
            {"id": session_id},
        ).fetchall()
    rows = [row_to_dict(r) for r in rows]
    sent = [r for r in rows if r["status"] == "sent"]
    pending = [r for r in rows if r["status"] == "pending"]
    return {
        "active": bool(pending),
        "sent_count": len(sent),
        "total_count": len(rows),
        "next_at": pending[0]["scheduled_at"].isoformat() if pending else None,
    }


def send_due_resends() -> dict:
    """Manda los envíos automáticos que ya llegaron a su horario. Job del scheduler.

    Mismo patrón de concurrencia que process_pending_email_jobs: FOR UPDATE
    SKIP LOCKED para no pisarse si esto tarda más que el intervalo del job.
    """
    from modules import career_cv, gmail_service

    now = datetime.now(timezone.utc)
    sent_count = 0
    failed_count = 0

    with get_session() as db:
        due = db.execute(
            text("""
                SELECT id, session_id FROM career_resend_jobs
                WHERE status = 'pending' AND scheduled_at <= :now
                ORDER BY scheduled_at ASC
                LIMIT 25
                FOR UPDATE SKIP LOCKED
            """),
            {"now": now},
        ).fetchall()
        due_ids = [r[0] for r in due]
        if due_ids:
            db.execute(
                text("UPDATE career_resend_jobs SET status = 'processing' WHERE id = ANY(:ids)"),
                {"ids": due_ids},
            )

    for job_id, session_id in due:
        with get_session() as db:
            session_row = db.execute(
                text("""
                    SELECT email_subject, email_body, cv_content, company, role, recipient_email
                    FROM career_sessions WHERE id = :id
                """),
                {"id": session_id},
            ).fetchone()

        if not session_row or not session_row[5]:
            _mark_job(job_id, "failed", "La sesión ya no tiene destinatario configurado.")
            failed_count += 1
            continue

        subject, body, cv_content, empresa, cargo, to = session_row
        if not subject and not body:
            _mark_job(job_id, "failed", "La sesión ya no tiene un email generado.")
            failed_count += 1
            continue

        cv_bytes = cv_filename = None
        if cv_content:
            try:
                cv_bytes = career_cv.cv_content_to_pdf(cv_content, cargo=cargo or "", empresa=empresa or "")
                cv_filename = f"CV_Gabriel_Hidalgo_{(cargo or 'puesto').replace(' ', '_')}.pdf"
            except Exception as exc:
                print(f"[career_resend] Error generando PDF del CV (job {job_id}): {exc} — se envía sin adjunto")

        try:
            gmail_service.send_email(to=to, subject=subject or "", body=body or "", cv_bytes=cv_bytes, cv_filename=cv_filename)
            _mark_job(job_id, "sent")
            sent_count += 1
        except Exception as exc:
            print(f"[career_resend] Error al enviar (job {job_id}, sesión {session_id}): {exc}")
            _mark_job(job_id, "failed", str(exc)[:500])
            failed_count += 1

        time.sleep(2)  # mismo margen que la cola de Contactos, para no pasarse del rate limit de Gmail

    if sent_count or failed_count:
        print(f"[career_resend] Ciclo terminado: {sent_count} enviados, {failed_count} fallidos")
    return {"sent": sent_count, "failed": failed_count}


def _mark_job(job_id: int, status: str, error_message: str | None = None) -> None:
    with get_session() as db:
        db.execute(
            text("""
                UPDATE career_resend_jobs
                SET status = :status, sent_at = CASE WHEN :status = 'sent' THEN NOW() ELSE sent_at END,
                    error_message = :error
                WHERE id = :id
            """),
            {"status": status, "error": error_message, "id": job_id},
        )
