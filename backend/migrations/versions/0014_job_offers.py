"""Pestaña "Búsquedas": ofertas laborales encontradas y postulaciones.

Tabla job_offers — una fila por oferta (aviso publicado en un portal):
- status: 'result'    → apareció en una búsqueda, todavía sin decidir
          'saved'     → guardada en "Mis postulaciones"
          'dismissed' → descartada (se guarda para no volver a mostrarla)
- application_status (solo para 'saved'): pendiente / postulado / en_proceso /
  entrevista / rechazado / cerrado
- url_key: link normalizado (sin query/fragment, minúsculas) — evita repetidos.
- dedupe_key: 1ra palabra de la empresa + puesto, sin acentos (job_search.dedupe_key) — evita el mismo aviso con otro link.
- follow-up: se calcula con COALESCE(last_contact_at, applied_at) + 7 días.

Se precargan las ofertas que Gabriel tenía registradas en su carpeta "Gestion"
(escaneo del 25/11/2026 + Tecpetrol ya postulado).

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-27
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS job_offers (
            id                 SERIAL PRIMARY KEY,
            title              TEXT NOT NULL,
            company            TEXT,
            location           TEXT,
            source             TEXT,
            url                TEXT,
            url_key            TEXT,
            dedupe_key         TEXT,
            posted_text        TEXT,
            score              TEXT,
            meets              TEXT,
            gaps               TEXT,
            reason             TEXT,
            cv_recommended     TEXT,
            aviso_summary      TEXT,
            url_verified       BOOLEAN NOT NULL DEFAULT FALSE,
            status             TEXT NOT NULL DEFAULT 'result',
            application_status TEXT,
            applied_at         TIMESTAMPTZ,
            last_contact_at    TIMESTAMPTZ,
            notes              TEXT,
            career_session_id  INTEGER REFERENCES career_sessions(id) ON DELETE SET NULL,
            search_run_at      TIMESTAMPTZ,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_job_offers_url_key ON job_offers (url_key) WHERE url_key IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_job_offers_dedupe_key ON job_offers (dedupe_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_job_offers_status ON job_offers (status)")

    # Precarga desde la carpeta "Gestion" (idempotente por dedupe_key).
    op.execute("""
        INSERT INTO job_offers (title, company, location, source, url, url_key, dedupe_key,
                                score, reason, notes, status, application_status, applied_at,
                                url_verified)
        SELECT v.title, v.company, v.location, v.source, v.url, v.url_key, v.dedupe_key,
               v.score, v.reason, v.notes, 'saved', v.app_status, v.applied_at::timestamptz, v.url IS NOT NULL
        FROM (VALUES
            ('Enganchador de Perforación', 'Helmerich & Payne', 'Añelo / Plottier', 'LinkedIn',
             'https://ar.linkedin.com/jobs/view/enganchador-de-perforaci%C3%B3n-at-h-p-4475452134',
             'ar.linkedin.com/jobs/view/enganchador-de-perforaci%c3%b3n-at-h-p-4475452134',
             'helmerich|enganchador de perforacion', 'A',
             'Curso de Enganchador y experiencia en torre (DLS).',
             'Del escaneo de portales del 25/11/2026.', 'pendiente', NULL),
            ('Operario en boca de pozo', 'RRHH Buro (petrolera confidencial)', 'Rincón de los Sauces', 'Freehire',
             'https://freehire.me/jobs/operario-en-boca-de-pozo-neuquen-rrhh-buro-sc6ayjh6',
             'freehire.me/jobs/operario-en-boca-de-pozo-neuquen-rrhh-buro-sc6ayjh6',
             'rrhh|operario en boca de pozo', 'B',
             'Experiencia en pulling y boca de pozo.',
             'Del escaneo de portales del 25/11/2026.', 'pendiente', NULL),
            ('Boca de pozo con experiencia', 'Helmerich & Payne', 'Añelo', 'LinkedIn',
             'https://ar.linkedin.com/jobs/view/boca-de-pozo-con-experiencia-at-h-p-4414750794',
             'ar.linkedin.com/jobs/view/boca-de-pozo-con-experiencia-at-h-p-4414750794',
             'helmerich|boca de pozo con experiencia', 'B',
             'Experiencia en boca de pozo; verificar años pedidos.',
             'Del escaneo del 25/11/2026. Verificar requisitos.', 'pendiente', NULL),
            ('Auxiliar de Operaciones', 'Empresa de energía (vía MV RRHH)', 'Neuquén capital', 'Email MV RRHH',
             NULL, NULL,
             'empresa|auxiliar de operaciones', 'C',
             'Fit parcial.',
             'Mail probablemente empleos@mvrrhh.com (no confirmado). Asunto: "AUXILIAR DE OPERACIONES – NEUQUÉN". Aviso de mayo, puede estar cerrado.',
             'pendiente', NULL),
            ('Junior Company Representative', 'Tecpetrol', 'Neuquén', 'careers.techint.com',
             'https://careers.techint.com/Tecpetrol/job/AR-Neuqu%C3%A9n-Junior-Company-Representative/1340901800/',
             'careers.techint.com/tecpetrol/job/ar-neuqu%c3%a9n-junior-company-representative/1340901800',
             'tecpetrol|junior company representative', 'A',
             'Programa de formación para supervisores, sin experiencia previa en supervisión.',
             'Postulado por el portal de Techint apenas salió (antes del 31/03/2026; fecha exacta desconocida).',
             'postulado', '2026-03-31')
        ) AS v(title, company, location, source, url, url_key, dedupe_key, score, reason, notes, app_status, applied_at)
        WHERE NOT EXISTS (SELECT 1 FROM job_offers j WHERE j.dedupe_key = v.dedupe_key)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS job_offers")
