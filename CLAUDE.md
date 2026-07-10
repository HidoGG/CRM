# CRM Laboral — Contexto del proyecto

CRM personal de Gabriel Hidalgo para su búsqueda laboral en Oil & Gas / industria (Neuquén / Río Negro). Gestiona contactos de empresas, envía emails con CV adaptado por rubro, y hace seguimiento del pipeline.

**Idioma: responder SIEMPRE en español.**

## Stack y arquitectura

- **Backend**: FastAPI + uvicorn + SQLModel + psycopg3 + APScheduler. Carpeta `backend/`.
- **Frontend**: React + Vite + TanStack Query. Carpeta `frontend/`.
- **DB**: Supabase PostgreSQL vía pgBouncer puerto **6543 (transaction mode)**. Migraciones con Alembic (`backend/migrations/versions/`, cadena lineal, última: `0008_send_cycle.py`).
- **Env vars** en `backend/.env`: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT`. dotenv se carga al tope de `server.py`.
- Correr local: backend `python server.py` dentro de `backend/` (venv activo); frontend `npm run dev` dentro de `frontend/` (puerto 5173).

## Deploy — MUY IMPORTANTE

| Servicio | Qué | Rama |
|---|---|---|
| **Render** | Backend (https://crm-backend-e0n4.onrender.com) | `antigravity-dev` |
| **Vercel** | Frontend | `main` |

**Flujo de trabajo**: se trabaja y commitea en `antigravity-dev`, se pushea (eso despliega el backend en Render). Para que los cambios de frontend se vean en producción hay que **mergear `antigravity-dev` → `main` y pushear main** (eso dispara Vercel). Si el usuario dice "no se ven las actualizaciones", casi siempre es que falta ese merge a main.

Otras advertencias operativas:
- Render tiene **filesystem efímero**: los CVs subidos se pierden en cada redeploy — hay que re-subirlos desde la UI.
- Nunca romper la cadena de migraciones Alembic (una sola head; los deploys fallan con exit status 3 si hay heads múltiples).
- Si una ruta FastAPI usa `UploadFile` o `Form`, `python-multipart` debe estar en `requirements.txt`.
- Seguridad ya implementada: middleware de API key, CORS restringido a Vercel, rate limiting de Gmail (25 jobs/ciclo, sleep 2s).

## Dominio / lógica de negocio

- **Cola circular de envíos**: tabla `email_jobs`. Tras un envío exitoso se crea un job nuevo al final de la cola. `backfill_missing_email_jobs()` (startup + cada hora) crea jobs pendientes para contactos con `next_action='enviar'` sin job.
- **Rubros**: `contacts.industry` (oilgas, industria, generalista, tecnologia). Tabla `sector_defaults` mapea rubro → `template_id` + `cv_file_id`. El preview de email (`get_email_preview()` en `crm_service.py`) cae a sector_defaults si el job no tiene template.
- **Ciclo de envío**: un ciclo = una pasada completa por todos los contactos con `next_action='enviar'`. `contacts.last_sent_at` marca el envío; `app_settings.cycle_started_at` marca el inicio del ciclo; `_check_and_advance_cycle()` arranca ciclo nuevo cuando no queda nadie sin enviar. Endpoint `GET /cycle`. En el frontend, el filtro "Enviados" de Operaciones usa `last_sent_at >= cycle_started_at`.
- **Navegación** (Sidebar): Hoy · Operaciones (Bandeja/Pipeline/Agenda) · Contactos · Importaciones · **Configuración** (antes "Envíos"; sub-pestaña "Conexión y CVs") · Asistente IA.

## Archivos clave

- `backend/server.py` — endpoints + lifespan + scheduler jobs.
- `backend/modules/crm_service.py` — casi toda la lógica (cola, ciclo, preview, backfill).
- `frontend/src/AppShell.jsx` — shell, rutas, carga de datos.
- `frontend/src/components/views/Worktray.jsx` — bandeja de trabajo de Operaciones.
- `frontend/src/lib/utils.js` — filtros de pestañas (`matchesTabFilter`, recibe `{ cycleStartedAt }`).
- `frontend/src/lib/api.js` + `queries.js` — fetchers y hooks de TanStack Query.

## Restricciones y metodología de trabajo con el usuario

1. **NO tocar el panel lateral** de Operaciones (el `aside` con historial/info del contacto que aparece al lado del cuadro) salvo pedido explícito.
2. **Hablar antes de implementar**: cuando el pedido es de diseño/UX o un cambio de comportamiento, el usuario quiere primero una explicación de qué se entendió y cómo se haría ("primero lo hablamos"). Recién implementar cuando confirma ("dale", "hacelo").
3. Cuando el usuario reporta un problema con captura de pantalla, diagnosticar la causa raíz antes de tocar código.
4. Explicar en lenguaje simple, sin jerga innecesaria — el usuario no es programador.
5. Al terminar cambios de frontend, recordar el merge a `main` para que se vean en Vercel, y avisar que recargue con Ctrl+Shift+R.
6. Commits en español con formato convencional (`feat(...)`, `fix(...)`, `refactor(...)`).
