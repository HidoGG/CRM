from __future__ import annotations

import csv
import io
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from urllib.parse import quote, urlencode

from sqlalchemy import text

from modules.database import get_session, insert_history, now_iso, row_to_dict


# ---------------------------------------------------------------------------
# Constants & regex
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)
VALID_EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)

# Argentina no usa DST — offset fijo UTC-3
ART_OFFSET = timedelta(hours=-3)


def now_art() -> datetime:
    """Retorna la hora actual en Argentina (UTC-3)."""
    return datetime.now(timezone.utc) + ART_OFFSET


def _is_sending_day(dt: datetime) -> bool:
    """Lunes (0) a Sábado (5) son días hábiles. Domingo (6) no."""
    return dt.weekday() != 6


def _next_working_day(dt: datetime) -> datetime:
    """Avanza al siguiente día hábil (salta domingos)."""
    nxt = dt + timedelta(days=1)
    while not _is_sending_day(nxt):
        nxt += timedelta(days=1)
    return nxt


def _next_slot_start_art(start_h: int, end_h: int) -> datetime:
    """
    Retorna el próximo momento válido para enviar un job en hora ART,
    saltando domingos automáticamente.
    """
    now = now_art()
    # Si hoy es domingo, empezar el lunes
    base = now if _is_sending_day(now) else _next_working_day(now)
    today_start = base.replace(hour=start_h, minute=0, second=0, microsecond=0)
    today_end = base.replace(hour=end_h, minute=0, second=0, microsecond=0)
    if base <= today_start:
        return today_start
    if base < today_end:
        return base
    # Ventana cerrada — avanzar al siguiente día hábil
    next_day = _next_working_day(base)
    return next_day.replace(hour=start_h, minute=0, second=0, microsecond=0)


def calc_job_scheduled_at(schedule: dict, job_index: int = 0) -> str:
    """
    Calcula el scheduled_at en UTC ISO para el job número job_index dentro de un lote.
    Distribuye los envíos respetando la ventana horaria ART; si el lote supera
    la ventana diaria, los jobs restantes se programan para días siguientes.
    """
    start_h = int(schedule["start_hour_art"])
    end_h = int(schedule["end_hour_art"])
    interval = max(1, int(schedule["interval_minutes"]))

    base_art = _next_slot_start_art(start_h, end_h)
    remaining = job_index * interval
    current = base_art

    while remaining > 0:
        day_end = current.replace(hour=end_h, minute=0, second=0, microsecond=0)
        mins_left = max(0, int((day_end - current).total_seconds() / 60))
        if remaining <= mins_left:
            current = current + timedelta(minutes=remaining)
            remaining = 0
        else:
            # El lote supera la ventana del día — avanzar al siguiente día hábil
            next_day = _next_working_day(current)
            current = next_day.replace(hour=start_h, minute=0, second=0, microsecond=0)
            remaining -= mins_left

    # Convertir ART → UTC para almacenar en DB
    return (current - ART_OFFSET).isoformat(timespec="seconds")


def _is_within_art_window(start_h: int, end_h: int) -> bool:
    """¿La hora actual en Argentina está dentro de la ventana [start_h, end_h)?"""
    return start_h <= now_art().hour < end_h


# ---------------------------------------------------------------------------
# Service exception
# ---------------------------------------------------------------------------

class ServiceError(Exception):
    def __init__(self, message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST) -> None:
        self.message = message
        self.status = status
        super().__init__(message)


# ---------------------------------------------------------------------------
# Pure data normalizers
# ---------------------------------------------------------------------------

def clean_optional(value: object) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def clean_name(value: object) -> str:
    return str(value or "").strip()


def normalize_email(value: object) -> str | None:
    cleaned = str(value or "").strip().lower()
    return cleaned or None


def normalize_status(value: object) -> str:
    text_val = str(value or "revisar").strip().lower()
    if text_val in {"mantener", "revisar", "seguimiento", "prioridad", "sacar", "portal"}:
        return text_val
    return "revisar"


def normalize_next_action(value: object) -> str:
    text_val = str(value or "revisar_manual").strip().lower()
    if text_val in {"enviar", "seguir", "portal", "descartar", "revisar_manual"}:
        return text_val
    return "revisar_manual"


def normalize_decision(value: object) -> str:
    text_val = str(value or "pending").strip().lower()
    if text_val in {"approve", "skip", "duplicate", "invalid", "pending"}:
        return text_val
    return "pending"


def normalize_follow_up_date(value: object) -> str | None:
    cleaned = clean_optional(value)
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned).isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Path extractors
# ---------------------------------------------------------------------------

def extract_contact_id(path: str) -> int | None:
    match = re.fullmatch(r"/contacts/(\d+)/execute", path)
    return int(match.group(1)) if match else None


def extract_contact_history_id(path: str) -> int | None:
    match = re.fullmatch(r"/contacts/(\d+)/history", path)
    return int(match.group(1)) if match else None


def extract_import_id(path: str) -> int | None:
    match = re.fullmatch(r"/imports/(\d+)(?:/confirm)?", path)
    return int(match.group(1)) if match else None


# ---------------------------------------------------------------------------
# Action & business logic helpers
# ---------------------------------------------------------------------------

def infer_follow_up_date_for_action(action: object) -> str | None:
    normalized = normalize_next_action(action)
    today = datetime.now(timezone.utc).date()
    if normalized == "enviar":
        return (today + timedelta(days=3)).isoformat()
    if normalized == "seguir":
        return (today + timedelta(days=7)).isoformat()
    return None


def resolve_contact_action_result(action: str, contact: dict) -> tuple[str, str, str | None, str]:
    company = contact.get("company") or "la empresa"
    name = contact.get("name") or "el contacto"
    if action == "portal":
        return (
            "portal",
            "revisar_manual",
            None,
            f"Portal revisado para {company}; queda fuera de la bandeja operativa hasta nueva decision.",
        )
    if action == "descartar":
        return (
            "sacar",
            "revisar_manual",
            None,
            f"Contacto descartado para futuras corridas en {company}.",
        )
    if action == "seguir":
        return (
            "seguimiento",
            "seguir",
            infer_follow_up_date_for_action("seguir"),
            f"Seguimiento realizado con {name} en {company}. Reingresa a la cola para proxima revision.",
        )
    return (
        "seguimiento",
        "seguir",
        infer_follow_up_date_for_action("enviar"),
        f"Envio inicial realizado a {name} en {company}; queda marcado para seguimiento.",
    )


def merge_notes(existing: object, addition: str | None) -> str | None:
    previous = clean_optional(existing)
    extra = clean_optional(addition)
    if previous and extra:
        return f"{previous}\n{extra}"
    return previous or extra


def build_executed_message(contact: dict, action: str) -> str:
    company = contact.get("company") or "la empresa"
    name = contact.get("name") or "el contacto"
    if action == "portal":
        return f"Portal revisado para {company}. Definir si conviene volver a cargar o esperar vacante."
    if action == "descartar":
        return f"Contacto descartado en {company}. No incluir en la siguiente corrida."
    if action == "seguir":
        return f"Seguimiento realizado con {name} en {company}. Esperar respuesta o nueva oportunidad."
    return f"Envio realizado a {name} en {company}. Preparar seguimiento corto si no responde."


def build_structured_action_note(
    action: str,
    portal_url: str | None,
    portal_status: str | None,
    discard_reason: str | None,
) -> str | None:
    if action == "portal":
        parts = []
        if portal_status:
            parts.append(f"Estado portal: {portal_status}.")
        if portal_url:
            parts.append(f"Link portal: {portal_url}.")
        return " ".join(parts) or None
    if action == "descartar" and discard_reason:
        return f"Motivo descarte: {discard_reason}."
    return None


def build_action_draft(contact: dict, action: str) -> dict | None:
    if action not in {"enviar", "seguir"}:
        return None
    email = clean_optional(contact.get("email"))
    if not email:
        return None
    subject = build_draft_subject(contact, action)
    body = build_draft_body(contact, action)
    query = urlencode({"subject": subject, "body": body}, quote_via=quote)
    return {
        "to": email,
        "subject": subject,
        "body": body,
        "mailto_url": f"mailto:{quote(email)}?{query}",
    }


def build_draft_subject(contact: dict, action: str) -> str:
    company = contact.get("company") or "tu empresa"
    if action == "seguir":
        return f"Seguimiento - postulacion para {company}"
    return f"Postulacion y CV - {contact.get('name') or company}"


def build_draft_body(contact: dict, action: str) -> str:
    name = contact.get("name") or "Hola"
    company = contact.get("company") or "su empresa"
    if action == "seguir":
        return (
            f"{name},\n\n"
            f"Queria retomar mi contacto anterior respecto de oportunidades en {company}. "
            "Quedo a disposicion para ampliar informacion y volver a compartir mi CV actualizado.\n\n"
            "Muchas gracias por tu tiempo.\n"
            "Gabriel"
        )
    return (
        f"{name},\n\n"
        f"Te comparto mi CV para ser considerado en futuras oportunidades dentro de {company}. "
        "Cuento con experiencia en entornos operativos y administrativos, y quedo disponible para ampliar informacion.\n\n"
        "Muchas gracias por tu tiempo.\n"
        "Gabriel"
    )


# ---------------------------------------------------------------------------
# Reporting helpers
# ---------------------------------------------------------------------------

def parse_iso_date(value: object) -> date | None:
    cleaned = clean_optional(value)
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned)
    except ValueError:
        return None


def parse_iso_datetime(value: object) -> datetime | None:
    cleaned = clean_optional(value)
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_metadata_json(value: object) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def count_actions_since(history: list[dict], threshold: datetime) -> dict:
    return count_actions_between(history, threshold, None)


def count_actions_between(history: list[dict], start: datetime, end: datetime | None) -> dict:
    counters = {"enviar": 0, "seguir": 0, "portal": 0, "descartar": 0}
    for row in history:
        created_at = parse_iso_datetime(row.get("created_at"))
        if created_at is None or created_at < start:
            continue
        if end is not None and created_at >= end:
            continue
        metadata = parse_metadata_json(row.get("metadata_json"))
        action = normalize_next_action(metadata.get("action"))
        if action in counters:
            counters[action] += 1
    return counters


def build_reporting_overview(contacts: list[dict], history: list[dict]) -> dict:
    today = datetime.now(timezone.utc).date()
    week_end = today + timedelta(days=6)
    queue = {"overdue": 0, "due_today": 0, "due_this_week": 0, "without_date": 0, "active_total": 0}
    actions = {action: 0 for action in ("enviar", "seguir", "portal", "descartar", "revisar_manual")}
    statuses: dict[str, int] = {}
    portal_statuses = {"aplicado": 0, "pendiente": 0, "revisar": 0, "total": 0}
    discard_reasons: dict[str, int] = {}

    for contact in contacts:
        next_action = normalize_next_action(contact.get("next_action"))
        status = normalize_status(contact.get("status"))
        follow_up = parse_iso_date(contact.get("follow_up_date"))
        portal_status = clean_optional(contact.get("portal_status"))
        discard_reason = clean_optional(contact.get("discard_reason"))

        statuses[status] = statuses.get(status, 0) + 1
        actions[next_action] = actions.get(next_action, 0) + 1

        if next_action in {"enviar", "seguir", "portal", "descartar"}:
            queue["active_total"] += 1
            if follow_up is None:
                queue["without_date"] += 1
            elif follow_up < today:
                queue["overdue"] += 1
            elif follow_up == today:
                queue["due_today"] += 1
            elif follow_up <= week_end:
                queue["due_this_week"] += 1

        if status == "portal":
            portal_statuses["total"] += 1
            normalized_ps = (portal_status or "pendiente").lower()
            if normalized_ps not in portal_statuses:
                normalized_ps = "pendiente"
            portal_statuses[normalized_ps] += 1

        if status == "sacar":
            normalized_dr = (discard_reason or "sin_detalle").lower()
            discard_reasons[normalized_dr] = discard_reasons.get(normalized_dr, 0) + 1

    now = datetime.now(timezone.utc)
    last_24h = count_actions_since(history, now - timedelta(hours=24))
    last_7d = count_actions_since(history, now - timedelta(days=7))
    previous_7d = count_actions_between(history, now - timedelta(days=14), now - timedelta(days=7))

    return {
        "generated_at": now_iso(),
        "snapshot_date": today.isoformat(),
        "queue": queue,
        "actions": actions,
        "statuses": [
            {"key": k, "label": k.replace("_", " "), "count": v}
            for k, v in sorted(statuses.items(), key=lambda item: (-item[1], item[0]))
        ],
        "pipeline": {
            "by_status": [
                {"key": k, "label": k.replace("_", " "), "count": v}
                for k, v in sorted(statuses.items(), key=lambda item: (-item[1], item[0]))
            ],
            "by_action": [
                {"key": k, "label": k.replace("_", " "), "count": v}
                for k, v in sorted(actions.items(), key=lambda item: (-item[1], item[0]))
            ],
        },
        "outcomes": {
            "portal": portal_statuses,
            "discard": {
                "total": sum(discard_reasons.values()),
                "reasons": [
                    {"key": k, "label": k.replace("_", " "), "count": v}
                    for k, v in sorted(discard_reasons.items(), key=lambda item: (-item[1], item[0]))
                ],
            },
        },
        "activity": {
            "last_24h": last_24h,
            "last_7d": last_7d,
            "previous_7d": previous_7d,
            "deltas_7d": {
                key: last_7d.get(key, 0) - previous_7d.get(key, 0)
                for key in ("enviar", "seguir", "portal", "descartar")
            },
        },
    }


def build_reporting_overview_payload(session) -> dict:
    contact_rows = session.execute(
        text("""
            SELECT id, status, next_action, follow_up_date, portal_status, discard_reason, updated_at
            FROM contacts
        """)
    ).fetchall()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat(timespec="seconds")
    history_rows = session.execute(
        text("""
            SELECT event_type, metadata_json, created_at
            FROM history
            WHERE event_type = 'contact.action_executed'
              AND created_at >= :cutoff
            ORDER BY created_at DESC, id DESC
        """),
        {"cutoff": cutoff},
    ).fetchall()
    contacts = [row_to_dict(row) for row in contact_rows]
    history = [row_to_dict(row) for row in history_rows]
    return build_reporting_overview(contacts, history)


def persist_reporting_snapshot(session, overview: dict) -> None:
    snapshot_date = overview.get("snapshot_date")
    queue = overview.get("queue", {})
    now = now_iso()
    session.execute(
        text("""
            INSERT INTO reporting_snapshots (
                snapshot_date, total_contacts, active_total,
                overdue_count, due_today_count, due_this_week_count,
                without_date_count, statuses_json, actions_json,
                created_at, updated_at
            )
            VALUES (
                :snapshot_date, :total_contacts, :active_total,
                :overdue_count, :due_today_count, :due_this_week_count,
                :without_date_count, :statuses_json, :actions_json,
                :created_at, :updated_at
            )
            ON CONFLICT (snapshot_date) DO UPDATE SET
                total_contacts = EXCLUDED.total_contacts,
                active_total = EXCLUDED.active_total,
                overdue_count = EXCLUDED.overdue_count,
                due_today_count = EXCLUDED.due_today_count,
                due_this_week_count = EXCLUDED.due_this_week_count,
                without_date_count = EXCLUDED.without_date_count,
                statuses_json = EXCLUDED.statuses_json,
                actions_json = EXCLUDED.actions_json,
                updated_at = EXCLUDED.updated_at
        """),
        {
            "snapshot_date": snapshot_date,
            "total_contacts": int(sum(
                item.get("count", 0) for item in overview.get("pipeline", {}).get("by_status", [])
            )),
            "active_total": int(queue.get("active_total", 0)),
            "overdue_count": int(queue.get("overdue", 0)),
            "due_today_count": int(queue.get("due_today", 0)),
            "due_this_week_count": int(queue.get("due_this_week", 0)),
            "without_date_count": int(queue.get("without_date", 0)),
            "statuses_json": json.dumps(
                overview.get("pipeline", {}).get("by_status", []), ensure_ascii=True
            ),
            "actions_json": json.dumps(
                overview.get("pipeline", {}).get("by_action", []), ensure_ascii=True
            ),
            "created_at": now,
            "updated_at": now,
        },
    )


def get_previous_reporting_snapshot(session, snapshot_date: str) -> dict | None:
    row = session.execute(
        text("""
            SELECT snapshot_date, total_contacts, active_total, overdue_count,
                   due_today_count, due_this_week_count, without_date_count,
                   statuses_json, actions_json, created_at, updated_at
            FROM reporting_snapshots
            WHERE snapshot_date < :snapshot_date
            ORDER BY snapshot_date DESC
            LIMIT 1
        """),
        {"snapshot_date": snapshot_date},
    ).fetchone()
    return row_to_dict(row) if row is not None else None


def get_recent_reporting_snapshots(session, limit: int) -> list[dict]:
    rows = session.execute(
        text("""
            SELECT snapshot_date, total_contacts, active_total, overdue_count,
                   due_today_count, due_this_week_count, without_date_count
            FROM reporting_snapshots
            ORDER BY snapshot_date DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def build_stock_comparison(overview: dict, previous_snapshot: dict | None) -> dict:
    queue = overview.get("queue", {})
    current = {
        "total_contacts": int(sum(
            item.get("count", 0) for item in overview.get("pipeline", {}).get("by_status", [])
        )),
        "active_total": int(queue.get("active_total", 0)),
        "overdue_count": int(queue.get("overdue", 0)),
        "without_date_count": int(queue.get("without_date", 0)),
    }
    if previous_snapshot is None:
        return {
            "previous_snapshot_date": None,
            "current": current,
            "deltas": {"total_contacts": 0, "active_total": 0, "overdue_count": 0, "without_date_count": 0},
        }
    return {
        "previous_snapshot_date": previous_snapshot.get("snapshot_date"),
        "current": current,
        "deltas": {
            "total_contacts": current["total_contacts"] - int(previous_snapshot.get("total_contacts", 0)),
            "active_total": current["active_total"] - int(previous_snapshot.get("active_total", 0)),
            "overdue_count": current["overdue_count"] - int(previous_snapshot.get("overdue_count", 0)),
            "without_date_count": current["without_date_count"] - int(previous_snapshot.get("without_date_count", 0)),
        },
    }


def build_reporting_snapshots_csv(snapshots: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "snapshot_date", "total_contacts", "active_total",
        "overdue_count", "due_today_count", "due_this_week_count", "without_date_count",
    ])
    for s in snapshots:
        writer.writerow([
            s.get("snapshot_date", ""), s.get("total_contacts", 0), s.get("active_total", 0),
            s.get("overdue_count", 0), s.get("due_today_count", 0),
            s.get("due_this_week_count", 0), s.get("without_date_count", 0),
        ])
    return buffer.getvalue()


def build_reporting_overview_csv(overview: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["section", "metric", "value"])
    writer.writerow(["meta", "snapshot_date", overview.get("snapshot_date", "")])
    writer.writerow(["meta", "generated_at", overview.get("generated_at", "")])
    for key, value in (overview.get("queue") or {}).items():
        writer.writerow(["queue", key, value])
    for key, value in (overview.get("actions") or {}).items():
        writer.writerow(["actions", key, value])
    for key, value in (overview.get("activity", {}).get("last_24h") or {}).items():
        writer.writerow(["activity_last_24h", key, value])
    for key, value in (overview.get("activity", {}).get("last_7d") or {}).items():
        writer.writerow(["activity_last_7d", key, value])
    for key, value in (overview.get("activity", {}).get("previous_7d") or {}).items():
        writer.writerow(["activity_previous_7d", key, value])
    for key, value in (overview.get("activity", {}).get("deltas_7d") or {}).items():
        writer.writerow(["activity_deltas_7d", key, value])
    for key, value in (overview.get("stock_comparison", {}).get("current") or {}).items():
        writer.writerow(["stock_current", key, value])
    for key, value in (overview.get("stock_comparison", {}).get("deltas") or {}).items():
        writer.writerow(["stock_deltas", key, value])
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Contact service functions
# ---------------------------------------------------------------------------

_CONTACT_COLS = (
    "id, email, name, company, title, status, next_action, suggested_message, "
    "follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at"
)


def get_contacts(limit: int = 100, offset: int = 0) -> list[dict]:
    with get_session() as session:
        rows = session.execute(
            text(f"SELECT {_CONTACT_COLS} FROM contacts ORDER BY id DESC LIMIT :limit OFFSET :offset"),
            {"limit": limit, "offset": offset},
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def delete_contact(contact_id: int) -> dict:
    with get_session() as session:
        row = session.execute(
            text("SELECT id, email FROM contacts WHERE id = :id"), {"id": contact_id}
        ).fetchone()
        if not row:
            raise ServiceError("Contacto no encontrado.", HTTPStatus.NOT_FOUND)
        session.execute(text("DELETE FROM contacts WHERE id = :id"), {"id": contact_id})
    return {"deleted": contact_id}


def get_summary() -> dict:
    with get_session() as session:
        total_contacts = session.execute(text("SELECT COUNT(*) FROM contacts")).fetchone()[0]
        total_companies = session.execute(text(
            "SELECT COUNT(DISTINCT company) FROM contacts WHERE company IS NOT NULL AND TRIM(company) <> ''"
        )).fetchone()[0]
        priority_contacts = session.execute(text(
            "SELECT COUNT(*) FROM contacts WHERE lower(status) = 'prioridad'"
        )).fetchone()[0]
        review_contacts = session.execute(text(
            "SELECT COUNT(*) FROM contacts WHERE lower(status) = 'revisar'"
        )).fetchone()[0]
        imports_count = session.execute(text("SELECT COUNT(*) FROM imports")).fetchone()[0]
        draft_imports = session.execute(text(
            "SELECT COUNT(*) FROM imports WHERE status = 'draft'"
        )).fetchone()[0]
        confirmed_imports = session.execute(text(
            "SELECT COUNT(*) FROM imports WHERE status = 'confirmed'"
        )).fetchone()[0]
    return {
        "total_contacts": int(total_contacts),
        "total_companies": int(total_companies),
        "priority_contacts": int(priority_contacts),
        "review_contacts": int(review_contacts),
        "imports_count": int(imports_count),
        "draft_imports": int(draft_imports),
        "confirmed_imports": int(confirmed_imports),
    }


def get_contact_history(contact_id: int) -> list[dict]:
    with get_session() as session:
        row = session.execute(
            text("SELECT id, email FROM contacts WHERE id = :id"),
            {"id": contact_id},
        ).fetchone()
        if row is None:
            raise ServiceError("Contact not found", HTTPStatus.NOT_FOUND)
        email = row_to_dict(row)["email"]
        rows = session.execute(
            text("""
                SELECT id, event_type, entity_type, entity_id, message, metadata_json, created_at
                FROM history
                WHERE (entity_type = 'contact' AND entity_id = :contact_id)
                   OR (metadata_json IS NOT NULL AND strpos(lower(metadata_json), lower(:email)) > 0)
                ORDER BY created_at DESC, id DESC
                LIMIT 30
            """),
            {"contact_id": str(contact_id), "email": email},
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def create_contact(payload: dict) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    name = str(payload.get("name", "")).strip()
    if not VALID_EMAIL_RE.fullmatch(email):
        raise ServiceError("invalid email format", HTTPStatus.UNPROCESSABLE_ENTITY)

    now = now_iso()
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM contacts WHERE email = :email"),
            {"email": email},
        ).fetchone()
        if existing is not None:
            raise ServiceError("contact email already exists", HTTPStatus.CONFLICT)

        result = session.execute(
            text(f"""
                INSERT INTO contacts (
                    email, name, company, title, status, next_action, suggested_message,
                    follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                )
                VALUES (
                    :email, :name, :company, :title, :status, :next_action, :suggested_message,
                    :follow_up_date, :portal_url, :portal_status, :discard_reason, :source, :notes, :created_at, :updated_at
                )
                RETURNING id
            """),
            {
                "email": email,
                "name": name,
                "company": clean_optional(payload.get("company")),
                "title": clean_optional(payload.get("title")),
                "status": normalize_status(payload.get("status", "mantener")),
                "next_action": normalize_next_action(payload.get("next_action")),
                "suggested_message": clean_optional(payload.get("suggested_message")),
                "follow_up_date": (
                    normalize_follow_up_date(payload.get("follow_up_date"))
                    or infer_follow_up_date_for_action(payload.get("next_action"))
                ),
                "portal_url": clean_optional(payload.get("portal_url")),
                "portal_status": clean_optional(payload.get("portal_status")),
                "discard_reason": clean_optional(payload.get("discard_reason")),
                "source": str(payload.get("source", "manual")).strip() or "manual",
                "notes": clean_optional(payload.get("notes")),
                "created_at": now,
                "updated_at": now,
            },
        )
        contact_id = int(result.fetchone()[0])
        insert_history(
            session,
            event_type="contact.created",
            entity_type="contact",
            entity_id=str(contact_id),
            message=f"Created contact {email}",
            metadata_json=json.dumps({"email": email, "name": name}, ensure_ascii=True),
        )
        _auto_create_email_job(
            session, contact_id, payload.get("next_action", ""),
            schedule_id=payload.get("schedule_id"),
        )
        row = session.execute(
            text(f"SELECT {_CONTACT_COLS} FROM contacts WHERE id = :id"),
            {"id": contact_id},
        ).fetchone()
    return row_to_dict(row)


def execute_contact_action(contact_id: int, payload: dict) -> dict:
    raw_action = clean_optional(payload.get("action"))
    requested_action = normalize_next_action(raw_action) if raw_action else None
    manual_note = clean_optional(payload.get("note"))
    manual_follow_up_date = normalize_follow_up_date(payload.get("follow_up_date"))
    portal_url = clean_optional(payload.get("portal_url"))
    portal_status = clean_optional(payload.get("portal_status"))
    discard_reason = clean_optional(payload.get("discard_reason"))
    now = now_iso()

    with get_session() as session:
        row = session.execute(
            text(f"SELECT {_CONTACT_COLS} FROM contacts WHERE id = :id"),
            {"id": contact_id},
        ).fetchone()
        if row is None:
            raise ServiceError("Contact not found", HTTPStatus.NOT_FOUND)

        contact = row_to_dict(row)
        current_action = normalize_next_action(contact.get("next_action"))
        action = requested_action or current_action
        if action == "revisar_manual" and manual_follow_up_date is None:
            raise ServiceError("Action is required", HTTPStatus.UNPROCESSABLE_ENTITY)

        if manual_follow_up_date is not None and requested_action is None:
            next_status = normalize_status(contact.get("status"))
            next_action = current_action
            follow_up_date = manual_follow_up_date
            default_note = f"Seguimiento reprogramado para {manual_follow_up_date}."
        else:
            next_status, next_action, follow_up_date, default_note = resolve_contact_action_result(action, contact)
            if manual_follow_up_date is not None:
                follow_up_date = manual_follow_up_date

        merged_note = merge_notes(contact.get("notes"), manual_note or default_note)
        updated_message = build_executed_message(contact, action)
        next_portal_url = portal_url or clean_optional(contact.get("portal_url"))
        next_portal_status = portal_status or clean_optional(contact.get("portal_status"))
        next_discard_reason = discard_reason or clean_optional(contact.get("discard_reason"))

        if action == "portal":
            if not next_portal_status:
                next_portal_status = "pendiente"
            merged_note = merge_notes(
                merged_note,
                build_structured_action_note(action, next_portal_url, next_portal_status, next_discard_reason),
            )
        if action == "descartar":
            if not next_discard_reason:
                next_discard_reason = "sin_detalle"
            merged_note = merge_notes(
                merged_note,
                build_structured_action_note(action, next_portal_url, next_portal_status, next_discard_reason),
            )

        session.execute(
            text("""
                UPDATE contacts
                SET status = :status, next_action = :next_action, suggested_message = :suggested_message,
                    follow_up_date = :follow_up_date, portal_url = :portal_url, portal_status = :portal_status,
                    discard_reason = :discard_reason, notes = :notes, updated_at = :updated_at
                WHERE id = :id
            """),
            {
                "status": next_status,
                "next_action": next_action,
                "suggested_message": updated_message,
                "follow_up_date": follow_up_date,
                "portal_url": next_portal_url,
                "portal_status": next_portal_status,
                "discard_reason": next_discard_reason,
                "notes": merged_note,
                "updated_at": now,
                "id": contact_id,
            },
        )
        insert_history(
            session,
            event_type="contact.action_executed",
            entity_type="contact",
            entity_id=str(contact_id),
            message=f"Executed action {action} for {contact.get('email') or contact_id}",
            metadata_json=json.dumps(
                {
                    "contact_id": contact_id,
                    "action": action,
                    "previous_status": contact.get("status"),
                    "new_status": next_status,
                    "new_next_action": next_action,
                    "follow_up_date": follow_up_date,
                    "portal_url": next_portal_url,
                    "portal_status": next_portal_status,
                    "discard_reason": next_discard_reason,
                },
                ensure_ascii=True,
            ),
        )
        updated_row = session.execute(
            text(f"SELECT {_CONTACT_COLS} FROM contacts WHERE id = :id"),
            {"id": contact_id},
        ).fetchone()

    result = {
        "contact": row_to_dict(updated_row),
        "executed_action": action,
        "message": default_note,
    }
    draft = build_action_draft(contact, action)
    if draft is not None:
        result["draft"] = draft
    return result


# ---------------------------------------------------------------------------
# Reporting service functions
# ---------------------------------------------------------------------------

def get_reporting_overview() -> dict:
    with get_session() as session:
        overview = build_reporting_overview_payload(session)
        persist_reporting_snapshot(session, overview)
        previous_snapshot = get_previous_reporting_snapshot(session, overview["snapshot_date"])
        recent_snapshots = get_recent_reporting_snapshots(session, 30)
    overview["stock_comparison"] = build_stock_comparison(overview, previous_snapshot)
    overview["recent_snapshots"] = recent_snapshots
    return overview


def export_reporting_csv(export_type: str, limit: int) -> tuple[str, str]:
    with get_session() as session:
        overview = build_reporting_overview_payload(session)
        persist_reporting_snapshot(session, overview)
        previous_snapshot = get_previous_reporting_snapshot(session, overview["snapshot_date"])
        recent_snapshots = get_recent_reporting_snapshots(session, limit)
    overview["stock_comparison"] = build_stock_comparison(overview, previous_snapshot)
    overview["recent_snapshots"] = recent_snapshots

    if export_type == "overview":
        filename = f"reporting-overview-{overview['snapshot_date']}.csv"
        content = build_reporting_overview_csv(overview)
    else:
        filename = f"reporting-snapshots-{overview['snapshot_date']}.csv"
        content = build_reporting_snapshots_csv(recent_snapshots)
    return content, filename


# ---------------------------------------------------------------------------
# Import service functions
# ---------------------------------------------------------------------------

_IMPORT_COLS = (
    "id, filename, mime_type, source, total_contacts, total_ready, total_duplicates, "
    "total_invalid, confirmed_contacts, status, notes, created_at, confirmed_at"
)

_CANDIDATE_COLS = (
    "id, import_id, email, name, company, title, status, next_action, suggested_message, "
    "source, notes, raw_text, decision, reason, created_at"
)


def get_imports(limit: int = 50, offset: int = 0) -> list[dict]:
    with get_session() as session:
        rows = session.execute(
            text(f"SELECT {_IMPORT_COLS} FROM imports ORDER BY id DESC LIMIT :limit OFFSET :offset"),
            {"limit": limit, "offset": offset},
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def get_import_detail(import_id: int) -> dict:
    with get_session() as session:
        batch = session.execute(
            text(f"SELECT {_IMPORT_COLS} FROM imports WHERE id = :id"),
            {"id": import_id},
        ).fetchone()
        if batch is None:
            raise ServiceError("Import not found", HTTPStatus.NOT_FOUND)
        candidates = session.execute(
            text(f"SELECT {_CANDIDATE_COLS} FROM import_candidates WHERE import_id = :import_id ORDER BY id ASC"),
            {"import_id": import_id},
        ).fetchall()
    payload = row_to_dict(batch)
    payload["candidates"] = [row_to_dict(row) for row in candidates]
    return payload


def create_mock_import(payload: dict) -> dict:
    filename = str(payload.get("filename", "mock_import.csv")).strip() or "mock_import.csv"
    source = str(payload.get("source", "manual")).strip() or "manual"
    total_contacts = int(payload.get("total_contacts", 0))
    notes = clean_optional(payload.get("notes"))
    now = now_iso()

    with get_session() as session:
        result = session.execute(
            text("""
                INSERT INTO imports (
                    filename, mime_type, source, total_contacts, total_ready,
                    total_duplicates, total_invalid, confirmed_contacts, status, notes, created_at
                )
                VALUES (
                    :filename, :mime_type, :source, :total_contacts, :total_ready,
                    :total_duplicates, :total_invalid, :confirmed_contacts, :status, :notes, :created_at
                )
                RETURNING id
            """),
            {
                "filename": filename, "mime_type": "text/csv", "source": source,
                "total_contacts": total_contacts, "total_ready": total_contacts,
                "total_duplicates": 0, "total_invalid": 0, "confirmed_contacts": 0,
                "status": "mock", "notes": notes, "created_at": now,
            },
        )
        import_id = int(result.fetchone()[0])
        insert_history(
            session,
            event_type="import.mock_created",
            entity_type="import",
            entity_id=str(import_id),
            message=f"Registered mock import {filename}",
            metadata_json=json.dumps({"filename": filename, "total_contacts": total_contacts}, ensure_ascii=True),
        )
    return {
        "id": import_id, "filename": filename, "source": source,
        "total_contacts": total_contacts, "notes": notes, "created_at": now, "status": "mock",
    }


def preview_import(filename: str, mime_type: str, raw_bytes: bytes, source: str) -> dict:
    from modules.ocr_service import classify_candidates, extract_candidates_from_file, prepare_candidates, summarize_candidates

    extraction = extract_candidates_from_file(filename, mime_type, raw_bytes)
    with get_session() as session:
        existing_emails = {
            row_to_dict(row)["email"].strip().lower()
            for row in session.execute(
                text("SELECT email FROM contacts WHERE email IS NOT NULL")
            ).fetchall()
        }
        prepared = prepare_candidates(extraction, existing_emails)
        prepared, classification_provider = classify_candidates(prepared, capabilities=extraction["capabilities"])
        totals = summarize_candidates(prepared)
        now = now_iso()
        result = session.execute(
            text("""
                INSERT INTO imports (
                    filename, mime_type, source, total_contacts, total_ready,
                    total_duplicates, total_invalid, confirmed_contacts, status, notes, created_at
                )
                VALUES (
                    :filename, :mime_type, :source, :total_contacts, :total_ready,
                    :total_duplicates, :total_invalid, :confirmed_contacts, :status, :notes, :created_at
                )
                RETURNING id
            """),
            {
                "filename": filename, "mime_type": mime_type, "source": source,
                "total_contacts": totals["total_contacts"], "total_ready": totals["total_ready"],
                "total_duplicates": totals["total_duplicates"], "total_invalid": totals["total_invalid"],
                "confirmed_contacts": 0, "status": "draft", "notes": extraction["notes"], "created_at": now,
            },
        )
        import_id = int(result.fetchone()[0])

        for candidate in prepared:
            session.execute(
                text("""
                    INSERT INTO import_candidates (
                        import_id, email, name, company, title, status, next_action, suggested_message,
                        source, notes, raw_text, decision, reason, created_at
                    )
                    VALUES (
                        :import_id, :email, :name, :company, :title, :status, :next_action, :suggested_message,
                        :source, :notes, :raw_text, :decision, :reason, :created_at
                    )
                """),
                {
                    "import_id": import_id,
                    "email": candidate["email"],
                    "name": candidate["name"],
                    "company": candidate["company"],
                    "title": candidate["title"],
                    "status": candidate["status"],
                    "next_action": candidate["next_action"],
                    "suggested_message": candidate["suggested_message"],
                    "source": candidate["source"],
                    "notes": candidate["notes"],
                    "raw_text": candidate["raw_text"],
                    "decision": candidate["decision"],
                    "reason": candidate["reason"],
                    "created_at": now,
                },
            )

        insert_history(
            session,
            event_type="import.preview_created",
            entity_type="import",
            entity_id=str(import_id),
            message=f"Preview created for {filename}",
            metadata_json=json.dumps(
                {
                    "filename": filename, "mime_type": mime_type,
                    "warnings": extraction["warnings"],
                    "total_contacts": totals["total_contacts"],
                    "classification_provider": classification_provider,
                },
                ensure_ascii=True,
            ),
        )

        batch = session.execute(
            text(f"SELECT {_IMPORT_COLS} FROM imports WHERE id = :id"),
            {"id": import_id},
        ).fetchone()
        candidates = session.execute(
            text(f"SELECT {_CANDIDATE_COLS} FROM import_candidates WHERE import_id = :import_id ORDER BY id ASC"),
            {"import_id": import_id},
        ).fetchall()

    return {
        "batch": row_to_dict(batch),
        "candidates": [row_to_dict(row) for row in candidates],
        "warnings": extraction["warnings"],
        "stats": totals,
        "provider": extraction["provider"],
        "classification_provider": classification_provider,
        "capabilities": extraction["capabilities"],
    }


def confirm_import(import_id: int, payload: dict) -> dict:
    requested_candidates = payload.get("candidates") or []
    template_id: int | None = payload.get("template_id")
    cv_file_id: int | None = payload.get("cv_file_id")
    schedule_id: int | None = payload.get("schedule_id")
    now = now_iso()
    inserted_contacts = []
    # Contador de jobs por schedule para espaciar correctamente los scheduled_at
    _schedule_job_index: dict[int | None, int] = {}

    with get_session() as session:
        batch = session.execute(
            text("SELECT id FROM imports WHERE id = :id"),
            {"id": import_id},
        ).fetchone()
        if batch is None:
            raise ServiceError("Import not found", HTTPStatus.NOT_FOUND)

        for candidate in requested_candidates:
            candidate_id = int(candidate.get("id", 0))
            email = normalize_email(candidate.get("email"))
            name = clean_name(candidate.get("name"))
            company = clean_optional(candidate.get("company"))
            title = clean_optional(candidate.get("title"))
            status = normalize_status(candidate.get("status", "revisar"))
            next_action = normalize_next_action(candidate.get("next_action"))
            suggested_message = clean_optional(candidate.get("suggested_message"))
            source = str(candidate.get("source", "importacion")).strip() or "importacion"
            notes = clean_optional(candidate.get("notes"))
            decision = normalize_decision(candidate.get("decision", "pending"))
            reason = clean_optional(candidate.get("reason"))

            session.execute(
                text("""
                    UPDATE import_candidates
                    SET email = :email, name = :name, company = :company, title = :title,
                        status = :status, next_action = :next_action, suggested_message = :suggested_message,
                        source = :source, notes = :notes, decision = :decision, reason = :reason
                    WHERE id = :id AND import_id = :import_id
                """),
                {
                    "email": email, "name": name, "company": company, "title": title,
                    "status": status, "next_action": next_action, "suggested_message": suggested_message,
                    "source": source, "notes": notes, "decision": decision, "reason": reason,
                    "id": candidate_id, "import_id": import_id,
                },
            )

            if decision != "approve" or not email or not VALID_EMAIL_RE.fullmatch(email):
                continue

            exists = session.execute(
                text("SELECT id FROM contacts WHERE email = :email"),
                {"email": email},
            ).fetchone()
            if exists is not None:
                session.execute(
                    text("""
                        UPDATE import_candidates
                        SET decision = 'duplicate',
                            reason = COALESCE(reason, 'Ya existia en contactos.')
                        WHERE id = :id AND import_id = :import_id
                    """),
                    {"id": candidate_id, "import_id": import_id},
                )
                continue

            result = session.execute(
                text("""
                    INSERT INTO contacts (
                        email, name, company, title, status, next_action, suggested_message,
                        follow_up_date, source, notes, created_at, updated_at
                    )
                    VALUES (
                        :email, :name, :company, :title, :status, :next_action, :suggested_message,
                        :follow_up_date, :source, :notes, :created_at, :updated_at
                    )
                    RETURNING id
                """),
                {
                    "email": email, "name": name, "company": company, "title": title,
                    "status": status, "next_action": next_action, "suggested_message": suggested_message,
                    "follow_up_date": infer_follow_up_date_for_action(next_action),
                    "source": source, "notes": notes, "created_at": now, "updated_at": now,
                },
            )
            contact_id = int(result.fetchone()[0])
            inserted_contacts.append({"id": contact_id, "email": email})
            insert_history(
                session,
                event_type="contact.imported",
                entity_type="contact",
                entity_id=str(contact_id),
                message=f"Imported contact {email} from batch {import_id}",
                metadata_json=json.dumps({"import_id": import_id, "email": email}, ensure_ascii=True),
            )
            job_idx = _schedule_job_index.get(schedule_id, 0)
            _schedule_job_index[schedule_id] = job_idx + 1
            _auto_create_email_job(
                session, contact_id, next_action, template_id, cv_file_id,
                schedule_id=schedule_id, job_index=job_idx,
            )

        session.execute(
            text("""
                UPDATE imports
                SET status = 'confirmed', confirmed_contacts = :confirmed_contacts, confirmed_at = :confirmed_at
                WHERE id = :id
            """),
            {"confirmed_contacts": len(inserted_contacts), "confirmed_at": now, "id": import_id},
        )
        insert_history(
            session,
            event_type="import.confirmed",
            entity_type="import",
            entity_id=str(import_id),
            message=f"Confirmed import batch {import_id}",
            metadata_json=json.dumps({"confirmed_contacts": len(inserted_contacts)}, ensure_ascii=True),
        )
        updated_batch = session.execute(
            text(f"SELECT {_IMPORT_COLS} FROM imports WHERE id = :id"),
            {"id": import_id},
        ).fetchone()

    return {
        "batch": row_to_dict(updated_batch),
        "confirmed_contacts": len(inserted_contacts),
        "inserted_contacts": inserted_contacts,
    }


# ---------------------------------------------------------------------------
# Message templates
# ---------------------------------------------------------------------------

_DEFAULT_TEMPLATE_NAME = "Presentación Oil & Gas"
_DEFAULT_TEMPLATE_SUBJECT = "Postulacion y CV - {company}"
_DEFAULT_TEMPLATE_BODY = (
    "{name},\n\n"
    "Te comparto mi CV para ser considerado en futuras oportunidades dentro de {company}. "
    "Cuento con experiencia en entornos operativos y administrativos, "
    "y quedo disponible para ampliar informacion.\n\n"
    "Muchas gracias por tu tiempo.\n"
    "Gabriel"
)


def _ensure_default_template(session) -> None:
    count = session.execute(text("SELECT COUNT(*) FROM message_templates")).scalar()
    if count == 0:
        now = now_iso()
        session.execute(
            text("""
                INSERT INTO message_templates (name, subject, body, is_default, created_at, updated_at)
                VALUES (:name, :subject, :body, 1, :now, :now)
            """),
            {"name": _DEFAULT_TEMPLATE_NAME, "subject": _DEFAULT_TEMPLATE_SUBJECT,
             "body": _DEFAULT_TEMPLATE_BODY, "now": now},
        )


def get_templates() -> list[dict]:
    with get_session() as session:
        _ensure_default_template(session)
        rows = session.execute(
            text("SELECT * FROM message_templates ORDER BY is_default DESC, id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def create_template(payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    subject = (payload.get("subject") or "").strip()
    body = (payload.get("body") or "").strip()
    if not name or not subject or not body:
        raise ServiceError("Nombre, asunto y cuerpo son obligatorios.")
    now = now_iso()
    with get_session() as session:
        result = session.execute(
            text("""
                INSERT INTO message_templates (name, subject, body, is_default, created_at, updated_at)
                VALUES (:name, :subject, :body, 0, :now, :now)
                RETURNING id
            """),
            {"name": name, "subject": subject, "body": body, "now": now},
        )
        new_id = result.fetchone()[0]
        row = session.execute(
            text("SELECT * FROM message_templates WHERE id = :id"), {"id": new_id}
        ).fetchone()
        return row_to_dict(row)


def update_template(template_id: int, payload: dict) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM message_templates WHERE id = :id"), {"id": template_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Plantilla no encontrada.", HTTPStatus.NOT_FOUND)
        fields = {}
        if "name" in payload and payload["name"]:
            fields["name"] = payload["name"].strip()
        if "subject" in payload and payload["subject"]:
            fields["subject"] = payload["subject"].strip()
        if "body" in payload and payload["body"]:
            fields["body"] = payload["body"].strip()
        if not fields:
            raise ServiceError("No hay campos para actualizar.")
        fields["updated_at"] = now_iso()
        fields["id"] = template_id
        set_clause = ", ".join(f"{k} = :{k}" for k in fields if k != "id")
        session.execute(text(f"UPDATE message_templates SET {set_clause} WHERE id = :id"), fields)
        row = session.execute(
            text("SELECT * FROM message_templates WHERE id = :id"), {"id": template_id}
        ).fetchone()
        return row_to_dict(row)


def delete_template(template_id: int) -> dict:
    with get_session() as session:
        row = session.execute(
            text("SELECT * FROM message_templates WHERE id = :id"), {"id": template_id}
        ).fetchone()
        if not row:
            raise ServiceError("Plantilla no encontrada.", HTTPStatus.NOT_FOUND)
        t = row_to_dict(row)
        if t["is_default"]:
            raise ServiceError("No podés eliminar la plantilla por defecto.")
        session.execute(text("DELETE FROM message_templates WHERE id = :id"), {"id": template_id})
        return {"deleted": template_id}


def set_default_template(template_id: int) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM message_templates WHERE id = :id"), {"id": template_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Plantilla no encontrada.", HTTPStatus.NOT_FOUND)
        session.execute(text("UPDATE message_templates SET is_default = 0"))
        session.execute(
            text("UPDATE message_templates SET is_default = 1 WHERE id = :id"), {"id": template_id}
        )
        rows = session.execute(
            text("SELECT * FROM message_templates ORDER BY is_default DESC, id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def _auto_create_email_job(
    session,
    contact_id: int,
    next_action: str,
    template_id: int | None = None,
    cv_file_id: int | None = None,
    schedule_id: int | None = None,
    job_index: int = 0,
) -> None:
    """Crea un email_job para un contacto. Solo actúa para acciones enviar/seguir.
    Si se provee schedule_id, calcula scheduled_at respetando la ventana horaria ART."""
    if normalize_next_action(next_action) not in {"enviar", "seguir"}:
        return
    if template_id is None:
        tmpl = session.execute(
            text("SELECT id FROM message_templates WHERE is_default = 1 LIMIT 1")
        ).fetchone()
        template_id = tmpl[0] if tmpl else None
    if cv_file_id is None:
        cv = session.execute(
            text("SELECT id FROM cv_files WHERE is_default = 1 LIMIT 1")
        ).fetchone()
        cv_file_id = cv[0] if cv else None

    # Calcular scheduled_at según el cronograma asignado
    if schedule_id is not None:
        sched_row = session.execute(
            text("SELECT * FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        ).fetchone()
        scheduled_at = calc_job_scheduled_at(row_to_dict(sched_row), job_index) if sched_row else now_iso()
    else:
        scheduled_at = now_iso()

    session.execute(text("""
        INSERT INTO email_jobs (contact_id, template_id, cv_file_id, frequency_days,
            schedule_id, scheduled_at, status, created_at)
        VALUES (:contact_id, :template_id, :cv_file_id, 0,
            :schedule_id, :scheduled_at, 'pending', :now)
    """), {
        "contact_id": contact_id, "template_id": template_id, "cv_file_id": cv_file_id,
        "schedule_id": schedule_id, "scheduled_at": scheduled_at, "now": now_iso(),
    })


def render_template(template: dict, contact: dict) -> dict:
    import re as _re
    name = (contact.get("name") or "").strip()
    company = (contact.get("company") or "su empresa").strip()

    subject = template.get("subject", "").replace("{company}", company)
    body = template.get("body", "").replace("{company}", company)

    if name:
        subject = subject.replace("{name}", name)
        body = body.replace("{name}", name)
    else:
        subject = subject.replace("{name}", "").strip(" ,")
        # Si una línea queda solo con puntuación después de quitar {name}, eliminamos la línea
        cleaned = []
        for line in body.split("\n"):
            replaced = line.replace("{name}", "")
            if replaced.strip().strip(",.;: ") == "" and "{name}" in line:
                continue
            cleaned.append(replaced)
        body = _re.sub(r"\n{3,}", "\n\n", "\n".join(cleaned))

    return {"subject": subject, "body": body}


# ---------------------------------------------------------------------------
# CV files
# ---------------------------------------------------------------------------

def get_cv_files() -> list[dict]:
    with get_session() as session:
        rows = session.execute(
            text("SELECT * FROM cv_files ORDER BY is_default DESC, id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def save_cv_file(original_name: str, file_path: str, comment: str = "") -> dict:
    now = now_iso()
    with get_session() as session:
        count = session.execute(text("SELECT COUNT(*) FROM cv_files")).scalar()
        is_default = 1 if count == 0 else 0
        result = session.execute(
            text("""
                INSERT INTO cv_files (original_name, file_path, is_default, comment, created_at)
                VALUES (:original_name, :file_path, :is_default, :comment, :now)
                RETURNING id
            """),
            {"original_name": original_name, "file_path": file_path,
             "is_default": is_default, "comment": comment, "now": now},
        )
        new_id = result.fetchone()[0]
        row = session.execute(
            text("SELECT * FROM cv_files WHERE id = :id"), {"id": new_id}
        ).fetchone()
        return row_to_dict(row)


def update_cv_comment(cv_id: int, comment: str) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM cv_files WHERE id = :id"), {"id": cv_id}
        ).fetchone()
        if not existing:
            raise ServiceError("CV no encontrado.", HTTPStatus.NOT_FOUND)
        session.execute(
            text("UPDATE cv_files SET comment = :comment WHERE id = :id"),
            {"comment": comment.strip(), "id": cv_id},
        )
        row = session.execute(
            text("SELECT * FROM cv_files WHERE id = :id"), {"id": cv_id}
        ).fetchone()
        return row_to_dict(row)


def set_default_cv(cv_id: int) -> list[dict]:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM cv_files WHERE id = :id"), {"id": cv_id}
        ).fetchone()
        if not existing:
            raise ServiceError("CV no encontrado.", HTTPStatus.NOT_FOUND)
        session.execute(text("UPDATE cv_files SET is_default = 0"))
        session.execute(text("UPDATE cv_files SET is_default = 1 WHERE id = :id"), {"id": cv_id})
        rows = session.execute(
            text("SELECT * FROM cv_files ORDER BY is_default DESC, id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def delete_cv_file(cv_id: int) -> dict:
    with get_session() as session:
        row = session.execute(
            text("SELECT * FROM cv_files WHERE id = :id"), {"id": cv_id}
        ).fetchone()
        if not row:
            raise ServiceError("CV no encontrado.", HTTPStatus.NOT_FOUND)
        cv = row_to_dict(row)
        import os as _os
        if _os.path.exists(cv["file_path"]):
            _os.remove(cv["file_path"])
        session.execute(text("DELETE FROM cv_files WHERE id = :id"), {"id": cv_id})
        return {"deleted": cv_id}


# ---------------------------------------------------------------------------
# Delivery schedules
# ---------------------------------------------------------------------------

def get_schedules() -> list[dict]:
    with get_session() as session:
        rows = session.execute(
            text("SELECT * FROM delivery_schedules ORDER BY id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def create_schedule(payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ServiceError("El nombre del cronograma es obligatorio.")
    interval_minutes = max(1, int(payload.get("interval_minutes") or 30))
    start_hour_art = int(payload.get("start_hour_art") or 8)
    end_hour_art = int(payload.get("end_hour_art") or 18)
    if not (0 <= start_hour_art < end_hour_art <= 23):
        raise ServiceError(
            "Horas inválidas: start_hour_art debe ser menor a end_hour_art y ambas entre 0 y 23."
        )
    now = now_iso()
    with get_session() as session:
        # Si es el primero, queda como default automáticamente
        count = session.execute(text("SELECT COUNT(*) FROM delivery_schedules")).scalar()
        is_default = 1 if count == 0 else 0
        result = session.execute(text("""
            INSERT INTO delivery_schedules (name, interval_minutes, start_hour_art, end_hour_art, is_default, created_at)
            VALUES (:name, :interval_minutes, :start_hour_art, :end_hour_art, :is_default, :now)
            RETURNING id
        """), {
            "name": name, "interval_minutes": interval_minutes,
            "start_hour_art": start_hour_art, "end_hour_art": end_hour_art,
            "is_default": is_default, "now": now,
        })
        new_id = result.fetchone()[0]
        row = session.execute(
            text("SELECT * FROM delivery_schedules WHERE id = :id"), {"id": new_id}
        ).fetchone()
        return row_to_dict(row)


def update_schedule(schedule_id: int, payload: dict) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Cronograma no encontrado.", HTTPStatus.NOT_FOUND)
        updates: dict = {}
        if payload.get("name"):
            updates["name"] = str(payload["name"]).strip()
        if "interval_minutes" in payload:
            updates["interval_minutes"] = max(1, int(payload["interval_minutes"] or 1))
        if "start_hour_art" in payload:
            updates["start_hour_art"] = int(payload["start_hour_art"])
        if "end_hour_art" in payload:
            updates["end_hour_art"] = int(payload["end_hour_art"])
        if not updates:
            raise ServiceError("No hay campos para actualizar.")
        # Validar ventana si se modifican las horas
        s_h = updates.get("start_hour_art")
        e_h = updates.get("end_hour_art")
        if s_h is not None or e_h is not None:
            current = row_to_dict(existing) if existing else {}
            final_start = s_h if s_h is not None else int(current.get("start_hour_art", 8))
            final_end = e_h if e_h is not None else int(current.get("end_hour_art", 18))
            if not (0 <= final_start < final_end <= 23):
                raise ServiceError("Horas inválidas: start_hour_art debe ser menor a end_hour_art.")
        updates["id"] = schedule_id
        set_clause = ", ".join(f"{k} = :{k}" for k in updates if k != "id")
        session.execute(text(f"UPDATE delivery_schedules SET {set_clause} WHERE id = :id"), updates)
        row = session.execute(
            text("SELECT * FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        ).fetchone()
        return row_to_dict(row)


def set_default_schedule(schedule_id: int) -> list[dict]:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Cronograma no encontrado.", HTTPStatus.NOT_FOUND)
        session.execute(text("UPDATE delivery_schedules SET is_default = 0"))
        session.execute(
            text("UPDATE delivery_schedules SET is_default = 1 WHERE id = :id"), {"id": schedule_id}
        )
        rows = session.execute(
            text("SELECT * FROM delivery_schedules ORDER BY id ASC")
        ).fetchall()
        return [row_to_dict(r) for r in rows]


def delete_schedule(schedule_id: int) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT * FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Cronograma no encontrado.", HTTPStatus.NOT_FOUND)
        s = row_to_dict(existing)
        if s.get("is_default"):
            others = session.execute(text(
                "SELECT COUNT(*) FROM delivery_schedules WHERE id != :id"
            ), {"id": schedule_id}).scalar()
            if others > 0:
                raise ServiceError(
                    "No podés eliminar el cronograma por defecto. "
                    "Primero establecé otro como por defecto."
                )
        pending_count = session.execute(text("""
            SELECT COUNT(*) FROM email_jobs
            WHERE schedule_id = :id AND status = 'pending'
        """), {"id": schedule_id}).scalar()
        if pending_count > 0:
            raise ServiceError(
                f"No se puede eliminar: hay {pending_count} job(s) pendiente(s) usando este cronograma."
            )
        session.execute(
            text("DELETE FROM delivery_schedules WHERE id = :id"), {"id": schedule_id}
        )
        return {"deleted": schedule_id}


# ---------------------------------------------------------------------------
# Email jobs
# ---------------------------------------------------------------------------

def get_email_jobs() -> list[dict]:
    with get_session() as session:
        rows = session.execute(text("""
            SELECT ej.*, c.name as contact_name, c.email as contact_email,
                   c.company as contact_company, mt.name as template_name,
                   cv.original_name as cv_name,
                   ds.name as schedule_name, ds.start_hour_art, ds.end_hour_art,
                   ds.interval_minutes
            FROM email_jobs ej
            LEFT JOIN contacts c ON ej.contact_id = c.id
            LEFT JOIN message_templates mt ON ej.template_id = mt.id
            LEFT JOIN cv_files cv ON ej.cv_file_id = cv.id
            LEFT JOIN delivery_schedules ds ON ej.schedule_id = ds.id
            ORDER BY ej.scheduled_at ASC
        """)).fetchall()
        return [row_to_dict(r) for r in rows]


def create_email_job(payload: dict) -> dict:
    contact_id = payload.get("contact_id")
    template_id = payload.get("template_id")
    cv_file_id = payload.get("cv_file_id")
    frequency_days = int(payload.get("frequency_days") or 0)
    scheduled_at = payload.get("scheduled_at") or now_iso()

    if not contact_id:
        raise ServiceError("contact_id es obligatorio.")

    with get_session() as session:
        contact = session.execute(
            text("SELECT id FROM contacts WHERE id = :id"), {"id": contact_id}
        ).fetchone()
        if not contact:
            raise ServiceError("Contacto no encontrado.", HTTPStatus.NOT_FOUND)

        if not template_id:
            tmpl = session.execute(
                text("SELECT id FROM message_templates WHERE is_default = 1 LIMIT 1")
            ).fetchone()
            template_id = tmpl[0] if tmpl else None

        result = session.execute(
            text("""
                INSERT INTO email_jobs (contact_id, template_id, cv_file_id, frequency_days,
                    scheduled_at, status, created_at)
                VALUES (:contact_id, :template_id, :cv_file_id, :frequency_days,
                    :scheduled_at, 'pending', :now)
                RETURNING id
            """),
            {"contact_id": contact_id, "template_id": template_id, "cv_file_id": cv_file_id,
             "frequency_days": frequency_days, "scheduled_at": scheduled_at, "now": now_iso()},
        )
        new_id = result.fetchone()[0]
        row = session.execute(text("""
            SELECT ej.*, c.name as contact_name, c.email as contact_email,
                   c.company as contact_company, mt.name as template_name,
                   cv.original_name as cv_name
            FROM email_jobs ej
            LEFT JOIN contacts c ON ej.contact_id = c.id
            LEFT JOIN message_templates mt ON ej.template_id = mt.id
            LEFT JOIN cv_files cv ON ej.cv_file_id = cv.id
            WHERE ej.id = :id
        """), {"id": new_id}).fetchone()
        return row_to_dict(row)


def delete_email_job(job_id: int) -> dict:
    with get_session() as session:
        existing = session.execute(
            text("SELECT id, status FROM email_jobs WHERE id = :id"), {"id": job_id}
        ).fetchone()
        if not existing:
            raise ServiceError("Job no encontrado.", HTTPStatus.NOT_FOUND)
        session.execute(text("DELETE FROM email_jobs WHERE id = :id"), {"id": job_id})
        return {"deleted": job_id}


def process_pending_email_jobs() -> dict:
    from modules import gmail_service
    from pathlib import Path

    JOBS_PER_CYCLE = 25
    DELAY_BETWEEN_SENDS = 2

    # Domingos: suspender todos los envíos
    if not _is_sending_day(now_art()):
        print(f"[email_jobs] Domingo — envíos suspendidos hasta el lunes.")
        return {"sent": 0, "failed": 0, "skipped": 0}

    sent = 0
    failed = 0
    skipped = 0

    # 1. Leer jobs candidatos: status='pending' y scheduled_at <= ahora (UTC)
    #    JOIN con delivery_schedules para tener la ventana horaria en el mismo query.
    with get_session() as session:
        jobs = session.execute(text("""
            SELECT ej.id, ej.contact_id, ej.template_id, ej.cv_file_id,
                   ej.frequency_days, ej.scheduled_at, ej.schedule_id,
                   c.email, c.name, c.company,
                   cv.file_path, cv.original_name,
                   ds.name as schedule_name,
                   ds.start_hour_art, ds.end_hour_art, ds.interval_minutes
            FROM email_jobs ej
            LEFT JOIN contacts c ON ej.contact_id = c.id
            LEFT JOIN cv_files cv ON ej.cv_file_id = cv.id
            LEFT JOIN delivery_schedules ds ON ej.schedule_id = ds.id
            WHERE ej.status = 'pending' AND ej.scheduled_at <= :now
            ORDER BY ej.scheduled_at ASC
            LIMIT :limit
        """), {"now": now_iso(), "limit": JOBS_PER_CYCLE}).fetchall()

    # 2. Procesar cada job con sesión independiente de DB
    for job in jobs:
        j = row_to_dict(job)

        # --- Validación de ventana horaria ART ---
        # Usamos la hora del scheduled_at (no la hora actual) para decidir si el job
        # cae dentro de la ventana. Esto permite que jobs cuyo slot fue durante la
        # ventana se envíen aunque el scheduler haya estado dormido y lo procese tarde.
        if j.get("schedule_id") is not None and j.get("start_hour_art") is not None:
            s_h = int(j["start_hour_art"])
            e_h = int(j["end_hour_art"])
            try:
                sched_utc = datetime.fromisoformat(
                    str(j["scheduled_at"]).replace("Z", "+00:00")
                ).astimezone(timezone.utc)
                sched_art_hour = (sched_utc + ART_OFFSET).hour
            except Exception:
                sched_art_hour = now_art().hour

            if not (s_h <= sched_art_hour < e_h):
                skipped += 1
                print(
                    f"[email_jobs] Job {j['id']} con scheduled_at fuera de ventana "
                    f"({s_h}:00–{e_h}:00 ART, schedule: '{j.get('schedule_name')}') "
                    f"— scheduled_at ART: {sched_art_hour:02d}:xx. Saltando."
                )
                continue  # Queda pending, sin modificar, sin dormir

        try:
            cv_path = j.get("file_path")
            cv_filename = j.get("original_name")
            if j.get("cv_file_id") and cv_path and not Path(cv_path).exists():
                raise FileNotFoundError(
                    f"CV '{cv_filename}' no encontrado en disco. "
                    "Re-subí el archivo desde la sección Envíos en producción."
                )

            tmpl_row = None
            if j["template_id"]:
                with get_session() as s:
                    tmpl_row = s.execute(
                        text("SELECT * FROM message_templates WHERE id = :id"),
                        {"id": j["template_id"]}
                    ).fetchone()

            contact = {"name": j["name"], "company": j["company"], "email": j["email"]}
            if tmpl_row:
                rendered = render_template(row_to_dict(tmpl_row), contact)
            else:
                rendered = {
                    "subject": f"Postulacion y CV - {j['company'] or j['email']}",
                    "body": f"{j['name'] or 'Hola'},\n\nTe comparto mi CV.\n\nGracias,\nGabriel",
                }

            msg_id = gmail_service.send_email(
                to=j["email"],
                subject=rendered["subject"],
                body=rendered["body"],
                cv_path=cv_path,
                cv_filename=cv_filename,
            )

            with get_session() as s:
                s.execute(text("""
                    UPDATE email_jobs SET status = 'sent', sent_at = :now,
                        gmail_message_id = :msg_id WHERE id = :id
                """), {"now": now_iso(), "msg_id": msg_id, "id": j["id"]})

                if j["frequency_days"] and int(j["frequency_days"]) > 0:
                    next_send = (
                        datetime.now(timezone.utc) + timedelta(days=int(j["frequency_days"]))
                    ).isoformat(timespec="seconds")
                    s.execute(text("""
                        INSERT INTO email_jobs (contact_id, template_id, cv_file_id,
                            frequency_days, schedule_id, scheduled_at, status, created_at)
                        VALUES (:contact_id, :template_id, :cv_file_id,
                            :frequency_days, :schedule_id, :scheduled_at, 'pending', :now)
                    """), {
                        "contact_id": j["contact_id"], "template_id": j["template_id"],
                        "cv_file_id": j["cv_file_id"], "frequency_days": j["frequency_days"],
                        "schedule_id": j.get("schedule_id"), "scheduled_at": next_send,
                        "now": now_iso(),
                    })
                insert_history(s, event_type="email.sent", entity_type="contact",
                               entity_id=str(j["contact_id"]),
                               message=f"Email enviado a {j['email']}")
            sent += 1
            print(f"[email_jobs] Enviado a {j['email']} (job {j['id']})")

        except Exception as exc:
            err_msg = str(exc)[:500]
            print(f"[email_jobs] Fallo job {j['id']} ({j.get('email')}): {err_msg}")
            try:
                with get_session() as s:
                    s.execute(text("""
                        UPDATE email_jobs SET status = 'failed', error_message = :err WHERE id = :id
                    """), {"err": err_msg, "id": j["id"]})
            except Exception as db_exc:
                print(f"[email_jobs] No se pudo registrar fallo en DB: {db_exc}")
            failed += 1

        time.sleep(DELAY_BETWEEN_SENDS)

    print(
        f"[email_jobs] Ciclo completado — enviados: {sent}, "
        f"fallidos: {failed}, fuera de ventana: {skipped}, "
        f"hora ART: {now_art().strftime('%H:%M')}"
    )
    return {"sent": sent, "failed": failed, "skipped": skipped}


def retry_failed_email_jobs() -> dict:
    """Resetea todos los jobs con status='failed' a 'pending' con scheduled_at=ahora."""
    with get_session() as session:
        result = session.execute(text("""
            UPDATE email_jobs
            SET status = 'pending', scheduled_at = :now, error_message = NULL
            WHERE status = 'failed'
        """), {"now": now_iso()})
        retried = result.rowcount
    print(f"[email_jobs] Retry: {retried} jobs fallidos reseteados a pending.")
    return {"retried": retried}
