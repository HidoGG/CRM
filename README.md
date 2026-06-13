# CRM Personal — Gabriel Hidalgo

CRM de uso personal para gestionar búsqueda laboral: importar contactos desde PDF/Excel, programar envíos de emails con CV adjunto, y hacer seguimiento del pipeline.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TanStack Query v5 + React Router v7 |
| Drag & Drop | @dnd-kit/core (Kanban) |
| Backend | FastAPI + uvicorn + APScheduler |
| ORM / DB | SQLModel + psycopg3 → Supabase PostgreSQL (pgBouncer) |
| Migraciones | Alembic |
| Email | Gmail API (OAuth 2.0) — scopes: send + readonly |
| OCR / IA | OpenAI API (gpt-4o-mini por defecto) |
| Archivos | Supabase Storage (CVs) |
| Auth | API key (`X-API-Key`) o JWT de Supabase Auth (`Bearer`) |
| Deploy backend | Render.com (web service) |
| Deploy frontend | Vercel |

---

## Desarrollo local

### Requisitos

- Python 3.11+
- Node.js 18+
- Acceso a un proyecto Supabase (o PostgreSQL local)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Editá .env con tus credenciales (ver sección Variables de entorno)

python server.py
# Servidor en http://localhost:8000
```

Las migraciones de Alembic corren automáticamente al iniciar (`upgrade head`).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Editá .env.local con VITE_API_BASE y VITE_API_KEY

npm run dev
# App en http://localhost:5173
```

---

## Variables de entorno

### Backend (`backend/.env`)

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | URL de Supabase pgBouncer: `postgresql://postgres.[ref]:[pass]@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `CRM_API_KEY` | ✅ prod | Clave compartida con el frontend. Si no está, auth desactivada (sólo desarrollo local). |
| `OPENAI_API_KEY` | ⚠️ recomendada | Habilita OCR asistido por IA en importaciones. Sin ella, sólo heurística local. |
| `OPENAI_MODEL` | opcional | Modelo a usar. Default: `gpt-4o-mini`. |
| `BACKEND_URL` | ✅ prod | URL pública del backend en Render, ej: `https://mi-crm.onrender.com`. Usada como redirect URI de Gmail OAuth. |
| `FRONTEND_URL` | ✅ prod | URL pública del frontend en Vercel, ej: `https://mi-crm.vercel.app`. Configura CORS. |
| `PORT` | opcional | Puerto del servidor. Default: `8000`. Render lo inyecta automáticamente. |
| `GOOGLE_CLIENT_ID` | ✅ si no hay credentials.json | ID de cliente OAuth de Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | ✅ si no hay credentials.json | Secret de cliente OAuth de Google. |
| `SUPABASE_URL` | ✅ para Storage | URL del proyecto Supabase, ej: `https://abc.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ para Storage | Service role key (no la anon key). Para subir CVs al bucket. |
| `SUPABASE_STORAGE_BUCKET` | opcional | Nombre del bucket para CVs. Default: `cvs`. |
| `SUPABASE_JWT_SECRET` | opcional | Habilita login con Supabase Auth (Bearer JWT). Se obtiene en Settings → API → JWT Secret. |

### Frontend (`frontend/.env.local`)

| Variable | Requerida | Descripción |
|---|---|---|
| `VITE_API_BASE` | ✅ prod | URL del backend, ej: `https://mi-crm.onrender.com`. |
| `VITE_API_KEY` | ✅ prod | Misma clave que `CRM_API_KEY` del backend. |
| `VITE_SUPABASE_URL` | opcional | Activa login con Supabase Auth en el frontend. |
| `VITE_SUPABASE_ANON_KEY` | opcional | Anon key del proyecto Supabase. |

---

## Estructura del proyecto

```
CRM/
├── backend/
│   ├── modules/
│   │   ├── crm_service.py       # Lógica principal: contactos, jobs, pipeline
│   │   ├── database.py          # Conexión, init_db, run_migrations
│   │   ├── gmail_service.py     # OAuth 2.0, send_email, token persistido en DB
│   │   ├── engagement_service.py# Detección de respuestas/rebotes, recordatorio diario
│   │   ├── ocr_service.py       # Importación desde PDF/Excel/imagen + OpenAI
│   │   ├── schemas.py           # Modelos Pydantic v2 para todos los endpoints
│   │   └── supabase_storage.py  # Upload de CVs a Supabase Storage
│   ├── migrations/
│   │   ├── env.py
│   │   └── versions/
│   │       ├── 0001_baseline.py         # Crea todas las tablas (IF NOT EXISTS)
│   │       └── 0002_types_and_engagement.py  # Convierte TEXT→TIMESTAMPTZ, agrega cols de engagement
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_calendar.py       # 11 tests: lógica ART, ventanas, domingo→lunes
│   │   ├── test_normalizers.py    # 12 tests: parsers de fecha, normalizadores de campo
│   │   └── test_templates_and_inference.py  # 7 tests: render de plantilla, inferencia de acción
│   ├── server.py                # App FastAPI, endpoints, schedulers, auth middleware
│   ├── alembic.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.js           # apiFetch, fetchAllContacts (paginado), fetchers
│   │   │   ├── queries.js       # TanStack Query hooks: useContacts, useTemplates, etc.
│   │   │   ├── utils.js         # Helpers compartidos: prettifyAction, buildTodayInbox, etc.
│   │   │   └── supabaseClient.js# Cliente Supabase opcional (sólo si VITE_SUPABASE_* definidas)
│   │   ├── views/
│   │   │   ├── HoyView.jsx      # Dashboard con KPIs y prioridades del día
│   │   │   ├── OperacionesView.jsx  # Shell con tabs: Tabla / Kanban / Agenda
│   │   │   ├── PipelineView.jsx # Kanban drag & drop + vista semanal
│   │   │   ├── ContactsView.jsx # Tabla + edición inline (modal) + badges de engagement
│   │   │   ├── ImportsView.jsx  # Importador con preview y confirmación
│   │   │   ├── EnviosView.jsx   # Tabs: Cola / Plantillas / Cronogramas / Stats
│   │   │   ├── EstadisticasView.jsx # Sparklines, snapshots, actividad semanal
│   │   │   └── LoginView.jsx    # Login opcional vía Supabase Auth
│   │   ├── components/
│   │   │   ├── views/Worktray.jsx   # Bandeja operativa con historial por contacto
│   │   │   └── ConfirmModal.jsx / InfoModal
│   │   ├── AppShell.jsx         # Router, data fetching, handlers, navegación
│   │   └── main.jsx             # QueryClientProvider + BrowserRouter
│   └── package.json
├── docs/
│   ├── arquitectura.md
│   └── deploy.md                # Guía paso a paso de deploy
└── tools/
    └── build_crm_workbook.py    # Herramienta local de preparación de Excel
```

---

## Schedulers (automático en producción)

| Job | Frecuencia | Descripción |
|---|---|---|
| `email_sender` | Cada 10 min | Procesa hasta 25 jobs pendientes dentro de la ventana horaria ART |
| `reporting_snapshot` | Cada 6 h | Persiste snapshot diario de métricas (idempotente por fecha) |
| `gmail_engagement_sync` | Cada 2 h | Detecta respuestas (threads) y rebotes (mailer-daemon) |
| `daily_reminder` | 08:30 ART (11:30 UTC) | Envía email a vos mismo con contactos vencidos del día |

---

## Tests

```bash
cd backend
.venv\Scripts\activate  # o source .venv/bin/activate
python -m pytest tests/ -v
# 30 tests — calendar logic, normalizers, schemas, OCR inference
```

---

## Deploy

Ver [docs/deploy.md](docs/deploy.md) para la guía completa de Render + Vercel + Supabase.
