import { useMemo } from 'react';
import {
  formatDelta,
  getDeltaClassName,
  getRelativeBarWidth,
  prettifyAction,
} from '../lib/utils';
import { getSectorLabel } from '../components/SectorBadge';

export function EstadisticasView({ reporting, imports, emailJobs, contacts }) {
  const analytics = useMemo(() => buildAnalytics(emailJobs, contacts), [emailJobs, contacts]);
  const sectorPerformance = useMemo(() => buildSectorPerformance(contacts), [contacts]);
  const pipelineAge = useMemo(() => buildPipelineAge(contacts, emailJobs), [contacts, emailJobs]);

  return (
    <section className="grid gap-5">

      {/* ── Hero + métricas ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(280px,0.8fr)', gap: 20 }}>
        <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="eyebrow">Estadísticas</span>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            Analítica a mediano plazo: ritmo, calidad y trazabilidad del pipeline.
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.9rem' }}>
            Distribución por rubro, antigüedad de la cola y métricas de efectividad de envíos.
            El trabajo diario vive en "Hoy" — acá se lee el resultado acumulado.
          </p>
        </article>

        <div style={{ display: 'grid', gap: 14 }}>
          <MetricCard
            label="Tasa de éxito de envíos"
            value={analytics.successRate !== null ? `${analytics.successRate}%` : '—'}
            sub={analytics.totalResolved > 0 ? `${analytics.sentJobs} enviados · ${analytics.failedJobs} fallidos` : 'Sin envíos resueltos aún'}
            color={analytics.successRate === null ? 'neutral' : analytics.successRate >= 80 ? 'positive' : analytics.successRate >= 50 ? 'warning' : 'negative'}
          />
          <MetricCard
            label="Tiempo medio import → envío"
            value={analytics.avgDaysToFirstSend !== null ? `${analytics.avgDaysToFirstSend}d` : '—'}
            sub={analytics.sampledContacts > 0 ? `sobre ${analytics.sampledContacts} contactos accionados` : 'Sin contactos accionados aún'}
            color="neutral"
          />
        </div>
      </section>

      {/* ── Actividad semanal ── */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <span className="eyebrow">Ritmo</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Actividad semanal</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Comparación entre los últimos 7 días y la ventana anterior.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          {['enviar', 'seguir', 'portal', 'descartar'].map(action => (
            <div key={action} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{prettifyAction(action)}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {reporting.activity.last_7d[action]} vs {reporting.activity.previous_7d[action]}
                </span>
              </div>
              <div style={{ position: 'relative', height: 16, borderRadius: 999, background: 'var(--surface-subtle)', overflow: 'hidden' }}>
                <div
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, background: 'var(--accent)', opacity: 0.85, width: `${getRelativeBarWidth(reporting.activity.last_7d[action], reporting.activity.previous_7d[action])}%` }}
                />
                <div
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, background: 'var(--text-muted)', opacity: 0.35, width: `${getRelativeBarWidth(reporting.activity.previous_7d[action], reporting.activity.last_7d[action])}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {['enviar', 'seguir', 'portal', 'descartar'].map(action => (
            <article key={action} style={{ background: 'var(--surface-subtle)', borderRadius: 22, padding: 18, display: 'grid', gap: 14, border: '1px solid var(--border-faint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{prettifyAction(action)}</strong>
                <DeltaBadge value={reporting.activity.deltas_7d[action]} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--surface-raised)', borderRadius: 16, padding: 12, display: 'grid', gap: 6, border: '1px solid var(--border-faint)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Últimos 7d</span>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1.3rem', lineHeight: 1 }}>{reporting.activity.last_7d[action]}</strong>
                </div>
                <div style={{ background: 'var(--surface-raised)', borderRadius: 16, padding: 12, display: 'grid', gap: 6, border: '1px solid var(--border-faint)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>7d previos</span>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1.3rem', lineHeight: 1 }}>{reporting.activity.previous_7d[action]}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Gráfico 1: Rendimiento por rubro ── */}
      <section className="card">
        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow">Análisis por rubro</span>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ¿En qué sectores avanzás más?
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Estado de todos los contactos agrupados por rubro. Los sectores con más "Seguimiento" o "Portal" son los que mejor responden.
          </p>
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
          {SECTOR_STATES.map(({ key, label, color }) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>

        {sectorPerformance.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin contactos cargados aún.</p>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            {sectorPerformance.map(sector => (
              <div key={sector.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 12 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {sector.label}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
                    {sector.total} contacto{sector.total !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Barra apilada */}
                <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-subtle)' }}>
                  {SECTOR_STATES.map(({ key: stateKey, color }) => {
                    const count = sector[stateKey] ?? 0;
                    const pct = sector.total > 0 ? (count / sector.total) * 100 : 0;
                    return pct > 0 ? (
                      <div
                        key={stateKey}
                        style={{ width: `${pct}%`, background: color, minWidth: 3 }}
                        title={`${stateKey}: ${count} (${Math.round(pct)}%)`}
                      />
                    ) : null;
                  })}
                </div>

                {/* Valores debajo de la barra */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6 }}>
                  {SECTOR_STATES.filter(s => (sector[s.key] ?? 0) > 0).map(({ key: stateKey, label: stateLabel, color }) => (
                    <span key={stateKey} style={{ fontSize: '0.74rem', color, fontWeight: 600 }}>
                      {sector[stateKey]} {stateLabel.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Gráfico 2: Antigüedad de la cola ── */}
      <section className="card">
        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow">Estado de la cola</span>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ¿Cuánto tiempo llevan esperando tus contactos?
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Contactos en estado "Enviar" agrupados por tiempo desde su última actualización.
            Los que llevan más de 2 semanas son oportunidades que se están enfriando.
          </p>
        </div>

        {pipelineAge.total === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay contactos pendientes de envío.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 }}>
              <strong style={{ fontSize: '2rem', color: 'var(--text-primary)', lineHeight: 1 }}>
                {pipelineAge.total}
              </strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                contactos pendientes de envío en total
              </span>
            </div>

            {/* Barras verticales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
              {pipelineAge.buckets.map(bucket => {
                const maxCount = Math.max(...pipelineAge.buckets.map(b => b.total), 1);
                const heightPct = (bucket.total / maxCount) * 100;
                return (
                  <div key={bucket.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '1.6rem', color: bucket.total > 0 ? bucket.color : 'var(--text-muted)', lineHeight: 1 }}>
                      {bucket.total}
                    </strong>
                    <div style={{ width: '100%', height: 90, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{
                        width: '100%',
                        height: bucket.total > 0 ? `${Math.max(heightPct, 5)}%` : '3px',
                        background: bucket.total > 0 ? bucket.color : 'var(--border-faint)',
                        borderRadius: '6px 6px 0 0',
                        opacity: 0.82,
                      }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {bucket.label}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                      {bucket.sublabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '2px solid var(--border-faint)', marginBottom: 16 }} />

            {/* Alerta si hay muchos vencidos */}
            {pipelineAge.buckets[3].total > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid var(--red-text)', color: 'var(--red-text)', fontSize: '0.85rem', marginBottom: 14 }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠</span>
                <span>
                  <strong>{pipelineAge.buckets[3].total} contacto{pipelineAge.buckets[3].total !== 1 ? 's' : ''}</strong> llevan más de 2 semanas sin avanzar.
                  Entrá a Operaciones → filtrá por "Vencido" para revisarlos y definir si descartar o reactivar.
                </span>
              </div>
            )}

            {/* Resumen enviados vs pendientes */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--surface-subtle)', borderRadius: 999, padding: '5px 12px', border: '1px solid var(--border-faint)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                {pipelineAge.totalSent} ya recibieron un email — esperando que avancen
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--surface-subtle)', borderRadius: 999, padding: '5px 12px', border: '1px solid var(--border-faint)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                {pipelineAge.totalUnsent} todavía no recibieron email
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── Historial de importaciones ── */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <span className="eyebrow">Historial</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Importaciones</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Trazabilidad completa de archivos procesados.
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}>
            {imports.length} registros
          </span>
        </div>

        {imports.length ? (
          <div style={{ overflowX: 'auto', borderRadius: 18, border: '1px solid var(--border-faint)' }}>
            <table className="w-full border-collapse" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  {['Archivo', 'Contactos', 'Estado', 'Notas', 'Fecha'].map(col => (
                    <th
                      key={col}
                      scope="col"
                      style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '12px 18px', textAlign: 'left', borderBottom: '1px solid var(--border-faint)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {imports.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-faint)' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.93rem' }}>{item.filename || '—'}</strong>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>{item.total_contacts ?? '—'}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <StatusBadge status={item.status} />
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 240 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.notes || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem', padding: '40px 20px', textAlign: 'center' }}>
            Todavía no hay importaciones registradas en el sistema.
          </div>
        )}
      </section>
    </section>
  );
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const SECTOR_STATES = [
  { key: 'seguir',    label: 'Seguimiento', color: 'var(--amber-text)'  },
  { key: 'portal',    label: 'Portal',      color: 'var(--purple-text)' },
  { key: 'enviar',    label: 'Por enviar',  color: 'var(--accent)'      },
  { key: 'descartar', label: 'Descartados', color: 'var(--text-muted)'  },
  { key: 'rebotado',  label: 'Rebotaron',   color: 'var(--red-text)'    },
];

// ── Sub-componentes ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'neutral' }) {
  const bgStyle =
    color === 'positive' ? { background: 'var(--green-bg)', border: '1px solid var(--green-text)' }
    : color === 'negative' ? { background: 'var(--red-bg)', border: '1px solid var(--red-text)' }
    : color === 'warning' ? { background: 'var(--amber-bg)', border: '1px solid var(--amber-text)' }
    : { background: 'var(--surface-raised)', border: '1px solid var(--border-faint)' };

  const valueColor =
    color === 'positive' ? 'var(--green-text)'
    : color === 'negative' ? 'var(--red-text)'
    : color === 'warning' ? 'var(--amber-text)'
    : 'var(--text-primary)';

  return (
    <article style={{ borderRadius: 22, padding: 20, display: 'grid', gap: 8, ...bgStyle }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.87rem', fontWeight: 500 }}>{label}</span>
      <strong style={{ fontSize: '1.9rem', lineHeight: 1, fontWeight: 700, color: valueColor }}>{value}</strong>
      {sub && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{sub}</span>}
    </article>
  );
}

function DeltaBadge({ value }) {
  const cls = getDeltaClassName(value);
  const style =
    cls === 'is-positive' ? { background: 'var(--green-bg)', color: 'var(--green-text)' }
    : cls === 'is-negative' ? { background: 'var(--red-bg)', color: 'var(--red-text)' }
    : { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
  return (
    <span style={{ ...style, borderRadius: 999, padding: '4px 10px', fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {formatDelta(value)}
    </span>
  );
}

const STATUS_CSS = {
  confirmed: { background: 'var(--green-bg)', color: 'var(--green-text)' },
  draft:     { background: 'var(--amber-bg)', color: 'var(--amber-text)' },
  error:     { background: 'var(--red-bg)',   color: 'var(--red-text)'   },
};

const STATUS_LABEL_ES = {
  confirmed: 'Confirmado',
  draft:     'Borrador',
  error:     'Error',
};

function StatusBadge({ status }) {
  const style = STATUS_CSS[status] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
  return (
    <span style={{ ...style, display: 'inline-flex', borderRadius: 999, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
      {STATUS_LABEL_ES[status] ?? status}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAnalytics(emailJobs, contacts) {
  const sentJobs   = emailJobs.filter(j => j.status === 'sent' || j.status === 'completed').length;
  const failedJobs = emailJobs.filter(j => j.status === 'failed' || j.status === 'error').length;
  const totalResolved = sentJobs + failedJobs;
  const successRate = totalResolved > 0 ? Math.round((sentJobs / totalResolved) * 100) : null;

  const actioned = contacts.filter(c => {
    const action = String(c.next_action || '').toLowerCase();
    return action !== 'enviar' && c.created_at && c.updated_at;
  });
  let avgDaysToFirstSend = null;
  if (actioned.length > 0) {
    const totalMs = actioned.reduce((sum, c) => {
      const diff = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime();
      return sum + Math.max(diff, 0);
    }, 0);
    avgDaysToFirstSend = Math.round(totalMs / actioned.length / 86_400_000);
  }

  return { sentJobs, failedJobs, totalResolved, successRate, avgDaysToFirstSend, sampledContacts: actioned.length };
}

function buildSectorPerformance(contacts) {
  const byIndustry = {};
  contacts.forEach(c => {
    const key = c.industry || 'generalista';
    if (!byIndustry[key]) {
      byIndustry[key] = { enviar: 0, seguir: 0, portal: 0, descartar: 0, rebotado: 0, total: 0 };
    }
    byIndustry[key].total++;
    if (c.bounced_at) {
      byIndustry[key].rebotado++;
    } else {
      const action = c.next_action || 'enviar';
      const slot = ['enviar', 'seguir', 'portal', 'descartar'].includes(action) ? action : 'enviar';
      byIndustry[key][slot]++;
    }
  });

  return Object.entries(byIndustry)
    .map(([key, counts]) => ({ key, label: getSectorLabel(key), ...counts }))
    .sort((a, b) => b.total - a.total);
}

function buildPipelineAge(contacts, emailJobs) {
  const sentContactIds = new Set(
    emailJobs.filter(j => j.status === 'sent' || j.status === 'completed').map(j => j.contact_id),
  );

  const today = Date.now();
  const buckets = [
    { label: '1-3 días',  sublabel: 'Recientes',             min: 0,  max: 3,        color: 'var(--green-text)',  total: 0, sent: 0, unsent: 0 },
    { label: '4-7 días',  sublabel: 'Normal',                min: 3,  max: 7,        color: 'var(--amber-text)', total: 0, sent: 0, unsent: 0 },
    { label: '8-14 días', sublabel: 'Empezando a envejecer', min: 7,  max: 14,       color: 'var(--accent)',     total: 0, sent: 0, unsent: 0 },
    { label: '+15 días',  sublabel: '¡Revisalos!',           min: 14, max: Infinity,  color: 'var(--red-text)',   total: 0, sent: 0, unsent: 0 },
  ];

  const enviarContacts = contacts.filter(c => (c.next_action || '') === 'enviar');

  enviarContacts.forEach(c => {
    const ref = new Date(c.updated_at || c.created_at);
    const days = Math.floor((today - ref.getTime()) / 86_400_000);
    const bucket = buckets.find(b => days >= b.min && days < b.max);
    if (bucket) {
      bucket.total++;
      if (sentContactIds.has(c.id)) bucket.sent++;
      else bucket.unsent++;
    }
  });

  const totalSent   = buckets.reduce((s, b) => s + b.sent,   0);
  const totalUnsent = buckets.reduce((s, b) => s + b.unsent, 0);

  return { buckets, total: enviarContacts.length, totalSent, totalUnsent };
}
