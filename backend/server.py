from __future__ import annotations

import base64
import csv
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import parse_qs, quote, urlencode, urlparse
from xml.etree import ElementTree as ET

from app.db import connection, init_db, insert_history, now_iso, row_to_dict


EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)
VALID_EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)
GENERIC_CONTACT_TOKENS = {
    "admin",
    "careers",
    "contact",
    "contacto",
    "empleo",
    "hr",
    "info",
    "jobs",
    "noreply",
    "no-reply",
    "postulaciones",
    "recepcion",
    "recruiting",
    "rrhh",
    "soporte",
    "support",
    "talent",
    "ventas",
}
DOMAIN_OVERRIDES = {
    "bhge": "Baker Hughes",
    "slb": "SLB",
    "tgs": "TGS",
    "ypf": "YPF",
}


class CRMHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json({"status": "ok", "service": "crm-local-api-stdlib"})
            return
        if parsed.path == "/contacts":
            self._get_contacts(parsed)
            return
        if re.fullmatch(r"/contacts/\d+/history", parsed.path):
            self._get_contact_history(parsed.path)
            return
        if parsed.path == "/summary":
            self._get_summary()
            return
        if parsed.path == "/reporting/overview":
            self._get_reporting_overview()
            return
        if parsed.path == "/reporting/export.csv":
            self._export_reporting_csv(parsed)
            return
        if parsed.path == "/capabilities":
            self._send_json(get_runtime_capabilities())
            return
        if parsed.path == "/imports":
            self._get_imports(parsed)
            return
        if parsed.path.startswith("/imports/"):
            self._get_import_detail(parsed.path)
            return
        self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        payload = self._read_json_body()
        if parsed.path == "/contacts":
            self._create_contact(payload)
            return
        if re.fullmatch(r"/contacts/\d+/execute", parsed.path):
            self._execute_contact_action(parsed.path, payload)
            return
        if parsed.path == "/imports/mock":
            self._create_import(payload)
            return
        if parsed.path == "/imports/preview":
            self._preview_import(payload)
            return
        if parsed.path.startswith("/imports/") and parsed.path.endswith("/confirm"):
            self._confirm_import(parsed.path, payload)
            return
        self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def _get_contacts(self, parsed) -> None:
        params = parse_qs(parsed.query)
        limit = int(params.get("limit", ["100"])[0])
        offset = int(params.get("offset", ["0"])[0])
        with connection() as conn:
            rows = conn.execute(
                """
                SELECT id, email, name, company, title, status, next_action, suggested_message, follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                FROM contacts
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        self._send_json([row_to_dict(row) for row in rows])

    def _get_summary(self) -> None:
        with connection() as conn:
            total_contacts = conn.execute("SELECT COUNT(*) FROM contacts").fetchone()[0]
            total_companies = conn.execute(
                "SELECT COUNT(DISTINCT company) FROM contacts WHERE company IS NOT NULL AND TRIM(company) <> ''"
            ).fetchone()[0]
            priority_contacts = conn.execute(
                "SELECT COUNT(*) FROM contacts WHERE lower(status) = 'prioridad'"
            ).fetchone()[0]
            review_contacts = conn.execute(
                "SELECT COUNT(*) FROM contacts WHERE lower(status) = 'revisar'"
            ).fetchone()[0]
            imports_count = conn.execute("SELECT COUNT(*) FROM imports").fetchone()[0]
            draft_imports = conn.execute("SELECT COUNT(*) FROM imports WHERE status = 'draft'").fetchone()[0]
            confirmed_imports = conn.execute("SELECT COUNT(*) FROM imports WHERE status = 'confirmed'").fetchone()[0]
        self._send_json(
            {
                "total_contacts": int(total_contacts),
                "total_companies": int(total_companies),
                "priority_contacts": int(priority_contacts),
                "review_contacts": int(review_contacts),
                "imports_count": int(imports_count),
                "draft_imports": int(draft_imports),
                "confirmed_imports": int(confirmed_imports),
            }
        )

    def _get_reporting_overview(self) -> None:
        with connection() as conn:
            overview = build_reporting_overview_payload(conn)
            persist_reporting_snapshot(conn, overview)
            previous_snapshot = get_previous_reporting_snapshot(conn, overview["snapshot_date"])
            recent_snapshots = get_recent_reporting_snapshots(conn, 30)
        overview["stock_comparison"] = build_stock_comparison(overview, previous_snapshot)
        overview["recent_snapshots"] = recent_snapshots
        self._send_json(overview)

    def _export_reporting_csv(self, parsed) -> None:
        params = parse_qs(parsed.query)
        export_type = str(params.get("type", ["snapshots"])[0]).strip().lower()
        limit = max(1, min(int(params.get("limit", ["30"])[0]), 365))

        with connection() as conn:
            overview = build_reporting_overview_payload(conn)
            persist_reporting_snapshot(conn, overview)
            previous_snapshot = get_previous_reporting_snapshot(conn, overview["snapshot_date"])
            recent_snapshots = get_recent_reporting_snapshots(conn, limit)

        overview["stock_comparison"] = build_stock_comparison(overview, previous_snapshot)
        overview["recent_snapshots"] = recent_snapshots

        if export_type == "overview":
            filename = f"reporting-overview-{overview['snapshot_date']}.csv"
            content = build_reporting_overview_csv(overview)
        else:
            filename = f"reporting-snapshots-{overview['snapshot_date']}.csv"
            content = build_reporting_snapshots_csv(recent_snapshots)

        self._send_csv(content, filename)

    def _get_contact_history(self, path: str) -> None:
        contact_id = extract_contact_history_id(path)
        if contact_id is None:
            self._send_json({"detail": "Contact not found"}, status=HTTPStatus.NOT_FOUND)
            return

        with connection() as conn:
            contact = conn.execute(
                "SELECT id, email FROM contacts WHERE id = ?",
                (contact_id,),
            ).fetchone()
            if contact is None:
                self._send_json({"detail": "Contact not found"}, status=HTTPStatus.NOT_FOUND)
                return

            email = contact["email"]
            rows = conn.execute(
                """
                SELECT
                    id,
                    event_type,
                    entity_type,
                    entity_id,
                    message,
                    metadata_json,
                    created_at
                FROM history
                WHERE (entity_type = 'contact' AND entity_id = ?)
                   OR (metadata_json IS NOT NULL AND instr(lower(metadata_json), lower(?)) > 0)
                ORDER BY created_at DESC, id DESC
                LIMIT 30
                """,
                (str(contact_id), email),
            ).fetchall()
        self._send_json([row_to_dict(row) for row in rows])

    def _get_imports(self, parsed) -> None:
        params = parse_qs(parsed.query)
        limit = int(params.get("limit", ["50"])[0])
        offset = int(params.get("offset", ["0"])[0])
        with connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at,
                    confirmed_at
                FROM imports
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        self._send_json([row_to_dict(row) for row in rows])

    def _get_import_detail(self, path: str) -> None:
        import_id = extract_import_id(path)
        if import_id is None:
            self._send_json({"detail": "Not found"}, status=HTTPStatus.NOT_FOUND)
            return

        with connection() as conn:
            batch = conn.execute(
                """
                SELECT
                    id,
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at,
                    confirmed_at
                FROM imports
                WHERE id = ?
                """,
                (import_id,),
            ).fetchone()
            if batch is None:
                self._send_json({"detail": "Import not found"}, status=HTTPStatus.NOT_FOUND)
                return
            candidates = conn.execute(
                """
                SELECT
                    id,
                    import_id,
                    email,
                    name,
                    company,
                    title,
                    status,
                    next_action,
                    suggested_message,
                    source,
                    notes,
                    raw_text,
                    decision,
                    reason,
                    created_at
                FROM import_candidates
                WHERE import_id = ?
                ORDER BY id ASC
                """,
                (import_id,),
            ).fetchall()

        payload = row_to_dict(batch)
        payload["candidates"] = [row_to_dict(row) for row in candidates]
        self._send_json(payload)

    def _create_contact(self, payload: dict) -> None:
        email = str(payload.get("email", "")).strip().lower()
        name = str(payload.get("name", "")).strip()
        if not VALID_EMAIL_RE.fullmatch(email):
            self._send_json({"detail": "invalid email format"}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
            return
        if not name:
            self._send_json({"detail": "name cannot be empty"}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
            return

        now = now_iso()
        with connection() as conn:
            existing = conn.execute("SELECT id FROM contacts WHERE email = ?", (email,)).fetchone()
            if existing is not None:
                self._send_json({"detail": "contact email already exists"}, status=HTTPStatus.CONFLICT)
                return

            cursor = conn.execute(
                """
                INSERT INTO contacts (
                    email, name, company, title, status, next_action, suggested_message, follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    email,
                    name,
                    clean_optional(payload.get("company")),
                    clean_optional(payload.get("title")),
                    normalize_status(payload.get("status", "mantener")),
                    normalize_next_action(payload.get("next_action")),
                    clean_optional(payload.get("suggested_message")),
                    normalize_follow_up_date(payload.get("follow_up_date"))
                    or infer_follow_up_date_for_action(payload.get("next_action")),
                    clean_optional(payload.get("portal_url")),
                    clean_optional(payload.get("portal_status")),
                    clean_optional(payload.get("discard_reason")),
                    str(payload.get("source", "manual")).strip() or "manual",
                    clean_optional(payload.get("notes")),
                    now,
                    now,
                ),
            )
            contact_id = int(cursor.lastrowid)
            insert_history(
                conn,
                event_type="contact.created",
                entity_type="contact",
                entity_id=str(contact_id),
                message=f"Created contact {email}",
                metadata_json=json.dumps({"email": email, "name": name}, ensure_ascii=True),
            )
            row = conn.execute(
                """
                SELECT id, email, name, company, title, status, next_action, suggested_message, follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                FROM contacts
                WHERE id = ?
                """,
                (contact_id,),
            ).fetchone()
        self._send_json(row_to_dict(row), status=HTTPStatus.CREATED)

    def _execute_contact_action(self, path: str, payload: dict) -> None:
        contact_id = extract_contact_id(path)
        if contact_id is None:
            self._send_json({"detail": "Contact not found"}, status=HTTPStatus.NOT_FOUND)
            return

        raw_action = clean_optional(payload.get("action"))
        requested_action = normalize_next_action(raw_action) if raw_action else None
        manual_note = clean_optional(payload.get("note"))
        manual_follow_up_date = normalize_follow_up_date(payload.get("follow_up_date"))
        portal_url = clean_optional(payload.get("portal_url"))
        portal_status = clean_optional(payload.get("portal_status"))
        discard_reason = clean_optional(payload.get("discard_reason"))
        now = now_iso()

        with connection() as conn:
            row = conn.execute(
                """
                SELECT id, email, name, company, title, status, next_action, suggested_message, follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                FROM contacts
                WHERE id = ?
                """,
                (contact_id,),
            ).fetchone()
            if row is None:
                self._send_json({"detail": "Contact not found"}, status=HTTPStatus.NOT_FOUND)
                return

            contact = row_to_dict(row)
            current_action = normalize_next_action(contact.get("next_action"))
            action = requested_action or current_action
            if action == "revisar_manual" and manual_follow_up_date is None:
                self._send_json({"detail": "Action is required"}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
                return

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

            conn.execute(
                """
                UPDATE contacts
                SET status = ?, next_action = ?, suggested_message = ?, follow_up_date = ?, portal_url = ?, portal_status = ?, discard_reason = ?, notes = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    next_status,
                    next_action,
                    updated_message,
                    follow_up_date,
                    next_portal_url,
                    next_portal_status,
                    next_discard_reason,
                    merged_note,
                    now,
                    contact_id,
                ),
            )
            insert_history(
                conn,
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
            updated_row = conn.execute(
                """
                SELECT id, email, name, company, title, status, next_action, suggested_message, follow_up_date, portal_url, portal_status, discard_reason, source, notes, created_at, updated_at
                FROM contacts
                WHERE id = ?
                """,
                (contact_id,),
            ).fetchone()

        response_payload = {
            "contact": row_to_dict(updated_row),
            "executed_action": action,
            "message": default_note,
        }
        draft = build_action_draft(contact, action)
        if draft is not None:
            response_payload["draft"] = draft
        self._send_json(response_payload)

    def _create_import(self, payload: dict) -> None:
        filename = str(payload.get("filename", "mock_import.csv")).strip() or "mock_import.csv"
        source = str(payload.get("source", "manual")).strip() or "manual"
        total_contacts = int(payload.get("total_contacts", 0))
        notes = clean_optional(payload.get("notes"))
        now = now_iso()

        with connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO imports (
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (filename, "text/csv", source, total_contacts, total_contacts, 0, 0, 0, "mock", notes, now),
            )
            import_id = int(cursor.lastrowid)
            insert_history(
                conn,
                event_type="import.mock_created",
                entity_type="import",
                entity_id=str(import_id),
                message=f"Registered mock import {filename}",
                metadata_json=json.dumps({"filename": filename, "total_contacts": total_contacts}, ensure_ascii=True),
            )

        self._send_json(
            {
                "id": import_id,
                "filename": filename,
                "source": source,
                "total_contacts": total_contacts,
                "notes": notes,
                "created_at": now,
                "status": "mock",
            },
            status=HTTPStatus.CREATED,
        )

    def _preview_import(self, payload: dict) -> None:
        filename = str(payload.get("filename", "archivo.txt")).strip() or "archivo.txt"
        mime_type = str(payload.get("mime_type", "application/octet-stream")).strip() or "application/octet-stream"
        content_base64 = str(payload.get("content_base64", "")).strip()
        source = str(payload.get("source", "upload")).strip() or "upload"

        if not content_base64:
            self._send_json({"detail": "missing content_base64"}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
            return

        try:
            raw_bytes = base64.b64decode(content_base64)
        except Exception:
            self._send_json({"detail": "invalid base64 payload"}, status=HTTPStatus.UNPROCESSABLE_ENTITY)
            return

        extraction = extract_candidates_from_file(filename, mime_type, raw_bytes)
        with connection() as conn:
            existing_emails = {
                row["email"].strip().lower()
                for row in conn.execute("SELECT email FROM contacts WHERE email IS NOT NULL").fetchall()
            }
            prepared = prepare_candidates(extraction, existing_emails)
            prepared, classification_provider = classify_candidates(prepared, capabilities=extraction["capabilities"])
            totals = summarize_candidates(prepared)
            now = now_iso()
            cursor = conn.execute(
                """
                INSERT INTO imports (
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    mime_type,
                    source,
                    totals["total_contacts"],
                    totals["total_ready"],
                    totals["total_duplicates"],
                    totals["total_invalid"],
                    0,
                    "draft",
                    extraction["notes"],
                    now,
                ),
            )
            import_id = int(cursor.lastrowid)

            for candidate in prepared:
                conn.execute(
                    """
                    INSERT INTO import_candidates (
                        import_id,
                        email,
                        name,
                        company,
                        title,
                        status,
                        next_action,
                        suggested_message,
                        source,
                        notes,
                        raw_text,
                        decision,
                        reason,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        import_id,
                        candidate["email"],
                        candidate["name"],
                        candidate["company"],
                        candidate["title"],
                        candidate["status"],
                        candidate["next_action"],
                        candidate["suggested_message"],
                        candidate["source"],
                        candidate["notes"],
                        candidate["raw_text"],
                        candidate["decision"],
                        candidate["reason"],
                        now,
                    ),
                )

            insert_history(
                conn,
                event_type="import.preview_created",
                entity_type="import",
                entity_id=str(import_id),
                message=f"Preview created for {filename}",
                metadata_json=json.dumps(
                    {
                        "filename": filename,
                        "mime_type": mime_type,
                        "warnings": extraction["warnings"],
                        "total_contacts": totals["total_contacts"],
                        "classification_provider": classification_provider,
                    },
                    ensure_ascii=True,
                ),
            )

            batch = conn.execute(
                """
                SELECT
                    id,
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at,
                    confirmed_at
                FROM imports
                WHERE id = ?
                """,
                (import_id,),
            ).fetchone()
            candidates = conn.execute(
                """
                SELECT
                    id,
                    import_id,
                    email,
                    name,
                    company,
                    title,
                    status,
                    next_action,
                    suggested_message,
                    source,
                    notes,
                    raw_text,
                    decision,
                    reason,
                    created_at
                FROM import_candidates
                WHERE import_id = ?
                ORDER BY id ASC
                """,
                (import_id,),
            ).fetchall()

        self._send_json(
            {
                "batch": row_to_dict(batch),
                "candidates": [row_to_dict(row) for row in candidates],
                "warnings": extraction["warnings"],
                "stats": totals,
                "provider": extraction["provider"],
                "classification_provider": classification_provider,
                "capabilities": extraction["capabilities"],
            },
            status=HTTPStatus.CREATED,
        )

    def _confirm_import(self, path: str, payload: dict) -> None:
        import_id = extract_import_id(path)
        if import_id is None:
            self._send_json({"detail": "Import not found"}, status=HTTPStatus.NOT_FOUND)
            return

        requested_candidates = payload.get("candidates") or []
        now = now_iso()
        inserted_contacts = []

        with connection() as conn:
            batch = conn.execute("SELECT id FROM imports WHERE id = ?", (import_id,)).fetchone()
            if batch is None:
                self._send_json({"detail": "Import not found"}, status=HTTPStatus.NOT_FOUND)
                return

            for candidate in requested_candidates:
                candidate_id = int(candidate.get("id", 0))
                email = normalize_email(candidate.get("email"))
                name = clean_name(candidate.get("name")) or "A quien corresponda"
                company = clean_optional(candidate.get("company"))
                title = clean_optional(candidate.get("title"))
                status = normalize_status(candidate.get("status", "revisar"))
                next_action = normalize_next_action(candidate.get("next_action"))
                suggested_message = clean_optional(candidate.get("suggested_message"))
                source = str(candidate.get("source", "importacion")).strip() or "importacion"
                notes = clean_optional(candidate.get("notes"))
                decision = normalize_decision(candidate.get("decision", "pending"))
                reason = clean_optional(candidate.get("reason"))

                conn.execute(
                    """
                    UPDATE import_candidates
                    SET email = ?, name = ?, company = ?, title = ?, status = ?, next_action = ?, suggested_message = ?, source = ?, notes = ?, decision = ?, reason = ?
                    WHERE id = ? AND import_id = ?
                    """,
                    (
                        email,
                        name,
                        company,
                        title,
                        status,
                        next_action,
                        suggested_message,
                        source,
                        notes,
                        decision,
                        reason,
                        candidate_id,
                        import_id,
                    ),
                )

                if decision != "approve" or not email or not VALID_EMAIL_RE.fullmatch(email):
                    continue

                exists = conn.execute("SELECT id FROM contacts WHERE email = ?", (email,)).fetchone()
                if exists is not None:
                    conn.execute(
                        "UPDATE import_candidates SET decision = 'duplicate', reason = COALESCE(reason, 'Ya existia en contactos.') WHERE id = ? AND import_id = ?",
                        (candidate_id, import_id),
                    )
                    continue

                cursor = conn.execute(
                    """
                    INSERT INTO contacts (
                        email, name, company, title, status, next_action, suggested_message, follow_up_date, source, notes, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        email,
                        name,
                        company,
                        title,
                        status,
                        next_action,
                        suggested_message,
                        infer_follow_up_date_for_action(next_action),
                        source,
                        notes,
                        now,
                        now,
                    ),
                )
                contact_id = int(cursor.lastrowid)
                inserted_contacts.append({"id": contact_id, "email": email})
                insert_history(
                    conn,
                    event_type="contact.imported",
                    entity_type="contact",
                    entity_id=str(contact_id),
                    message=f"Imported contact {email} from batch {import_id}",
                    metadata_json=json.dumps({"import_id": import_id, "email": email}, ensure_ascii=True),
                )

            conn.execute(
                "UPDATE imports SET status = 'confirmed', confirmed_contacts = ?, confirmed_at = ? WHERE id = ?",
                (len(inserted_contacts), now, import_id),
            )
            insert_history(
                conn,
                event_type="import.confirmed",
                entity_type="import",
                entity_id=str(import_id),
                message=f"Confirmed import batch {import_id}",
                metadata_json=json.dumps({"confirmed_contacts": len(inserted_contacts)}, ensure_ascii=True),
            )
            updated_batch = conn.execute(
                """
                SELECT
                    id,
                    filename,
                    mime_type,
                    source,
                    total_contacts,
                    total_ready,
                    total_duplicates,
                    total_invalid,
                    confirmed_contacts,
                    status,
                    notes,
                    created_at,
                    confirmed_at
                FROM imports
                WHERE id = ?
                """,
                (import_id,),
            ).fetchone()

        self._send_json(
            {
                "batch": row_to_dict(updated_batch),
                "confirmed_contacts": len(inserted_contacts),
                "inserted_contacts": inserted_contacts,
            }
        )

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_csv(self, content: str, filename: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = content.encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


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
    text = str(value or "revisar").strip().lower()
    if text in {"mantener", "revisar", "seguimiento", "prioridad", "sacar", "portal"}:
        return text
    return "revisar"


def normalize_next_action(value: object) -> str:
    text = str(value or "revisar_manual").strip().lower()
    if text in {"enviar", "seguir", "portal", "descartar", "revisar_manual"}:
        return text
    return "revisar_manual"


def normalize_decision(value: object) -> str:
    text = str(value or "pending").strip().lower()
    if text in {"approve", "skip", "duplicate", "invalid", "pending"}:
        return text
    return "pending"


def normalize_follow_up_date(value: object) -> str | None:
    cleaned = clean_optional(value)
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned).isoformat()
    except ValueError:
        return None


def build_reporting_overview(contacts: list[dict], history: list[dict]) -> dict:
    today = datetime.now(timezone.utc).date()
    week_end = today + timedelta(days=6)
    queue = {
        "overdue": 0,
        "due_today": 0,
        "due_this_week": 0,
        "without_date": 0,
        "active_total": 0,
    }
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
            normalized_portal_status = (portal_status or "pendiente").lower()
            if normalized_portal_status not in portal_statuses:
                normalized_portal_status = "pendiente"
            portal_statuses[normalized_portal_status] += 1

        if status == "sacar":
            normalized_reason = (discard_reason or "sin_detalle").lower()
            discard_reasons[normalized_reason] = discard_reasons.get(normalized_reason, 0) + 1

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
            {"key": key, "label": key.replace("_", " "), "count": count}
            for key, count in sorted(statuses.items(), key=lambda item: (-item[1], item[0]))
        ],
        "pipeline": {
            "by_status": [
                {"key": key, "label": key.replace("_", " "), "count": count}
                for key, count in sorted(statuses.items(), key=lambda item: (-item[1], item[0]))
            ],
            "by_action": [
                {"key": key, "label": key.replace("_", " "), "count": count}
                for key, count in sorted(actions.items(), key=lambda item: (-item[1], item[0]))
            ],
        },
        "outcomes": {
            "portal": portal_statuses,
            "discard": {
                "total": sum(discard_reasons.values()),
                "reasons": [
                    {"key": key, "label": key.replace("_", " "), "count": count}
                    for key, count in sorted(discard_reasons.items(), key=lambda item: (-item[1], item[0]))
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


def build_reporting_overview_payload(conn) -> dict:
    contact_rows = conn.execute(
        """
        SELECT
            id,
            status,
            next_action,
            follow_up_date,
            portal_status,
            discard_reason,
            updated_at
        FROM contacts
        """
    ).fetchall()
    history_rows = conn.execute(
        """
        SELECT event_type, metadata_json, created_at
        FROM history
        WHERE event_type = 'contact.action_executed'
          AND created_at >= ?
        ORDER BY created_at DESC, id DESC
        """,
        ((datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec="seconds"),),
    ).fetchall()

    contacts = [row_to_dict(row) for row in contact_rows]
    history = [row_to_dict(row) for row in history_rows]
    return build_reporting_overview(contacts, history)


def persist_reporting_snapshot(conn, overview: dict) -> None:
    snapshot_date = overview.get("snapshot_date")
    queue = overview.get("queue", {})
    now = now_iso()
    conn.execute(
        """
        INSERT INTO reporting_snapshots (
            snapshot_date,
            total_contacts,
            active_total,
            overdue_count,
            due_today_count,
            due_this_week_count,
            without_date_count,
            statuses_json,
            actions_json,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(snapshot_date) DO UPDATE SET
            total_contacts = excluded.total_contacts,
            active_total = excluded.active_total,
            overdue_count = excluded.overdue_count,
            due_today_count = excluded.due_today_count,
            due_this_week_count = excluded.due_this_week_count,
            without_date_count = excluded.without_date_count,
            statuses_json = excluded.statuses_json,
            actions_json = excluded.actions_json,
            updated_at = excluded.updated_at
        """,
        (
            snapshot_date,
            int(sum(item.get("count", 0) for item in overview.get("pipeline", {}).get("by_status", []))),
            int(queue.get("active_total", 0)),
            int(queue.get("overdue", 0)),
            int(queue.get("due_today", 0)),
            int(queue.get("due_this_week", 0)),
            int(queue.get("without_date", 0)),
            json.dumps(overview.get("pipeline", {}).get("by_status", []), ensure_ascii=True),
            json.dumps(overview.get("pipeline", {}).get("by_action", []), ensure_ascii=True),
            now,
            now,
        ),
    )


def get_previous_reporting_snapshot(conn, snapshot_date: str) -> dict | None:
    row = conn.execute(
        """
        SELECT
            snapshot_date,
            total_contacts,
            active_total,
            overdue_count,
            due_today_count,
            due_this_week_count,
            without_date_count,
            statuses_json,
            actions_json,
            created_at,
            updated_at
        FROM reporting_snapshots
        WHERE snapshot_date < ?
        ORDER BY snapshot_date DESC
        LIMIT 1
        """,
        (snapshot_date,),
    ).fetchone()
    return row_to_dict(row) if row is not None else None


def get_recent_reporting_snapshots(conn, limit: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            snapshot_date,
            total_contacts,
            active_total,
            overdue_count,
            due_today_count,
            due_this_week_count,
            without_date_count
        FROM reporting_snapshots
        ORDER BY snapshot_date DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def build_stock_comparison(overview: dict, previous_snapshot: dict | None) -> dict:
    queue = overview.get("queue", {})
    current = {
        "total_contacts": int(sum(item.get("count", 0) for item in overview.get("pipeline", {}).get("by_status", []))),
        "active_total": int(queue.get("active_total", 0)),
        "overdue_count": int(queue.get("overdue", 0)),
        "without_date_count": int(queue.get("without_date", 0)),
    }
    if previous_snapshot is None:
        return {
            "previous_snapshot_date": None,
            "current": current,
            "deltas": {
                "total_contacts": 0,
                "active_total": 0,
                "overdue_count": 0,
                "without_date_count": 0,
            },
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
    writer.writerow(
        [
            "snapshot_date",
            "total_contacts",
            "active_total",
            "overdue_count",
            "due_today_count",
            "due_this_week_count",
            "without_date_count",
        ]
    )
    for snapshot in snapshots:
        writer.writerow(
            [
                snapshot.get("snapshot_date", ""),
                snapshot.get("total_contacts", 0),
                snapshot.get("active_total", 0),
                snapshot.get("overdue_count", 0),
                snapshot.get("due_today_count", 0),
                snapshot.get("due_this_week_count", 0),
                snapshot.get("without_date_count", 0),
            ]
        )
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


def parse_metadata_json(value: object) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


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


def extract_contact_id(path: str) -> int | None:
    match = re.fullmatch(r"/contacts/(\d+)/execute", path)
    if not match:
        return None
    return int(match.group(1))


def extract_contact_history_id(path: str) -> int | None:
    match = re.fullmatch(r"/contacts/(\d+)/history", path)
    if not match:
        return None
    return int(match.group(1))


def extract_import_id(path: str) -> int | None:
    match = re.fullmatch(r"/imports/(\d+)(?:/confirm)?", path)
    if not match:
        return None
    return int(match.group(1))


def extract_candidates_from_file(filename: str, mime_type: str, raw_bytes: bytes) -> dict:
    capabilities = get_runtime_capabilities()
    warnings: list[str] = []
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    text = ""
    provider = "direct"

    if mime_type.startswith("text/") or extension in {"txt", "csv"}:
        text = decode_text(raw_bytes)
    elif extension == "xlsx" or "spreadsheetml" in mime_type:
        text = extract_text_from_xlsx(raw_bytes)
    elif extension == "pdf" or mime_type == "application/pdf":
        text = extract_text_from_pdf(raw_bytes)
        if EMAIL_RE.search(text or ""):
            provider = "pdf_text"
        elif capabilities["openai_enabled"]:
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_pdf"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR del PDF por API: {exc}")
        else:
            warnings.append("No pude sacar texto util del PDF. Si es escaneado, agrega OPENAI_API_KEY o instala OCR local.")
    elif mime_type.startswith("image/") or extension in {"png", "jpg", "jpeg", "gif", "webp"}:
        if capabilities["tesseract_available"]:
            try:
                text = extract_text_with_tesseract(raw_bytes, extension, capabilities["tesseract_path"])
                provider = "tesseract"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR local con Tesseract: {exc}")
        elif capabilities["openai_enabled"]:
            try:
                text = extract_text_with_openai(raw_bytes, filename, mime_type)
                provider = "openai_image"
            except Exception as exc:
                warnings.append(f"No pude hacer OCR de la imagen por API: {exc}")
        else:
            warnings.append("Las imagenes necesitan OCR local o OPENAI_API_KEY para extraer texto.")
    else:
        text = decode_text(raw_bytes)

    emails = extract_emails(text)
    if not emails and capabilities["openai_enabled"] and provider in {"direct", "pdf_text"} and extension in {"pdf"}:
        try:
            text = extract_text_with_openai(raw_bytes, filename, mime_type)
            provider = "openai_pdf"
            emails = extract_emails(text)
        except Exception as exc:
            warnings.append(f"No pude reintentar el PDF con OpenAI: {exc}")

    return {
        "filename": filename,
        "mime_type": mime_type,
        "text": text,
        "emails": emails,
        "warnings": warnings,
        "provider": provider,
        "capabilities": capabilities,
        "notes": build_extraction_notes(filename, warnings, len(emails), provider),
    }


def build_extraction_notes(filename: str, warnings: list[str], total_emails: int, provider: str) -> str:
    note = f"Preview generada desde {filename}. {total_emails} correos detectados. Motor: {provider}."
    if warnings:
        note = f"{note} {' '.join(warnings)}"
    return note


def decode_text(raw_bytes: bytes) -> str:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="ignore")


def get_runtime_capabilities() -> dict:
    tesseract_path = resolve_tesseract_path()
    openai_enabled = bool(os.getenv("OPENAI_API_KEY"))
    providers = []
    if tesseract_path:
        providers.append("tesseract")
    if openai_enabled:
        providers.append("openai")
    return {
        "tesseract_available": bool(tesseract_path),
        "tesseract_path": tesseract_path,
        "openai_enabled": openai_enabled,
        "providers": providers,
    }


def resolve_tesseract_path() -> str | None:
    direct = shutil.which("tesseract")
    if direct:
        return direct
    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for candidate in common_paths:
        if os.path.exists(candidate):
            return candidate
    return None


def extract_text_with_tesseract(raw_bytes: bytes, extension: str, tesseract_path: str | None) -> str:
    if not tesseract_path:
        raise RuntimeError("Tesseract no esta instalado.")
    suffix = f".{extension}" if extension else ".img"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(raw_bytes)
        temp_input = handle.name
    try:
        result = subprocess.run(
            [tesseract_path, temp_input, "stdout", "-l", "spa+eng"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or "OCR local fallo."
            raise RuntimeError(message)
        return result.stdout
    finally:
        try:
            os.remove(temp_input)
        except OSError:
            pass


def extract_text_with_openai(raw_bytes: bytes, filename: str, mime_type: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no esta configurada.")

    prompt = (
        "Extrae todo el texto visible del archivo y prioriza correos electronicos. "
        "Devuelve texto plano legible, sin markdown."
    )
    payload = {
        "model": os.getenv("OPENAI_OCR_MODEL", "gpt-4.1-mini"),
        "input": [
            {
                "role": "user",
                "content": build_openai_content(prompt, raw_bytes, filename, mime_type),
            }
        ],
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=90) as response:
            raw_response = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI devolvio {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"No pude conectar con OpenAI: {exc.reason}") from exc

    parsed = json.loads(raw_response)
    text = collect_openai_output_text(parsed)
    if not text.strip():
        raise RuntimeError("OpenAI no devolvio texto util.")
    return text


def build_openai_content(prompt: str, raw_bytes: bytes, filename: str, mime_type: str) -> list[dict]:
    file_data = base64.b64encode(raw_bytes).decode("ascii")
    if mime_type.startswith("image/"):
        return [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:{mime_type};base64,{file_data}"},
        ]
    return [
        {"type": "input_text", "text": prompt},
        {
            "type": "input_file",
            "filename": filename,
            "file_data": f"data:{mime_type};base64,{file_data}",
        },
    ]


def collect_openai_output_text(payload: dict) -> str:
    fragments: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                fragments.append(content.get("text", ""))
    if fragments:
        return "\n".join(fragment for fragment in fragments if fragment)
    return str(payload.get("output_text", "") or "")


def extract_text_from_pdf(raw_bytes: bytes) -> str:
    return raw_bytes.decode("latin-1", errors="ignore")


def extract_text_from_xlsx(raw_bytes: bytes) -> str:
    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared_strings: list[str] = []
    text_chunks: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", namespace):
                shared_strings.append("".join(item.itertext()))

        for name in archive.namelist():
            if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):
                continue
            root = ET.fromstring(archive.read(name))
            for cell in root.findall(".//main:c", namespace):
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", namespace)
                if value_node is None or value_node.text is None:
                    continue
                value = value_node.text
                if cell_type == "s":
                    try:
                        text_chunks.append(shared_strings[int(value)])
                    except (ValueError, IndexError):
                        text_chunks.append(value)
                else:
                    text_chunks.append(value)
    return "\n".join(text_chunks)


def extract_emails(text: str) -> list[str]:
    return [match.lower() for match in EMAIL_RE.findall(text or "")]


def prepare_candidates(extraction: dict, existing_emails: set[str]) -> list[dict]:
    seen_in_file: set[str] = set()
    prepared: list[dict] = []

    for email in sorted(set(extraction["emails"])):
        normalized_email = normalize_email(email)
        if not normalized_email:
            continue

        domain = normalized_email.split("@", 1)[1] if "@" in normalized_email else ""
        company = infer_company(domain)
        contact = infer_contact(normalized_email)
        decision = "approve"
        reason = ""
        status = infer_status(contact)

        if normalized_email in existing_emails or normalized_email in seen_in_file:
            decision = "duplicate"
            reason = "El correo ya existe en la base o se repite dentro del archivo."
        elif not VALID_EMAIL_RE.fullmatch(normalized_email):
            decision = "invalid"
            reason = "Formato de email invalido."

        seen_in_file.add(normalized_email)
        prepared.append(
            {
                "email": normalized_email,
                "name": contact,
                "company": company,
                "title": None,
                "status": status,
                "source": "importacion",
                "notes": None,
                "raw_text": normalized_email,
                "decision": decision,
                "reason": reason,
            }
        )

    if not prepared and extraction["warnings"]:
        prepared.append(
            {
                "email": None,
                "name": "A quien corresponda",
                "company": None,
                "title": None,
                "status": "revisar",
                "source": "importacion",
                "notes": "No hubo correos detectables en este archivo.",
                "raw_text": extraction["filename"],
                "decision": "invalid",
                "reason": extraction["warnings"][0],
            }
        )
    return prepared


def classify_candidates(candidates: list[dict], *, capabilities: dict) -> tuple[list[dict], str]:
    classified = [dict(candidate) for candidate in candidates]
    classified = [apply_heuristic_classification(candidate) for candidate in classified]

    if capabilities.get("openai_enabled"):
        try:
            return classify_candidates_with_openai(classified), "openai"
        except Exception:
            return classified, "heuristic"
    return classified, "heuristic"


def apply_heuristic_classification(candidate: dict) -> dict:
    if candidate["decision"] in {"duplicate", "invalid"}:
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    email = candidate.get("email") or ""
    name = candidate.get("name") or ""
    company = candidate.get("company") or ""
    local_part = email.split("@", 1)[0].lower() if email else ""

    if name == "A quien corresponda":
        candidate["status"] = "revisar"
        candidate["reason"] = candidate["reason"] or "Contacto generico; conviene revisar antes de enviar."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    if any(token in local_part for token in ("career", "jobs", "empleo", "postul")):
        candidate["status"] = "portal"
        candidate["reason"] = candidate["reason"] or "El correo parece orientado a empleo o portal."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    if company in {"SLB", "YPF", "TGS"}:
        candidate["status"] = "prioridad"
        candidate["reason"] = candidate["reason"] or "Empresa prioritaria detectada por dominio."
        candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
        candidate["suggested_message"] = build_suggested_message(candidate)
        return candidate

    candidate["status"] = candidate["status"] or "mantener"
    candidate["reason"] = candidate["reason"] or "Clasificacion inicial por heuristica local."
    candidate["next_action"] = infer_next_action(candidate["status"], candidate["decision"])
    candidate["suggested_message"] = build_suggested_message(candidate)
    return candidate


def classify_candidates_with_openai(candidates: list[dict]) -> list[dict]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no esta configurada.")

    prompt = (
        "Clasifica cada contacto en uno de estos estados: mantener, revisar, seguimiento, prioridad, sacar, portal. "
        "Ademas propone next_action en uno de estos valores: enviar, seguir, portal, descartar, revisar_manual. "
        "Tambien devolve suggested_message corto para usar como siguiente paso. "
        "Devuelve JSON valido con la forma {'items':[{'email':'...','status':'...','reason':'...','next_action':'...','suggested_message':'...'}]}. "
        "Usa reasons cortos y concretos. No inventes emails."
    )
    compact_candidates = [
        {
            "email": candidate.get("email"),
            "name": candidate.get("name"),
            "company": candidate.get("company"),
            "decision": candidate.get("decision"),
            "reason": candidate.get("reason"),
        }
        for candidate in candidates
        if candidate.get("email")
    ]
    payload = {
        "model": os.getenv("OPENAI_CLASSIFIER_MODEL", os.getenv("OPENAI_OCR_MODEL", "gpt-4.1-mini")),
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_text", "text": json.dumps(compact_candidates, ensure_ascii=False)},
                ],
            }
        ],
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=90) as response:
            raw_response = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI devolvio {exc.code}: {detail}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"No pude conectar con OpenAI: {exc.reason}") from exc

    text = collect_openai_output_text(json.loads(raw_response))
    items = parse_json_items(text)
    by_email = {item.get("email"): item for item in items if item.get("email")}

    for candidate in candidates:
        match = by_email.get(candidate.get("email"))
        if not match:
            candidate["next_action"] = infer_next_action(candidate.get("status"), candidate.get("decision"))
            candidate["suggested_message"] = build_suggested_message(candidate)
            continue
        candidate["status"] = normalize_status(match.get("status", candidate.get("status")))
        candidate["reason"] = clean_optional(match.get("reason")) or candidate.get("reason")
        candidate["next_action"] = normalize_next_action(match.get("next_action"))
        candidate["suggested_message"] = clean_optional(match.get("suggested_message")) or build_suggested_message(candidate)
    return candidates


def parse_json_items(text: str) -> list[dict]:
    cleaned = text.strip()
    if not cleaned:
        return []
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return []
        parsed = json.loads(match.group(0))
    items = parsed.get("items") if isinstance(parsed, dict) else parsed
    return items if isinstance(items, list) else []


def infer_next_action(status: str | None, decision: str | None) -> str:
    normalized_status = normalize_status(status)
    normalized_decision = normalize_decision(decision)
    if normalized_decision in {"duplicate", "invalid"}:
        return "descartar"
    if normalized_status == "portal":
        return "portal"
    if normalized_status == "prioridad":
        return "seguir"
    if normalized_status == "revisar":
        return "revisar_manual"
    if normalized_status == "seguimiento":
        return "seguir"
    if normalized_status == "sacar":
        return "descartar"
    return "enviar"


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


def infer_follow_up_date_for_action(action: object) -> str | None:
    normalized_action = normalize_next_action(action)
    today = datetime.now(timezone.utc).date()
    if normalized_action == "enviar":
        return (today + timedelta(days=3)).isoformat()
    if normalized_action == "seguir":
        return (today + timedelta(days=7)).isoformat()
    return None


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
    if action == "descartar":
        if discard_reason:
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


def build_suggested_message(candidate: dict) -> str:
    company = candidate.get("company") or "la empresa"
    name = candidate.get("name") or "A quien corresponda"
    next_action = normalize_next_action(candidate.get("next_action"))
    if next_action == "portal":
        return f"Revisar si {company} deriva a portal y cargar CV antes de reenviar correo."
    if next_action == "seguir":
        return f"Hacer seguimiento corto a {name} en {company} con recordatorio y CV actualizado."
    if next_action == "descartar":
        return f"No insistir con este contacto en {company}; dejarlo fuera de la siguiente corrida."
    if next_action == "revisar_manual":
        return f"Revisar manualmente el contacto de {company} antes de enviar."
    return f"Enviar presentacion breve a {name} en {company} con CV adjunto."


def summarize_candidates(candidates: list[dict]) -> dict:
    return {
        "total_contacts": len([item for item in candidates if item.get("email")]),
        "total_ready": sum(1 for item in candidates if item["decision"] == "approve"),
        "total_duplicates": sum(1 for item in candidates if item["decision"] == "duplicate"),
        "total_invalid": sum(1 for item in candidates if item["decision"] == "invalid"),
    }


def infer_company(domain: str) -> str | None:
    clean_domain = domain.lower().strip()
    if not clean_domain:
        return None
    if clean_domain in DOMAIN_OVERRIDES:
        return DOMAIN_OVERRIDES[clean_domain]

    parts = [part for part in clean_domain.split(".") if part]
    if len(parts) >= 3 and parts[-2] in {"com", "org", "net", "gov"}:
        base = parts[-3]
    elif len(parts) >= 2:
        base = parts[-2]
    else:
        base = parts[0]

    if base in DOMAIN_OVERRIDES:
        return DOMAIN_OVERRIDES[base]
    if len(base) <= 4:
        return base.upper()
    return base.replace("-", " ").title()


def infer_contact(email: str) -> str:
    local_part = email.split("@", 1)[0]
    normalized = re.sub(r"[0-9]+", " ", local_part)
    normalized = re.sub(r"[._-]+", " ", normalized).strip()
    if not normalized:
        return "A quien corresponda"
    parts = [part for part in normalized.split() if part]
    if not parts:
        return "A quien corresponda"
    if any(part.lower() in GENERIC_CONTACT_TOKENS for part in parts):
        return "A quien corresponda"
    if all(len(part) <= 2 for part in parts):
        return "A quien corresponda"
    return " ".join(part.capitalize() for part in parts)


def infer_status(contact: str) -> str:
    if contact == "A quien corresponda":
        return "revisar"
    return "mantener"


def main() -> None:
    init_db()
    with connection() as conn:
        overview = build_reporting_overview_payload(conn)
        persist_reporting_snapshot(conn, overview)
    server = ThreadingHTTPServer(("127.0.0.1", 8000), CRMHandler)
    print("CRM backend running on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
