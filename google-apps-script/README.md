## CRM Importador

1. Abri tu Google Sheet.
2. Entra a `Extensiones > Apps Script`.
3. Copia el contenido de `CRMImportador.gs`.
4. Activa el servicio avanzado de Drive:
   - En Apps Script: `Servicios > + > Drive API`.
   - En Google Cloud del proyecto: habilita `Google Drive API`.
5. Guarda el proyecto y recarga la planilla.
6. En `Inicio!B7`, pega el link o ID del archivo de Drive.
7. Usa el menu `CRM > Procesar archivo de Inicio`.

### Que hace

- Extrae correos desde `txt`, `csv`, `xlsx`, `pdf`, `png`, `jpg` y `jpeg`.
- Deduplica contra `Import` y `Postulaciones`.
- Infiere `Empresa` desde el dominio.
- Infiere `Contacto` desde el email o usa el fallback configurado.
- Carga resultados en `Import`.
- Registra cada corrida en `ImportLog`.

### Ajustes importantes

- `Configuración!B6`: frecuencia por defecto
- `Configuración!B7`: template por defecto
- `Configuración!B8`: adjuntar por defecto
- `Configuración!B9`: fallback de contacto
- `Configuración!B12`: idioma OCR
- `Dominios`: normalización manual de nombres de empresa
