from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime, timezone

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

class Contact(SQLModel, table=True):
    __tablename__ = "contacts"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    company: Optional[str] = None
    title: Optional[str] = None
    status: str = Field(default="active")
    next_action: Optional[str] = None
    suggested_message: Optional[str] = None
    source: str = Field(default="manual")
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    follow_up_date: Optional[str] = None
    portal_url: Optional[str] = None
    portal_status: Optional[str] = None
    discard_reason: Optional[str] = None

class ImportCandidate(SQLModel, table=True):
    __tablename__ = "import_candidates"
    id: Optional[int] = Field(default=None, primary_key=True)
    import_id: int = Field(foreign_key="imports.id", index=True)
    email: Optional[str] = None
    name: str
    company: Optional[str] = None
    title: Optional[str] = None
    status: str = Field(default="revisar")
    next_action: Optional[str] = None
    suggested_message: Optional[str] = None
    source: str = Field(default="importacion")
    notes: Optional[str] = None
    raw_text: Optional[str] = None
    decision: str = Field(default="pending")
    reason: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    
    import_batch: Optional["Import"] = Relationship(back_populates="candidates")

class Import(SQLModel, table=True):
    __tablename__ = "imports"
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    mime_type: Optional[str] = None
    source: str = Field(default="manual")
    total_contacts: int = Field(default=0)
    total_ready: int = Field(default=0)
    total_duplicates: int = Field(default=0)
    total_invalid: int = Field(default=0)
    confirmed_contacts: int = Field(default=0)
    status: str = Field(default="draft")
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    confirmed_at: Optional[str] = None

    candidates: List[ImportCandidate] = Relationship(back_populates="import_batch")

class History(SQLModel, table=True):
    __tablename__ = "history"
    id: Optional[int] = Field(default=None, primary_key=True)
    event_type: str
    entity_type: str
    entity_id: Optional[str] = None
    message: str
    metadata_json: Optional[str] = None
    created_at: str = Field(default_factory=now_iso, index=True)

class ReportingSnapshot(SQLModel, table=True):
    __tablename__ = "reporting_snapshots"
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_date: str = Field(unique=True, index=True)
    total_contacts: int = Field(default=0)
    active_total: int = Field(default=0)
    overdue_count: int = Field(default=0)
    due_today_count: int = Field(default=0)
    due_this_week_count: int = Field(default=0)
    without_date_count: int = Field(default=0)
    statuses_json: Optional[str] = None
    actions_json: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
