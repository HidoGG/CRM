# CRM Local Backend

Backend local para contactos, importaciones mock e historial.

## Arranque recomendado

```powershell
cd backend
python server.py
```

No requiere instalar dependencias externas para esta primera version.

## Endpoints

- `GET /health`
- `GET /contacts`
- `POST /contacts`
- `GET /summary`
- `GET /imports`
- `POST /imports/mock`

La base SQLite se crea automaticamente en `C:\Users\TU_USUARIO\AppData\Local\CRMIA\crm.sqlite3`.

## Nota

Quedo una base FastAPI en `app/` para una fase posterior, pero el backend activo es `server.py` para evitar problemas de compatibilidad con Python 3.14.
