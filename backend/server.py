from __future__ import annotations

# Load .env before any module import that reads os.environ at module level
from dotenv import load_dotenv
load_dotenv()

import io
import os
import secrets
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

import modules.crm_service as crm_service
import modules.ocr_service as ocr_service
from modules.crm_service import ServiceError
from modules.database import init_db

CV_UPLOAD_DIR = Path(__file__).parent / "uploads" / "cv"
CV_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_scheduler = BackgroundScheduler()

# Paths that bypass API key auth (Google OAuth callback + health check)
_AUTH_EXEMPT = {"/health", "/gmail/callback"}

# API key leída una sola vez al iniciar. Si no está definida, auth desactivada (dev local).
_CRM_API_KEY = os.getenv("CRM_API_KEY", "").strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _scheduler.add_job(
        crm_service.process_pending_email_jobs,
        trigger="interval",
        minutes=10,
        id="email_sender",
        replace_existing=True,
    )
    _scheduler.start()
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS: en producción sólo permite el frontend de Vercel.
# En desarrollo (sin FRONTEND_URL) permite localhost.
# ---------------------------------------------------------------------------
_frontend_url = os.getenv("FRONTEND_URL", "").strip()
_origins = [_frontend_url] if _frontend_url else [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Middleware de autenticación por API Key
# Se agrega DESPUÉS de CORSMiddleware, por lo que corre como capa exterior.
# OPTIONS (preflight CORS) y las rutas exentas pasan sin validación.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    # Dejar pasar preflight CORS y rutas exentas sin verificar key
    if request.method == "OPTIONS" or request.url.path in _AUTH_EXEMPT:
        return await call_next(request)

    # Si no hay key configurada (entorno local sin .env), omitir verificación
    if not _CRM_API_KEY:
        return await call_next(request)

    provided = request.headers.get("X-API-Key", "")
    if not provided or not secrets.compare_digest(provided, _CRM_API_KEY):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: X-API-Key inválida o ausente."},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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


@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int):
    try:
        return crm_service.delete_contact(contact_id)
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


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@app.get("/templates")
def list_templates():
    return crm_service.get_templates()


@app.post("/templates", status_code=201)
async def create_template(request: Request):
    payload = await request.json()
    try:
        return crm_service.create_template(payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/templates/{template_id}")
async def update_template(template_id: int, request: Request):
    payload = await request.json()
    try:
        return crm_service.update_template(template_id, payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.delete("/templates/{template_id}")
def delete_template(template_id: int):
    try:
        return crm_service.delete_template(template_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/templates/{template_id}/default")
def set_default_template(template_id: int):
    try:
        return crm_service.set_default_template(template_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


# ---------------------------------------------------------------------------
# CV files
# ---------------------------------------------------------------------------

@app.get("/cv-files")
def list_cv_files():
    return crm_service.get_cv_files()


@app.post("/cv-files", status_code=201)
async def upload_cv(file: UploadFile = File(...), comment: str = Form("")):
    ext = Path(file.filename or "cv.pdf").suffix or ".pdf"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = CV_UPLOAD_DIR / unique_name
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return crm_service.save_cv_file(file.filename or unique_name, str(dest), comment)


@app.patch("/cv-files/{cv_id}")
async def update_cv_comment(cv_id: int, request: Request):
    body = await request.json()
    comment = str(body.get("comment", "")).strip()
    try:
        return crm_service.update_cv_comment(cv_id, comment)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/cv-files/{cv_id}/default")
def set_default_cv(cv_id: int):
    try:
        return crm_service.set_default_cv(cv_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.delete("/cv-files/{cv_id}")
def delete_cv_file(cv_id: int):
    try:
        return crm_service.delete_cv_file(cv_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


# ---------------------------------------------------------------------------
# Email jobs
# ---------------------------------------------------------------------------

@app.get("/email-jobs")
def list_email_jobs():
    return crm_service.get_email_jobs()


@app.post("/email-jobs", status_code=201)
async def create_email_job(request: Request):
    payload = await request.json()
    try:
        return crm_service.create_email_job(payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.delete("/email-jobs/{job_id}")
def delete_email_job(job_id: int):
    try:
        return crm_service.delete_email_job(job_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/email-jobs/run-now")
def run_email_jobs_now():
    return crm_service.process_pending_email_jobs()


# ---------------------------------------------------------------------------
# Delivery schedules
# ---------------------------------------------------------------------------

@app.get("/schedules")
def list_schedules():
    return crm_service.get_schedules()


@app.post("/schedules", status_code=201)
async def create_schedule(request: Request):
    payload = await request.json()
    try:
        return crm_service.create_schedule(payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: int, request: Request):
    payload = await request.json()
    try:
        return crm_service.update_schedule(schedule_id, payload)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    try:
        return crm_service.delete_schedule(schedule_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


# ---------------------------------------------------------------------------
# Gmail OAuth — los errores internos se capturan aquí para no exponer trazas
# ---------------------------------------------------------------------------

@app.get("/gmail/status")
def gmail_status():
    try:
        from modules import gmail_service
        return gmail_service.get_status()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al obtener estado de Gmail: {exc}")


@app.get("/gmail/auth-url")
def gmail_auth_url():
    try:
        from modules import gmail_service
        return {"url": gmail_service.get_auth_url()}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error interno al generar URL de autorización: {exc}")


@app.get("/gmail/callback")
def gmail_callback(code: str):
    try:
        from modules import gmail_service
        gmail_service.exchange_code(code)
    except Exception as exc:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(url=f"{frontend_url}?gmail=error&reason={exc}")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=f"{frontend_url}?gmail=authorized")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
