-- =============================================================================
-- CRM Personal — Setup pg_cron + pg_net + Feriados Argentinos
-- Ejecutar en Supabase → SQL Editor, UN BLOQUE A LA VEZ
-- Verificá el resultado de cada bloque antes de continuar con el siguiente.
-- =============================================================================


-- =============================================================================
-- BLOQUE 1: Habilitar extensiones requeridas
-- (pg_cron y pg_net ya vienen en Supabase; este comando los activa si no lo están)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Verificación: deben aparecer ambas en la lista
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('pg_cron', 'pg_net');


-- =============================================================================
-- BLOQUE 2: Tabla de feriados argentinos
-- =============================================================================

CREATE TABLE IF NOT EXISTS feriados_ar (
    fecha  DATE        PRIMARY KEY,
    nombre TEXT        NOT NULL,
    tipo   TEXT        NOT NULL DEFAULT 'inamovible',
    -- 'inamovible' | 'trasladable' | 'puente'
    anio   SMALLINT    NOT NULL GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::SMALLINT) STORED
);

-- Verificación
SELECT 'Tabla feriados_ar creada' AS resultado;


-- =============================================================================
-- BLOQUE 3: Feriados 2026 (fuente: api.argentinadatos.com/v1/feriados/2026)
-- Datos verificados el 2026-06-15. Actualizar en enero de cada año.
-- =============================================================================

INSERT INTO feriados_ar (fecha, nombre, tipo) VALUES
    ('2026-01-01', 'Año nuevo', 'inamovible'),
    ('2026-02-16', 'Carnaval', 'inamovible'),
    ('2026-02-17', 'Carnaval', 'inamovible'),
    ('2026-03-23', 'Puente turístico no laborable', 'puente'),
    ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
    ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
    ('2026-04-03', 'Viernes Santo', 'inamovible'),
    ('2026-05-01', 'Día del Trabajador', 'inamovible'),
    ('2026-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
    ('2026-06-15', 'Paso a la Inmortalidad del General Martín Güemes', 'trasladable'),
    ('2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'inamovible'),
    ('2026-07-09', 'Día de la Independencia', 'inamovible'),
    ('2026-07-10', 'Puente turístico no laborable', 'puente'),
    ('2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín', 'trasladable'),
    ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
    ('2026-11-23', 'Día de la Soberanía Nacional', 'trasladable'),
    ('2026-12-07', 'Puente turístico no laborable', 'puente'),
    ('2026-12-08', 'Día de la Inmaculada Concepción de María', 'inamovible'),
    ('2026-12-25', 'Navidad', 'inamovible')
ON CONFLICT (fecha) DO NOTHING;

-- Verificación: deben aparecer 19 filas
SELECT COUNT(*) AS total_feriados, MIN(fecha) AS primero, MAX(fecha) AS ultimo
FROM feriados_ar WHERE anio = 2026;


-- =============================================================================
-- BLOQUE 4: Guardar la API key del CRM en Supabase Vault
--
-- ⚠️  REEMPLAZÁ 'TU_CRM_API_KEY_AQUI' con el valor real de CRM_API_KEY
--     que tenés en Render → Environment Variables.
--     Una vez guardado NO lo volvás a ejecutar (crea duplicados en Vault).
-- =============================================================================

SELECT vault.create_secret(
    'TU_CRM_API_KEY_AQUI',  -- <-- reemplazar con el valor real
    'crm_api_key'
);

-- Verificación: debe aparecer una fila con name = 'crm_api_key'
-- (el secret_value aparece encriptado, eso es correcto)
SELECT id, name, created_at FROM vault.secrets WHERE name = 'crm_api_key';


-- =============================================================================
-- BLOQUE 5: Función principal trigger_email_dispatch()
--
-- Lógica:
--   1. Obtiene la hora y día actual en ART (UTC-3, sin DST)
--   2. Lee la franja horaria del delivery_schedule marcado como por defecto
--   3. Solo dispara el HTTP POST si:
--      - Hora ART >= start_hour_art  (ej: >= 8)
--      - Hora ART <  end_hour_art    (ej: <  18)
--      - Día de la semana es Lun–Sáb (DOW 1..6 en Postgres; 0=Dom, 7=Dom)
--      - Hoy NO es feriado en feriados_ar
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_email_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now_art    TIMESTAMPTZ;
    v_hour_art   INT;
    v_dow_art    INT;        -- 0 = Domingo, 1 = Lunes … 6 = Sábado
    v_today_art  DATE;
    v_start_h    INT;
    v_end_h      INT;
    v_is_feriado BOOLEAN := FALSE;
    v_api_key    TEXT;
    v_backend    TEXT := 'https://crm-backend-e0n4.onrender.com';
BEGIN
    -- Hora actual en ART (UTC-3, Argentina nunca tiene DST)
    v_now_art   := NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires';
    v_hour_art  := EXTRACT(HOUR  FROM v_now_art)::INT;
    v_dow_art   := EXTRACT(DOW   FROM v_now_art)::INT;
    v_today_art := v_now_art::DATE;

    -- Leer franja del schedule por defecto
    SELECT start_hour_art, end_hour_art
      INTO v_start_h, v_end_h
      FROM delivery_schedules
     WHERE is_default = 1
     LIMIT 1;

    -- Fallback si no hay ningún schedule configurado
    IF v_start_h IS NULL THEN
        v_start_h := 8;
        v_end_h   := 18;
        RAISE LOG '[crm-dispatch] Sin schedule configurado — usando defaults 8-18';
    END IF;

    -- Verificar feriado
    SELECT EXISTS (
        SELECT 1 FROM feriados_ar WHERE fecha = v_today_art
    ) INTO v_is_feriado;

    -- Log siempre (visible en Supabase → Database → Logs)
    RAISE LOG '[crm-dispatch] ART=% hora=% dow=% feriado=% ventana=[%,%) lun-sab',
        v_now_art, v_hour_art, v_dow_art, v_is_feriado, v_start_h, v_end_h;

    -- Condiciones para disparar el envío
    IF  v_hour_art >= v_start_h
    AND v_hour_art  < v_end_h
    AND v_dow_art  BETWEEN 1 AND 6
    AND NOT v_is_feriado
    THEN
        -- Leer API key desde Vault (encriptada en reposo)
        SELECT decrypted_secret
          INTO v_api_key
          FROM vault.decrypted_secrets
         WHERE name = 'crm_api_key'
         LIMIT 1;

        IF v_api_key IS NULL OR v_api_key = '' THEN
            RAISE WARNING '[crm-dispatch] API key no encontrada en Vault. Verificá el Bloque 4.';
            RETURN;
        END IF;

        -- HTTP POST al endpoint de procesamiento de jobs
        -- pg_net es asíncrono: retorna inmediatamente, la respuesta llega después
        -- Si Render está durmiendo (~60s de cold start), la request igual lo despierta
        PERFORM net.http_post(
            url                  := v_backend || '/email-jobs/run-now',
            headers              := jsonb_build_object(
                'Content-Type', 'application/json',
                'X-API-Key',    v_api_key
            ),
            body                 := '{}'::jsonb,
            timeout_milliseconds := 55000
        );

        RAISE LOG '[crm-dispatch] POST disparado → %/email-jobs/run-now', v_backend;

    ELSE
        RAISE LOG '[crm-dispatch] Condiciones no cumplidas — no se dispara el POST';
    END IF;
END;
$$;

-- Verificación: llamada de prueba manual (va a intentar contactar el backend)
-- Descomentá y ejecutá para probar:
-- SELECT trigger_email_dispatch();


-- =============================================================================
-- BLOQUE 6: Registrar el cron job
--
-- Corre cada 10 minutos. La función decide internamente si dispara o no.
-- Los crons de Supabase corren en UTC — no hace falta ajustar el schedule
-- porque la lógica de zona horaria está dentro de la función.
-- =============================================================================

-- Primero borrar si ya existe (idempotente — no da error si no existe)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'crm-email-dispatch';

SELECT cron.schedule(
    'crm-email-dispatch',   -- nombre único del job
    '*/10 * * * *',         -- cada 10 minutos, todos los días
    'SELECT trigger_email_dispatch()'
);

-- Verificación: debe aparecer el job con next_run próximo
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'crm-email-dispatch';


-- =============================================================================
-- BLOQUE 7: Verificación final del estado del sistema
-- =============================================================================

-- Estado general
SELECT
    (SELECT COUNT(*) FROM feriados_ar WHERE anio = 2026)    AS feriados_2026,
    (SELECT COUNT(*) FROM vault.secrets WHERE name = 'crm_api_key') AS vault_api_key,
    (SELECT COUNT(*) FROM cron.job WHERE jobname = 'crm-email-dispatch') AS cron_activo,
    (SELECT start_hour_art || '-' || end_hour_art
     FROM delivery_schedules WHERE is_default = 1 LIMIT 1)  AS ventana_horaria,
    NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'      AS hora_actual_art;

-- Historial de ejecuciones (disponible tras el primer ciclo de 10 min)
SELECT jobname, status, start_time, end_time, return_message
FROM cron.job_run_details
WHERE jobname = 'crm-email-dispatch'
ORDER BY start_time DESC
LIMIT 10;


-- =============================================================================
-- MANTENIMIENTO ANUAL (ejecutar en enero de cada año)
-- =============================================================================
-- 1. Obtener feriados del año nuevo en: https://api.argentinadatos.com/v1/feriados/AAAA
-- 2. Agregar los nuevos con:
--    INSERT INTO feriados_ar (fecha, nombre, tipo) VALUES (...) ON CONFLICT DO NOTHING;
--
-- Nota: los feriados "trasladables" se trasladan al lunes más cercano. La fecha
-- en la API ya refleja la fecha efectiva del traslado — no hace falta calcular nada.
-- =============================================================================
