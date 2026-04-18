# Arquitectura Inicial

## Principios

- Humano en el circuito para validar imports y clasificaciones
- Trazabilidad por archivo, corrida y contacto
- Reglas determinísticas para datos críticos
- IA como apoyo de extracción y clasificación, no como fuente final de verdad

## Módulos

### Frontend

- Dashboard
- Contactos
- Importaciones
- Historial
- Configuración

### Backend

- API REST
- SQLite
- Servicio de importación
- Normalización de contactos
- Historial de acciones

## Entidades iniciales

- `contacts`
- `imports`
- `import_items`
- `activity_log`

## Estados sugeridos

- `mantener`
- `sacar`
- `revisar`
- `seguimiento`
- `prioridad`
- `portal`
- `nuevo`
