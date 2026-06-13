# Arquitectura del CRM

Última actualización: junio 2026.

---

## Principios de diseño

- **Humano en el circuito:** el sistema sugiere, el usuario decide. Importaciones, clasificaciones y acciones requieren confirmación explícita.
- **Trazabilidad completa:** toda acción sobre un contacto queda registrada en `contact_history` con timestamp, tipo de evento y payload JSON.
- **Determinismo en lo crítico:** normalización de emails, fechas y estados usa lógica determinística. La IA asiste en OCR y clasificación pero no toma decisiones finales.
- **Filesystem efímero:** el sistema asume que el disco del servidor puede borrarse en cualquier momento. Todo estado persistente va a Supabase (DB o Storage).

---

## Diagrama de capas

```
┌──────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                   │
│   React 18 + TanStack Query + React Router v7        │
│   @dnd-kit (Kanban)  ·  Supabase JS (auth opcional)  │
└────────────────────────┬─────────────────────────────┘
                         │ HTTPS + X-API-Key / Bearer JWT
┌────────────────────────▼─────────────────────────────┐
│                 Render (Backend)                      │
│   FastAPI + uvicorn + APScheduler                    │
│   Pydantic v2 schemas  ·  Auth middleware            │
└──────┬─────────────────┬────────────────┬────────────┘
       │                 │                │
       ▼                 ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Supabase    │ │  Gmail API   │ │  OpenAI API      │
│  PostgreSQL  │ │  OAuth 2.0   │ │  gpt-4o-mini     │
│  (pgBouncer) │ │  send+read   │ │  OCR + classify  │
│  Storage     │ └──────────────┘ └──────────────────┘
│  (CVs)       │
└──────────────┘
```

---

## Modelo de datos

### `contacts`

Entidad central. Cada contacto representa una empresa/persona de la búsqueda laboral.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | Nombre del contacto |
| `email` | TEXT UNIQUE | Email (normalizado a lowercase) |
| `company` | TEXT | Empresa |
| `title` | TEXT | Cargo |
| `status` | TEXT | Estado del pipeline: `prioridad`, `mantener`, `revisar`, `seguimiento`, `portal`, `sacar` |
| `next_action` | TEXT | Acción pendiente: `enviar`, `seguir`, `portal`, `descartar`, `revisar_manual` |
| `follow_up_date` | DATE | Fecha de seguimiento |
| `suggested_message` | TEXT | Mensaje sugerido (generado por IA o ingresado manual) |
| `source` | TEXT | Origen: `manual`, `import`, nombre del archivo |
| `portal_url` | TEXT | URL del portal de empleo si aplica |
| `portal_status` | TEXT | Estado del portal: `pendiente`, `aplicado`, `revisar` |
| `discard_reason` | TEXT | Razón de descarte |
| `notes` | TEXT | Notas libres |
| `replied_at` | TIMESTAMPTZ | Fecha en que el contacto respondió (detectado vía Gmail) |
| `bounced_at` | TIMESTAMPTZ | Fecha en que el email rebotó (detectado vía Gmail mailer-daemon) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `email_jobs`

Cola de envíos programados.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | |
| `contact_id` | INTEGER FK | Contacto destino |
| `template_id` | INTEGER FK | Plantilla a usar |
| `cv_file_id` | INTEGER FK | CV a adjuntar (nullable) |
| `schedule_id` | INTEGER FK | Cronograma horario |
| `status` | TEXT | `pending`, `processing`, `sent`, `failed` |
| `scheduled_at` | TIMESTAMPTZ | Cuando debe salir (calculado por la ventana ART) |
| `sent_at` | TIMESTAMPTZ | Cuando salió efectivamente |
| `thread_id` | TEXT | Thread ID de Gmail (para tracking de respuestas) |
| `replied_at` | TIMESTAMPTZ | Fecha de respuesta detectada |
| `retry_count` | INTEGER | Cantidad de reintentos (máx 3) |
| `error_message` | TEXT | Último error si `status = failed` |
| `frequency_days` | INTEGER | 0 = una vez, >0 = recurrente cada N días |

### `templates`

Plantillas de email con variables `{name}` y `{company}`.

| Campo | Descripción |
|---|---|
| `name` | Etiqueta interna |
| `subject` | Asunto (soporta `{name}`, `{company}`) |
| `body` | Cuerpo (soporta `{name}`, `{company}`) |
| `is_default` | 0/1 — plantilla por defecto en importaciones |

### `schedules`

Ventanas horarias de envío (en zona ART, UTC-3).

| Campo | Descripción |
|---|---|
| `name` | Nombre descriptivo |
| `interval_minutes` | Pausa entre envíos |
| `start_hour_art` | Hora inicio (0-22) |
| `end_hour_art` | Hora fin (1-23) |
| `is_default` | 0/1 |

### `cv_files`

Metadatos de CVs subidos a Supabase Storage.

| Campo | Descripción |
|---|---|
| `original_name` | Nombre original del archivo |
| `storage_path` | Path en Supabase Storage bucket |
| `comment` | Etiqueta libre (ej: "Oil & Gas") |
| `is_default` | 0/1 |

### Otras tablas

- `imports` — historial de importaciones (archivo, stats, status)
- `import_items` — candidatos individuales de cada importación
- `contact_history` — log de acciones por contacto (indexed por `entity_id`)
- `reporting_snapshots` — métricas diarias del pipeline (para gráficos históricos)
- `app_config` — configuración global key/value (token Gmail, etc.)

---

## Flujo principal: importación de contactos

```
1. Usuario sube archivo (PDF, Excel, CSV, imagen)
2. ocr_service.py extrae texto y detecta contactos
   - Si OPENAI_API_KEY: GPT extrae nombre/empresa/email/acción sugerida
   - Si no: heurística por regex y patrones
3. Backend devuelve preview (ImportPreview) con candidatos
4. Usuario revisa y ajusta cada candidato en la tabla
5. Usuario elige plantilla + CV + cronograma y confirma
6. Por cada candidato aprobado:
   a. Se crea un contact
   b. Si next_action = "enviar": se crea un email_job con scheduled_at calculado
   c. Se registra en contact_history
7. El scheduler procesa los jobs dentro de la ventana horaria ART
```

---

## Scheduler de emails

El cálculo de `scheduled_at` evita colisiones:

1. Obtener todos los jobs pendientes ordenados por `scheduled_at`.
2. El último job define el "siguiente slot libre".
3. Si el slot está fuera de la ventana horaria (antes de `start_hour_art` o después de `end_hour_art`), avanzar al próximo día hábil al inicio de la ventana.
4. Los fines de semana se saltan (domingo → lunes).
5. Se suma `interval_minutes` por cada job nuevo.

**Retry logic:** máximo 3 reintentos con backoff exponencial (5 min → 15 min → 45 min). Tras 3 fallos el job queda en `status = failed` y no se vuelve a procesar automáticamente.

---

## Autenticación

El middleware de auth en `server.py` acepta dos formas:

1. **API key:** header `X-API-Key: <CRM_API_KEY>`. El frontend la embebe en cada request desde `VITE_API_KEY`. Comparación con `secrets.compare_digest` (timing-safe).

2. **JWT Supabase Auth:** header `Authorization: Bearer <token>`. Se verifica con PyJWT usando `SUPABASE_JWT_SECRET`, algoritmo HS256, audience `"authenticated"`. Sólo funciona si `SUPABASE_JWT_SECRET` está configurada.

Si ninguna de las dos variables está definida en el entorno, la auth se desactiva (útil para desarrollo local sin `.env`).

---

## Engagement (detección de respuestas y rebotes)

El `engagement_service.py` usa el scope `gmail.readonly` para:

1. **Respuestas:** Para cada job enviado con `thread_id`, consulta el thread vía Gmail API. Si el thread tiene más de un mensaje y el último no es del remitente, se marca `replied_at` en el contacto y en el job.

2. **Rebotes:** Busca mensajes de `mailer-daemon` o `postmaster` en la bandeja, extrae el email del destinatario y marca `bounced_at` en el contacto.

El sync corre automáticamente cada 2 horas y también puede forzarse desde la UI (**Envíos → Stats de respuesta → ↺ Sync Gmail**).

---

## Zona horaria

Todo el backend trabaja internamente en **UTC** con objetos `datetime` aware. La conversión a ART (UTC-3) se hace sólo para:

- Calcular si el horario actual está dentro de la ventana de envío
- Calcular el próximo slot de envío
- El recordatorio diario (cron a las 11:30 UTC = 08:30 ART)

Se usa `ZoneInfo("America/Argentina/Buenos_Aires")` del módulo `zoneinfo` (Python 3.9+). En Windows la base de datos tz viene de `tzdata` (listado en requirements.txt).

---

## Stack de frontend

### Data fetching

TanStack Query v5 gestiona todo el estado del servidor:

- `staleTime: 30_000` ms — los datos no se refetch si tienen menos de 30 segundos
- `useRefresh(scope)` hook — invalida selectivamente las queries según el scope (`contacts`, `jobs`, `templates`, etc.)
- `fetchAllContacts()` pagina de a 500 hasta agotar todos los contactos

### Routing

React Router v7 con `BrowserRouter`. Rutas principales:

| Ruta | Vista |
|---|---|
| `/` | Hoy (dashboard) |
| `/operaciones` | Worktray + Kanban + Agenda |
| `/contactos` | Lista de contactos con edición inline |
| `/importaciones` | Importador |
| `/envios` | Cola + Plantillas + Cronogramas + Stats |
| `/estadisticas` | Analítica histórica |

### Kanban drag & drop

Implementado con `@dnd-kit/core` (6 KB gzip):

- `PointerSensor` con `activationConstraint: { distance: 8 }` — 8 px de movimiento antes de activar el drag, evita drags accidentales al hacer click en botones del card
- `KeyboardSensor` — accesibilidad completa con teclado
- Drag handle independiente (icono `⠿`) — sólo esa área inicia el drag; los forms y botones del card siguen funcionando
- **Optimistic update:** el card se mueve visualmente de inmediato; si el PATCH falla se revierte y se muestra el error
- `DragOverlay` — ghost card durante el drag
