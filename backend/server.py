from __future__ import annotations

# Load .env before any module import that reads os.environ at module level
from dotenv import load_dotenv
load_dotenv()

import io
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import modules.crm_service as crm_service
import modules.ocr_service as ocr_service
from modules.crm_service import ServiceError
from modules.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "crm-api"}


@app.get("/contacts")
def list_contacts(limit: int = 100, offset: int = 0):
    return crm_service.get_contacts(limit, offset)


@app.get("/contacts/{contact_id}/history")
def contact_history(contact_id: int):
    try:
        return crm_service.get_contact_history(contact_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/contacts", status_code=201)
async def create_contact(request: Request):
    payload = await request.json()
    try:
        return crm_service.create_contact(payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/contacts/{contact_id}/execute")
async def execute_action(contact_id: int, request: Request):
    payload = await request.json()
    try:
        return crm_service.execute_contact_action(contact_id, payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.get("/summary")
def summary():
    return crm_service.get_summary()


@app.get("/reporting/overview")
def reporting_overview():
    return crm_service.get_reporting_overview()


@app.get("/reporting/export.csv")
def export_csv(type: str = "snapshots", limit: int = 30):
    limit = max(1, min(limit, 365))
    content, filename = crm_service.export_reporting_csv(type, limit)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/capabilities")
def capabilities():
    return ocr_service.get_runtime_capabilities()


@app.get("/imports")
def list_imports(limit: int = 50, offset: int = 0):
    return crm_service.get_imports(limit, offset)


@app.post("/imports/mock", status_code=201)
async def mock_import(request: Request):
    payload = await request.json()
    try:
        return crm_service.create_mock_import(payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/imports/preview", status_code=201)
async def preview_import(
    file: UploadFile = File(...),
    source: str = Form("upload_ui"),
):
    raw_bytes = await file.read()
    filename = file.filename or "archivo.txt"
    mime_type = file.content_type or "application/octet-stream"
    try:
        return crm_service.preview_import(filename, mime_type, raw_bytes, source)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/imports/{import_id}/confirm")
async def confirm_import(import_id: int, request: Request):
    payload = await request.json()
    try:
        return crm_service.confirm_import(import_id, payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.get("/imports/{import_id}")
def import_detail(import_id: int):
    try:
        return crm_service.get_import_detail(import_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
