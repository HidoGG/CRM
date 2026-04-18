# Importador Inteligente

## Estado actual

- Alta manual de contactos desde la UI
- Importador con preview y confirmacion
- Extraccion local desde `txt`, `csv`, `xlsx` y `pdf` con texto
- Normalizacion automatica de empresa y contacto
- Deteccion de duplicados antes de guardar
- Historial de importaciones pendientes y confirmadas

## Flujo de uso

1. Abrir la vista `Importaciones`
2. Subir un archivo desde la UI
3. Revisar la vista previa de candidatos
4. Ajustar decision, empresa, contacto o estado
5. Confirmar la importacion para guardar solo lo aprobado

## Tipos de archivo

- `txt` y `csv`: lectura directa de texto
- `xlsx`: extraccion desde hojas internas
- `pdf` con texto: deteccion de correos desde el contenido legible
- `png`, `jpg`, `jpeg`, `gif`, `webp`: usan OCR si hay proveedor disponible

## Proveedores OCR

- `Tesseract`: se detecta automaticamente si esta instalado en Windows
- `OpenAI`: se activa automaticamente si existe la variable de entorno `OPENAI_API_KEY`
- si no hay proveedor disponible, la app no falla: genera preview con advertencia y deja el caso marcado para revisar

## Criterios de normalizacion

- `empresa`: se infiere desde el dominio del correo
- `contacto`: se infiere desde la parte local del email
- `rrhh`, `info`, `jobs`, `contacto` y similares se transforman en `A quien corresponda`
- duplicados contra la base se marcan antes de confirmar

## Clasificacion inicial

- siempre hay una clasificacion por heuristica local
- si existe `OPENAI_API_KEY`, la app intenta enriquecer esa clasificacion con OpenAI
- cada preview muestra el motor de OCR usado y la fuente de clasificacion aplicada
- cada candidato sale con `next_action` sugerida y un texto corto editable para operar mas rapido

## Proximo paso

Conectar clasificacion asistida por IA sobre notas, prioridad y accion sugerida, y mejorar la extraccion de PDFs escaneados cuando no haya texto embebido.
