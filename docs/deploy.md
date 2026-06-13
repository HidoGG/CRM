# Guía de Deploy — CRM Personal

Arquitectura de producción: **Supabase** (base de datos + storage) · **Render** (backend Python) · **Vercel** (frontend React).

---

## Índice

1. [Supabase — base de datos y storage](#1-supabase)
2. [Google Cloud — OAuth para Gmail](#2-google-cloud-oauth)
3. [Render — backend FastAPI](#3-render-backend)
4. [Vercel — frontend React](#4-vercel-frontend)
5. [Primera conexión Gmail](#5-primera-conexion-gmail)
6. [Después de cada redeploy](#6-despues-de-cada-redeploy)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Supabase

### 1.1 Crear proyecto

1. Ir a [supabase.com](https://supabase.com) → New project.
2. Elegir región (us-east-1 recomendada para menor latencia desde Render).
3. Guardar la contraseña de la base de datos — la vas a necesitar en el `DATABASE_URL`.

### 1.2 Obtener credenciales

En **Settings → Database → Connection string**, elegí **Transaction mode (pgBouncer)** y copiá la URL. Tiene la forma:

```
postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

> **Importante:** Siempre usá el puerto `6543` (pgBouncer transaction mode), no el 5432 directo. El backend usa conexiones cortas por request y pgBouncer las maneja correctamente.

En **Settings → API** copiá:
- `URL` → `SUPABASE_URL`
- `anon public` → `VITE_SUPABASE_ANON_KEY` (frontend, sólo si usás Supabase Auth)
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (backend, para Storage)
- `JWT Secret` → `SUPABASE_JWT_SECRET` (backend, sólo si usás Supabase Auth)

### 1.3 Crear bucket para CVs

1. En el panel de Supabase ir a **Storage → New bucket**.
2. Nombre: `cvs` (o el valor que pongas en `SUPABASE_STORAGE_BUCKET`).
3. Marcar como **privado** (no público).
4. El backend sube los CVs con el `service_role key`, así que el bucket puede quedar privado.

### 1.4 Migraciones

Las migraciones corren automáticamente al iniciar el servidor (`alembic upgrade head`). No hace falta correrlas manualmente, pero si querés verificar el esquema antes del primer deploy podés correr:

```bash
cd backend
DATABASE_URL="postgresql://..." alembic upgrade head
```

---

## 2. Google Cloud OAuth

El backend necesita credenciales OAuth para acceder a Gmail en nombre del usuario.

### 2.1 Crear proyecto y credenciales

1. Ir a [console.cloud.google.com](https://console.cloud.google.com).
2. Crear un proyecto nuevo o usar uno existente.
3. Habilitar la **Gmail API**: APIs & Services → Library → buscar "Gmail API" → Enable.
4. Ir a **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
5. Application type: **Web application**.
6. Nombre: `CRM Backend` (o cualquiera).
7. En **Authorized redirect URIs** agregar:
   ```
   https://mi-crm.onrender.com/gmail/callback
   ```
   (reemplazá con tu URL real de Render — la obtenés en el paso 3)
8. Descargar el JSON de credenciales.

### 2.2 Configurar en Render

Tenés dos opciones:

**Opción A — Variables de entorno (recomendada para producción):**
```
GOOGLE_CLIENT_ID=<client_id del JSON>
GOOGLE_CLIENT_SECRET=<client_secret del JSON>
```

**Opción B — credentials.json como Secret File:**
En Render → Settings → Secret Files, subí el JSON descargado con path `/etc/secrets/credentials.json` y en el código asegurate de que `CREDENTIALS_FILE` apunte ahí (o simplemente usá las variables de entorno de Opción A).

### 2.3 Pantalla de consentimiento OAuth

En **APIs & Services → OAuth consent screen**:
- User type: **External** (o Internal si tenés Google Workspace).
- Completar nombre de app, email de soporte.
- En **Scopes** agregar:
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.readonly`
- En **Test users** agregá tu propio email. Mientras la app esté en modo testing sólo los test users pueden autorizar.

---

## 3. Render — Backend

### 3.1 Crear Web Service

1. [render.com](https://render.com) → New → Web Service.
2. Conectar el repositorio de GitHub.
3. Configurar:
   - **Branch:** `main` (o `antigravity-dev` si usás esa rama para prod)
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python server.py`

### 3.2 Variables de entorno en Render

En **Environment → Environment Variables**, agregar:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL de pgBouncer de Supabase (puerto 6543) |
| `CRM_API_KEY` | Clave secreta aleatoria, ej: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | Tu API key de OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` (o `gpt-4o` para mejor calidad) |
| `BACKEND_URL` | `https://mi-crm.onrender.com` (la URL que te da Render) |
| `FRONTEND_URL` | `https://mi-crm.vercel.app` (la URL que te da Vercel, paso 4) |
| `GOOGLE_CLIENT_ID` | De Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | De Google Cloud Console |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `SUPABASE_STORAGE_BUCKET` | `cvs` |
| `SUPABASE_JWT_SECRET` | (opcional) JWT Secret de Supabase, sólo si usás Supabase Auth |

### 3.3 Plan

El plan **Free** de Render pone el servicio a dormir después de 15 minutos de inactividad. Al despertar tarda ~30-60 segundos. Para uso personal es suficiente. Si necesitás que el scheduler funcione constantemente (envíos automáticos cada 10 min), necesitás al menos el plan **Starter** ($7/mes).

### 3.4 Verificar deploy

Después del deploy, verificar que la app arrancó correctamente:

```bash
curl https://mi-crm.onrender.com/health
# Respuesta esperada: {"status":"ok","db":"ok"}
```

---

## 4. Vercel — Frontend

### 4.1 Crear proyecto

1. [vercel.com](https://vercel.com) → New Project → importar el repositorio.
2. **Root Directory:** `frontend`
3. **Framework Preset:** Vite
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`

### 4.2 Variables de entorno en Vercel

En **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `VITE_API_BASE` | `https://mi-crm.onrender.com` |
| `VITE_API_KEY` | La misma clave que `CRM_API_KEY` del backend |
| `VITE_SUPABASE_URL` | (opcional) URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | (opcional) Anon key de Supabase |

> Las variables `VITE_*` son públicas — quedan embedidas en el bundle JS. Nunca pongas la `service_role key` ni ningún secreto real en el frontend.

### 4.3 Dominio

Vercel genera una URL del estilo `mi-crm.vercel.app`. Podés conectar un dominio propio en **Settings → Domains**.

Después de obtener la URL definitiva del frontend, actualizá `FRONTEND_URL` en Render y hacé un redeploy para que el CORS quede configurado correctamente.

---

## 5. Primera conexión Gmail

Después de que tanto Render como Vercel estén corriendo:

1. Abrir la app en Vercel.
2. Ir a la sección **Envíos**.
3. Si Gmail no está autorizado, aparece el banner amarillo → click en **Autorizar Gmail**.
4. Vas a ser redirigido a Google → aceptar los permisos (send + readonly).
5. Google redirige a `https://mi-crm.onrender.com/gmail/callback` → el token se guarda en la base de datos.
6. Volver a la app — el banner debería quedar verde.

> El token se guarda en la tabla `app_config` de Supabase como JSON encriptado (base64). Si eliminás la fila con key `gmail_token`, el sistema pedirá re-autorizar la próxima vez.

---

## 6. Después de cada redeploy

Render tiene **filesystem efímero** — todo lo que se guarda en disco se pierde con cada deploy. El CRM está diseñado para esto:

| Cosa | Dónde se guarda | ¿Sobrevive redeploy? |
|---|---|---|
| Contactos, jobs, historial | Supabase PostgreSQL | ✅ Sí |
| CVs subidos | Supabase Storage | ✅ Sí |
| Token de Gmail | Supabase PostgreSQL (`app_config`) | ✅ Sí |
| `credentials.json` (si lo subiste al filesystem) | Disco Render | ❌ No — usá variables de entorno en su lugar |
| `token.json` (token local de desarrollo) | Disco local | — (no aplica en prod) |

Si usás variables de entorno para `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (Opción A del paso 2.2), el sistema regenera la config OAuth desde las env vars y no necesitás subir ningún archivo.

---

## 7. Troubleshooting

### El backend arranca pero `/health` da error de DB

- Verificar que `DATABASE_URL` tenga el formato correcto (puerto 6543, no 5432).
- Verificar que la contraseña no tenga caracteres especiales sin encodear en la URL.
- En los logs de Render buscar el traceback de la conexión inicial.

### Gmail callback falla con "redirect_uri_mismatch"

- La URI de redirect en Google Cloud Console debe coincidir exactamente con `BACKEND_URL + /gmail/callback`.
- Si cambiaste la URL de Render, actualizar en Google Cloud Console.

### CORS error en el frontend

- Verificar que `FRONTEND_URL` en Render sea exactamente la URL de Vercel (sin barra final, con https).
- Hacer redeploy del backend después de cambiar `FRONTEND_URL`.

### OCR no funciona / importaciones sin clasificación IA

- Verificar que `OPENAI_API_KEY` esté configurada en Render.
- El endpoint `/capabilities` devuelve `{"openai_enabled": true/false}` — abrir en el browser para confirmar.

### Los emails no se envían automáticamente

- En el plan Free de Render el servicio duerme — el scheduler no corre mientras duerme.
- Para forzar un envío manual: en la app ir a **Envíos → Enviar ahora**.
- Para envíos automáticos confiables: upgradear al plan Starter de Render.

### "Respondió" / "Rebotó" no aparece en los contactos

- Requiere que Gmail esté autorizado con el scope `readonly` (no sólo `send`).
- Si autorizaste antes de que se agregara `readonly`, necesitás re-autorizar: en **Envíos** verificá si el status de Gmail muestra `has_readonly: false` y hacé click en Autorizar Gmail nuevamente.
- El sync corre automáticamente cada 2 horas o podés forzarlo desde **Envíos → Stats de respuesta → ↺ Sync Gmail**.
