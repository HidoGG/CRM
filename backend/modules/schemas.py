"""Modelos Pydantic de entrada para la API.

Validan tipo y forma ANTES de llegar a la capa de servicio. La normalización
de valores (status, next_action, fechas) sigue viviendo en crm_service para
mantener una sola fuente de verdad.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from modules.crm_service import VALID_EMAIL_RE


# ---------------------------------------------------------------------------
# Contactos
# ---------------------------------------------------------------------------

class ContactCreate(BaseModel):
    email: str
    name: str = ""
    company: str | None = None
    title: str | None = None
    status: str = "mantener"
    next_action: str = "enviar"
    suggested_message: str | None = None
    follow_up_date: str | None = None
    portal_url: str | None = None
    portal_status: str | None = None
    discard_reason: str | None = None
    source: str = "manual"
    notes: str | None = None
    schedule_id: int | None = None
    industry: str | None = None

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, v: str) -> str:
        cleaned = str(v or "").strip().lower()
        if not VALID_EMAIL_RE.fullmatch(cleaned):
            raise ValueError("formato de email inválido")
        return cleaned


class ContactUpdate(BaseModel):
    """PATCH parcial: sólo se aplican los campos presentes en el payload."""
    email: str | None = None
    name: str | None = None
    company: str | None = None
    title: str | None = None
    status: str | None = None
    next_action: str | None = None
    suggested_message: str | None = None
    follow_up_date: str | None = None
    portal_url: str | None = None
    portal_status: str | None = None
    discard_reason: str | None = None
    notes: str | None = None
    industry: str | None = None
    alternative_email: str | None = None
    autoreply_reason: str | None = None

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = str(v).strip().lower()
        if not VALID_EMAIL_RE.fullmatch(cleaned):
            raise ValueError("formato de email inválido")
        return cleaned


class ContactAction(BaseModel):
    action: str | None = None
    note: str | None = None
    follow_up_date: str | None = None
    portal_url: str | None = None
    portal_status: str | None = None
    discard_reason: str | None = None


# ---------------------------------------------------------------------------
# Importaciones
# ---------------------------------------------------------------------------

class MockImport(BaseModel):
    filename: str = "mock_import.csv"
    source: str = "manual"
    total_contacts: int = Field(default=0, ge=0)
    notes: str | None = None


class ImportCandidate(BaseModel):
    id: int = 0
    email: str | None = None
    name: str = ""
    company: str | None = None
    title: str | None = None
    status: str = "revisar"
    next_action: str | None = None
    suggested_message: str | None = None
    source: str = "importacion"
    notes: str | None = None
    decision: str = "pending"
    reason: str | None = None
    industry: str | None = None


class ImportConfirm(BaseModel):
    candidates: list[ImportCandidate] = Field(default_factory=list)
    template_id: int | None = None
    cv_file_id: int | None = None
    schedule_id: int | None = None


# ---------------------------------------------------------------------------
# Plantillas
# ---------------------------------------------------------------------------

class TemplateCreate(BaseModel):
    name: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    body: str | None = None


# ---------------------------------------------------------------------------
# CVs
# ---------------------------------------------------------------------------

class CvComment(BaseModel):
    comment: str = ""


# ---------------------------------------------------------------------------
# Rubros / Sectores
# ---------------------------------------------------------------------------

class SectorDefaultUpdate(BaseModel):
    template_id: int | None = None
    cv_file_id: int | None = None


# ---------------------------------------------------------------------------
# Email jobs
# ---------------------------------------------------------------------------

class EmailJobCreate(BaseModel):
    contact_id: int
    template_id: int | None = None
    cv_file_id: int | None = None
    frequency_days: int = Field(default=0, ge=0)
    scheduled_at: str | None = None


# ---------------------------------------------------------------------------
# Cronogramas
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1)
    interval_minutes: int = Field(default=30, ge=1)
    start_hour_art: int = Field(default=8, ge=0, le=23)
    end_hour_art: int = Field(default=18, ge=0, le=23)


class ScheduleUpdate(BaseModel):
    name: str | None = None
    interval_minutes: int | None = Field(default=None, ge=1)
    start_hour_art: int | None = Field(default=None, ge=0, le=23)
    end_hour_art: int | None = Field(default=None, ge=0, le=23)


# ---------------------------------------------------------------------------
# Career / Agente de RRHH
# ---------------------------------------------------------------------------

class CareerDraftRequest(BaseModel):
    cv_id: int | None = None
    to: str | None = None

    @field_validator("to")
    @classmethod
    def to_email_must_be_valid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = str(v).strip().lower()
        if not VALID_EMAIL_RE.fullmatch(cleaned):
            raise ValueError("formato de email inválido")
        return cleaned
