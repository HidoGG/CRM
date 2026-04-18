from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .db import connection, init_db, insert_history, now_iso, row_to_dict
from .schemas import ContactCreate, ContactRead, MockImportCreate, MockImportRead, SummaryRead


app = FastAPI(
    title="CRM Local API",
    version="0.1.0",
    description="Minimal FastAPI backend for contacts, imports, and history.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "crm-local-api"}


@app.get("/contacts", response_model=list[ContactRead])
def list_contacts(
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                email,
                name,
                company,
                title,
                status,
                source,
                notes,
                created_at,
                updated_at
            FROM contacts
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    return [row_to_dict(row) for row in rows]


@app.get("/summary", response_model=SummaryRead)
def get_summary() -> dict[str, int]:
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
    return {
        "total_contacts": int(total_contacts),
        "total_companies": int(total_companies),
        "priority_contacts": int(priority_contacts),
        "review_contacts": int(review_contacts),
        "imports_count": int(imports_count),
    }


@app.post("/contacts", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
def create_contact(payload: ContactCreate) -> dict:
    email = normalize_email(payload.email)
    validate_email(email)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name cannot be empty")

    now = now_iso()
    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM contacts WHERE email = ?",
            (email,),
        ).fetchone()
        if existing is not None:
            raise HTTPException(status_code=409, detail="contact email already exists")

        cursor = conn.execute(
            """
            INSERT INTO contacts (
                email,
                name,
                company,
                title,
                status,
                source,
                notes,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email,
                name,
                clean_optional(payload.company),
                clean_optional(payload.title),
                payload.status.strip() or "active",
                payload.source.strip() or "manual",
                clean_optional(payload.notes),
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
            metadata_json=json.dumps(
                {
                    "email": email,
                    "name": name,
                    "company": payload.company,
                    "title": payload.title,
                    "status": payload.status,
                    "source": payload.source,
                },
                ensure_ascii=True,
            ),
        )

        row = conn.execute(
            """
            SELECT
                id,
                email,
                name,
                company,
                title,
                status,
                source,
                notes,
                created_at,
                updated_at
            FROM contacts
            WHERE id = ?
            """,
            (contact_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=500, detail="failed to create contact")
    return row_to_dict(row)


@app.post("/imports/mock", response_model=MockImportRead, status_code=status.HTTP_201_CREATED)
def create_mock_import(payload: MockImportCreate) -> dict:
    filename = payload.filename.strip()
    source = payload.source.strip() or "manual"
    now = now_iso()
    metadata = json.dumps(
        {
            "filename": filename,
            "source": source,
            "total_contacts": payload.total_contacts,
            "notes": payload.notes,
        },
        ensure_ascii=True,
    )

    with connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO imports (
                filename,
                source,
                total_contacts,
                notes,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                filename,
                source,
                payload.total_contacts,
                clean_optional(payload.notes),
                now,
            ),
        )
        import_id = int(cursor.lastrowid)
        history_id = insert_history(
            conn,
            event_type="import.mock_created",
            entity_type="import",
            entity_id=str(import_id),
            message=f"Registered mock import {filename}",
            metadata_json=metadata,
        )

    return {
        "id": import_id,
        "filename": filename,
        "source": source,
        "total_contacts": payload.total_contacts,
        "notes": clean_optional(payload.notes),
        "created_at": now,
        "history_id": history_id,
        "extra": {"mode": "mock"},
    }


@app.get("/imports", response_model=list[MockImportRead])
def list_imports(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                filename,
                source,
                total_contacts,
                notes,
                created_at
            FROM imports
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    return [
        {
            **row_to_dict(row),
            "history_id": 0,
            "extra": {"mode": "mock"},
        }
        for row in rows
    ]


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def validate_email(value: str) -> None:
    if not EMAIL_RE.fullmatch(value):
        raise HTTPException(status_code=422, detail="invalid email format")


def clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
