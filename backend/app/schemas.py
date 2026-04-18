from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    email: str = Field(..., description="Primary email address")
    name: str = Field(..., min_length=1)
    company: str | None = None
    title: str | None = None
    status: str = Field(default="active")
    source: str = Field(default="manual")
    notes: str | None = None


class ContactRead(ContactCreate):
    id: int
    created_at: str
    updated_at: str


class MockImportCreate(BaseModel):
    filename: str = Field(default="mock_import.csv", min_length=1)
    source: str = Field(default="manual", min_length=1)
    total_contacts: int = Field(default=0, ge=0)
    notes: str | None = None


class MockImportRead(MockImportCreate):
    id: int
    created_at: str
    history_id: int
    extra: dict[str, Any] | None = None


class SummaryRead(BaseModel):
    total_contacts: int
    total_companies: int
    priority_contacts: int
    review_contacts: int
    imports_count: int
