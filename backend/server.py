from __future__ import annotations

# Load .env before any module import that reads os.environ at module level
from dotenv import load_dotenv
load_dotenv()

import base64
import io
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

import modules.crm_service as crm_service
import modules.engagement_service as engagement_service
import modules.ocr_service as ocr_service
from modules import schemas
from modules.crm_service import ServiceError
from sqlalchemy import text
from sqlmodel import Session
from modules.database import engine, init_db, run_migrations

_scheduler = BackgroundScheduler()

# Paths that bypass auth (Google OAuth callback + health check)
_AUTH_EXEMPT = {"/health", "/gmail/callback"}

# API key leída una sola vez al iniciar. Si no está definida, auth desactivada (dev local).
_CRM_API_KEY = os.getenv("CRM_API_KEY", "").strip()

# JWT de Supabase Auth (opcional). Si está definido, se aceptan tokens Bearer
# emitidos por Supabase además de la API key. Ver docs/seguridad.md.
_SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()


def _verify_supabase_jwt(token: str) -> bool:
    """Verifica un access token de Supabase Auth (HS256, aud='authenticated')."""
    if not _SUPABASE_JWT_SECRET:
        return False
    try:
        import jwt as pyjwt
        pyjwt.decode(
            token,
            _SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return True
    except Exception:
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    init_db()
    _scheduler.add_job(
        crm_service.process_pending_email_jobs,
        trigger="interval",
        minutes=10,
        id="email_sender",
        replace_existing=True,
    )
    # Snapshot de reporting: idempotente (upsert por fecha), cada 6 horas.
    _scheduler.add_job(
        crm_service.persist_daily_snapshot_job,
        trigger="interval",
        hours=6,
        id="reporting_snapshot",
        replace_existing=True,
    )
    # Detección de respuestas y rebotes vía Gmail (requiere scope readonly).
    _scheduler.add_job(
        engagement_service.sync_replies_and_bounces,
        trigger="interval",
        hours=2,
        id="gmail_engagement_sync",
        replace_existing=True,
    )
    # Recordatorio diario de seguimientos vencidos/del día (08:30 ART = 11:30 UTC).
    _scheduler.add_job(
        engagement_service.send_daily_reminder,
        trigger="cron",
        hour=11,
        minute=30,
        id="daily_reminder",
        replace_existing=True,
    )
    _scheduler.start()
    # Snapshot inicial al arrancar (cubre cold starts de Render)
    try:
        crm_service.persist_daily_snapshot_job()
    except Exception as exc:
        print(f"[startup] No se pudo persistir snapshot inicial: {exc}")
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
# Middleware de autenticación: API key (X-API-Key) o JWT Supabase (Bearer).
# Se agrega DESPUÉS de CORSMiddleware, por lo que corre como capa exterior.
# OPTIONS (preflight CORS) y las rutas exentas pasan sin validación.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in _AUTH_EXEMPT:
        return await call_next(request)

    # Sin key ni JWT configurados (entorno local sin .env): auth desactivada
    if not _CRM_API_KEY and not _SUPABASE_JWT_SECRET:
        return await call_next(request)

    provided_key = request.headers.get("X-API-Key", "")
    if (
        _CRM_API_KEY
        and provided_key
        and secrets.compare_digest(provided_key, _CRM_API_KEY)
    ):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer ") and _verify_supabase_jwt(auth_header[7:]):
        return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Unauthorized: credenciales inválidas o ausentes."},
    )


# ---------------------------------------------------------------------------
# Errores de validación Pydantic → detail string legible (el frontend
# muestra errorBody.detail directamente).
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        first = errors[0]
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = str(first.get("msg", "datos inválidos")).removeprefix("Value error, ")
        detail = f"Datos inválidos en '{loc}': {msg}" if loc else f"Datos inválidos: {msg}"
    else:
        detail = "Datos inválidos."
    return JSONResponse(status_code=422, content={"detail": detail})


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "crm-api"}


@app.get("/contacts")
def list_contacts(
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    return crm_service.get_contacts(limit, offset)


@app.get("/contacts/{contact_id}/history")
def contact_history(contact_id: int):
    try:
        return crm_service.get_contact_history(contact_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/contacts", status_code=201)
def create_contact(payload: schemas.ContactCreate):
    try:
        return crm_service.create_contact(payload.model_dump())
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.patch("/contacts/{contact_id}")
def update_contact(contact_id: int, payload: schemas.ContactUpdate):
    try:
        return crm_service.update_contact(contact_id, payload.model_dump(exclude_unset=True))
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int):
    try:
        return crm_service.delete_contact(contact_id)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.post("/contacts/{contact_id}/execute")
def execute_action(contact_id: int, payload: schemas.ContactAction):
    try:
        return crm_service.execute_contact_action(contact_id, payload.model_dump())
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.get("/summary")
def summary():
    return crm_service.get_summary()


@app.get("/reporting/overview")
def reporting_overview():
    return crm_service.get_reporting_overview()


@app.get("/reporting/export.csv")
def export_csv(
    type: str = Query(default="snapshots", pattern="^(snapshots|overview)$"),
    limit: int = Query(default=30, ge=1, le=365),
):
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
def list_imports(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return crm_service.get_imports(limit, offset)


@app.post("/imports/mock", status_code=201)
def mock_import(payload: schemas.MockImport):
    try:
        return crm_service.create_mock_import(payload.model_dump())
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
def confirm_import(import_id: int, payload: schemas.ImportConfirm):
    try:
        return crm_service.confirm_import(import_id, payload.model_dump())
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
def create_template(payload: schemas.TemplateCreate):
    try:
        return crm_service.create_template(payload.model_dump())
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/templates/{template_id}")
def update_template(template_id: int, payload: schemas.TemplateUpdate):
    try:
        return crm_service.update_template(template_id, payload.model_dump(exclude_unset=True))
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
    from modules import supabase_storage
    ext = Path(file.filename or "cv.pdf").suffix or ".pdf"
    object_key = f"{uuid.uuid4().hex}{ext}"
    file_bytes = await file.read()
    supabase_storage.upload(file_bytes, object_key)
    return crm_service.save_cv_file(file.filename or object_key, object_key, comment)


@app.patch("/cv-files/{cv_id}")
def update_cv_comment(cv_id: int, payload: schemas.CvComment):
    try:
        return crm_service.update_cv_comment(cv_id, payload.comment.strip())
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
def create_email_job(payload: schemas.EmailJobCreate):
    try:
        return crm_service.create_email_job(payload.model_dump())
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


@app.post("/email-jobs/retry-failed")
def retry_failed_email_jobs():
    return crm_service.retry_failed_email_jobs()



# ---------------------------------------------------------------------------
# Engagement: respuestas, rebotes y métricas por plantilla
# ---------------------------------------------------------------------------

@app.post("/engagement/sync")
def engagement_sync():
    """Corre la detección de respuestas y rebotes bajo demanda."""
    return engagement_service.sync_replies_and_bounces()


@app.get("/engagement/template-stats")
def template_stats():
    return engagement_service.get_template_stats()


# ---------------------------------------------------------------------------
# Delivery schedules
# ---------------------------------------------------------------------------

@app.get("/schedules")
def list_schedules():
    return crm_service.get_schedules()


@app.post("/schedules", status_code=201)
def create_schedule(payload: schemas.ScheduleCreate):
    try:
        return crm_service.create_schedule(payload.model_dump())
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, payload: schemas.ScheduleUpdate):
    try:
        return crm_service.update_schedule(schedule_id, payload.model_dump(exclude_unset=True))
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status.value, detail=exc.message)


@app.put("/schedules/{schedule_id}/default")
def set_default_schedule(schedule_id: int):
    try:
        return crm_service.set_default_schedule(schedule_id)
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


# ---------------------------------------------------------------------------
# Agente de RRHH — Career Assistant
# ---------------------------------------------------------------------------

@app.get("/career/sessions")
def list_career_sessions():
    """Lista todas las sesiones guardadas, orden cronológico inverso."""
    from modules.database import get_session as db_session, row_to_dict
    with db_session() as db:
        rows = db.execute(text("""
            SELECT id, title, company, role, summary, created_at, updated_at
            FROM career_sessions
            ORDER BY updated_at DESC
            LIMIT 100
        """)).fetchall()
    return [row_to_dict(r) for r in rows]


@app.post("/career/sessions")
def create_career_session():
    """Crea una nueva sesión de chat vacía y devuelve su id."""
    from modules.database import get_session as db_session
    with db_session() as db:
        result = db.execute(
            text("INSERT INTO career_sessions (title) VALUES ('Nueva búsqueda') RETURNING id")
        )
        session_id = result.fetchone()[0]
        db.commit()
    return {"id": session_id}


@app.get("/career/sessions/{session_id}")
def get_career_session(session_id: int):
    """Devuelve una sesión con todos sus mensajes."""
    from modules.database import get_session as db_session, row_to_dict
    with db_session() as db:
        session_row = db.execute(
            text("SELECT * FROM career_sessions WHERE id = :id"),
            {"id": session_id},
        ).fetchone()
        if not session_row:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        messages = db.execute(
            text("SELECT id, role, content, has_image, created_at FROM career_messages WHERE session_id = :id ORDER BY id ASC"),
            {"id": session_id},
        ).fetchall()
    return {
        **row_to_dict(session_row),
        "messages": [row_to_dict(m) for m in messages],
    }


@app.delete("/career/sessions/{session_id}")
def delete_career_session(session_id: int):
    """Elimina una sesión y todos sus mensajes."""
    from modules.database import get_session as db_session
    with db_session() as db:
        db.execute(text("DELETE FROM career_sessions WHERE id = :id"), {"id": session_id})
        db.commit()
    return {"ok": True}


@app.post("/career/sessions/{session_id}/chat")
async def career_chat(session_id: int, request: Request):
    """
    Envía un mensaje al agente de RRHH y devuelve su respuesta.
    Body (multipart/form o JSON):
      - message: texto del usuario
      - image: archivo de imagen opcional (multipart)
    """
    import modules.career_agent as career_agent
    from modules.database import get_session as db_session, now_utc, row_to_dict

    # Parsear body — acepta multipart (con imagen) o JSON (solo texto)
    content_type = request.headers.get("content-type", "")
    user_text = ""
    image_b64 = None
    image_mime = "image/jpeg"

    if "multipart/form-data" in content_type:
        form = await request.form()
        user_text = str(form.get("message", "")).strip()
        image_file = form.get("image")
        if image_file and hasattr(image_file, "read"):
            raw = await image_file.read()
            image_b64 = base64.b64encode(raw).decode()
            image_mime = image_file.content_type or "image/jpeg"
    else:
        body = await request.json()
        user_text = str(body.get("message", "")).strip()

    if not user_text and not image_b64:
        raise HTTPException(status_code=400, detail="Mensaje vacío")

    # Verificar que la sesión existe
    with Session(engine) as db:
        exists = db.execute(
            text("SELECT 1 FROM career_sessions WHERE id = :id"), {"id": session_id}
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")

        # Cargar historial previo
        rows = db.execute(
            text("SELECT role, content FROM career_messages WHERE session_id = :id ORDER BY id ASC"),
            {"id": session_id},
        ).fetchall()
        history = [{"role": r[0], "content": r[1]} for r in rows]

    # Correr el agente
    try:
        reply = await career_agent.run_chat(
            session_id=session_id,
            history=history,
            user_text=user_text,
            image_b64=image_b64,
            image_mime=image_mime,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error del agente: {exc}")

    # Guardar mensajes en DB
    now = now_utc()
    user_content_stored = user_text or "[imagen adjunta]"
    if image_b64 and user_text:
        user_content_stored = f"[imagen] {user_text}"

    with Session(engine) as db:
        db.execute(
            text("""
                INSERT INTO career_messages (session_id, role, content, has_image, created_at)
                VALUES (:sid, 'user', :content, :has_img, :now)
            """),
            {"sid": session_id, "content": user_content_stored, "has_img": bool(image_b64), "now": now},
        )
        db.execute(
            text("""
                INSERT INTO career_messages (session_id, role, content, has_image, created_at)
                VALUES (:sid, 'assistant', :content, false, :now)
            """),
            {"sid": session_id, "content": reply, "now": now},
        )
        db.execute(
            text("UPDATE career_sessions SET updated_at = :now WHERE id = :id"),
            {"now": now, "id": session_id},
        )
        db.commit()

    return {"reply": reply}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
