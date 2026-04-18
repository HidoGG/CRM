# CRM IA Local

App local para importar, limpiar y gestionar contactos laborales sin depender de Excel como herramienta principal.

## Objetivo

- Importar contactos desde PDF, imagen, CSV o Excel.
- Detectar correos y normalizar empresa/contacto.
- Clasificar contactos en estados operativos.
- Revisar y corregir datos desde una interfaz simple.
- Mantener historial e importaciones.

## Estructura

- `frontend/`: interfaz React del CRM
- `backend/`: API FastAPI, base SQLite e importaciones
- `docs/`: notas de arquitectura y próximos pasos
- `google-apps-script/`: automatizaciones previas sobre Google Sheets
- `tools/`: utilidades locales para migraciones y soporte

## Fases

1. Base del producto y modelo de datos
2. Importador inicial de contactos
3. CRM operativo y filtros
4. OCR + clasificación asistida por IA
5. Evals y mejora continua
