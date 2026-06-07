import { useMemo, useState } from 'react';
import {
  API_BASE,
  buildMultiSparklineSeries,
  buildSparklinePoints,
  formatDelta,
  getDeltaClassName,
  getRelativeBarWidth,
  prettifyAction,
} from '../AppShell';

export function EstadisticasView({ reporting, imports, emailJobs, contacts }) {
  const [activeRange, setActiveRange] = useState(7);
  const filteredSnapshots = reporting.recent_snapshots.slice(0, activeRange);
  const analytics = useMemo(() => buildAnalytics(emailJobs, contacts), [emailJobs, contacts]);

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
            Snapshots comparativos, evolución de stock y métricas de efectividad de envíos.
            El trabajo diario vive en "Hoy" — acá se lee el resultado acumulado.
          </p>
        </article>

        <div style={{ display: 'grid', gap: 14 }}>
          <MetricCard
            label="Tasa de éxito de envíos"
            value={analytics.successRate !== null ? `${analytics.successRate}%` : '—'}
            sub={analytics.totalResolved > 0 ? `${analytics.sentJobs} enviados · ${analytics.failedJobs} fallidos` : 'Sin jobs resueltos aún'}
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

      {/* ── Evolución de snapshots ── */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Evolución de stock</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Stock en el tiempo</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Contactos, cola activa, vencidos y sin fecha en la ventana elegida.
            </p>
          </div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
          >
            {filteredSnapshots.length} cortes
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {[7, 14, 30].map(range => (
            <button
              key={range}
              type="button"
              onClick={() => setActiveRange(range)}
              aria-pressed={activeRange === range}
              style={{
                borderRadius: 999,
                padding: '6px 18px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                border: activeRange === range ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeRange === range ? 'var(--accent)' : 'transparent',
                color: activeRange === range ? 'var(--accent-text)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {range} días
            </button>
          ))}
          <button
            type="button"
            className="ghost-button"
            style={{ marginLeft: 'auto', fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer')}
            aria-label="Exportar resumen como CSV"
          >
            ↓ Exportar resumen CSV
          </button>
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer')}
            aria-label="Exportar snapshots como CSV"
          >
            ↓ Exportar snapshots CSV
          </button>
        </div>

        <article style={{ background: 'var(--surface-subtle)', borderRadius: 22, padding: 18, display: 'grid', gap: 14, marginBottom: 16, border: '1px solid var(--border-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 76 }} aria-hidden="true">
            {buildMultiSparklineSeries(filteredSnapshots) ? (
              <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={{ width: '100%', height: 76 }}>
                {Object.entries(buildMultiSparklineSeries(filteredSnapshots)).map(([key, points]) => {
                  const strokeColor =
                    key === 'active'      ? 'var(--green-text)'
                    : key === 'overdue'   ? 'var(--red-text)'
                    : key === 'withoutDate' ? 'var(--amber-text)'
                    : 'var(--accent)';
                  return (
                    <polyline
                      key={key}
                      points={points}
                      fill="none"
                      style={{ stroke: strokeColor }}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin serie suficiente para graficar.</div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { key: 'contacts',    color: 'var(--accent)',      label: 'Contactos'   },
              { key: 'active',      color: 'var(--green-text)',  label: 'Cola activa' },
              { key: 'overdue',     color: 'var(--red-text)',    label: 'Vencidos'    },
              { key: 'withoutDate', color: 'var(--amber-text)',  label: 'Sin fecha'   },
            ].map(({ key, color, label }) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </span>
            ))}
          </div>
        </article>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Contactos',   valueKey: 'total_contacts',     deltaKey: 'total_contacts',     snapshotKey: 'total_contacts'     },
            { label: 'Cola activa', valueKey: 'active_total',       deltaKey: 'active_total',       snapshotKey: 'active_total'       },
            { label: 'Vencidos',    valueKey: 'overdue_count',      deltaKey: 'overdue_count',      snapshotKey: 'overdue_count'      },
            { label: 'Sin fecha',   valueKey: 'without_date_count', deltaKey: 'without_date_count', snapshotKey: 'without_date_count' },
          ].map(({ label, valueKey, deltaKey, snapshotKey }) => (
            <SparklineCard
              key={label}
              label={label}
              value={reporting.stock_comparison.current[valueKey]}
              delta={reporting.stock_comparison.deltas[deltaKey]}
              data={filteredSnapshots.map(s => s[snapshotKey]).reverse()}
            />
          ))}
        </div>
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
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
          >
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

function SparklineCard({ label, value, delta, data }) {
  const points = buildSparklinePoints(data);
  return (
    <article style={{ background: 'var(--surface-subtle)', borderRadius: 22, padding: 18, display: 'grid', gap: 14, border: '1px solid var(--border-faint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block' }}>{label}</span>
          <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '1.45rem', marginTop: 4, lineHeight: 1 }}>{value}</strong>
        </div>
        <DeltaBadge value={delta} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 44 }} aria-hidden="true">
        {points ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: '100%', height: 44 }}>
            <polyline
              points={points}
              fill="none"
              style={{ stroke: 'var(--accent)' }}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

const STATUS_CSS = {
  confirmed: { background: 'var(--green-bg)', color: 'var(--green-text)' },
  draft:     { background: 'var(--amber-bg)', color: 'var(--amber-text)' },
  error:     { background: 'var(--red-bg)',   color: 'var(--red-text)'   },
};

function StatusBadge({ status }) {
  const style = STATUS_CSS[status] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
  return (
    <span style={{ ...style, display: 'inline-flex', borderRadius: 999, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
      {status}
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
