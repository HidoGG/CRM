import { useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';
import {
  buildMultiSparklineSeries,
  buildSparklinePoints,
  formatDelta,
  getDeltaClassName,
  prettifyAction,
} from '../lib/utils';

export function EstadisticasView({ reporting, imports, emailJobs, contacts }) {
  const [activeRange, setActiveRange] = useState(7);
  const filteredSnapshots = reporting.recent_snapshots.slice(0, activeRange);

  const multiSeries = useMemo(
    () => buildMultiSparklineSeries(filteredSnapshots),
    [filteredSnapshots],
  );

  const funnel = useMemo(
    () => buildFunnel(contacts, emailJobs, reporting),
    [contacts, emailJobs, reporting],
  );

  const hasSnapshotData = filteredSnapshots.length >= 2;

  return (
    <section className="grid gap-5">

      {/* ── 1. Funnel de conversión ── */}
      <section className="card" style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span className="eyebrow">Conversión</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Funnel del pipeline
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Dónde está cada contacto en el proceso de búsqueda activa.
            </p>
          </div>

          {funnel.tasaEntrega !== null && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', fontFamily: "'Barlow Condensed', sans-serif", display: 'block' }}>
                Tasa de entrega
              </span>
              <strong style={{
                fontSize: '1.7rem', fontWeight: 700, lineHeight: 1,
                color: funnel.tasaEntrega >= 80 ? 'var(--green-text)' : funnel.tasaEntrega >= 50 ? 'var(--amber-text)' : 'var(--red-text)',
                display: 'block', marginTop: 2,
              }}>
                {funnel.tasaEntrega}%
              </strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {funnel.sentJobs} enviados · {funnel.failedJobs} fallidos
              </span>
            </div>
          )}
        </div>

        {/* Pasos del funnel */}
        <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', gap: 0 }}>
          {[
            { label: 'Total',        count: funnel.total,          pct: 100,                                                                                          color: 'var(--accent)'      },
            { label: 'Contactados',  count: funnel.contactados,    pct: funnel.total > 0 ? Math.round(funnel.contactados   / funnel.total * 100) : 0,                 color: 'var(--blue)'        },
            { label: 'Seguimiento',  count: funnel.enSeguimiento,  pct: funnel.total > 0 ? Math.round(funnel.enSeguimiento / funnel.total * 100) : 0,                 color: 'var(--amber-text)'  },
            { label: 'Portal',       count: funnel.enPortal,       pct: funnel.total > 0 ? Math.round(funnel.enPortal      / funnel.total * 100) : 0,                 color: 'var(--purple-text)' },
            { label: 'Aplicado',     count: funnel.portalAplicado, pct: funnel.total > 0 ? Math.round(funnel.portalAplicado / funnel.total * 100) : 0,                color: 'var(--green-text)'  },
          ].map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 90 }}>
              {i > 0 && (
                <span aria-hidden="true" style={{ flexShrink: 0, padding: '0 4px', color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1 }}>›</span>
              )}
              <div style={{
                flex: 1,
                background: 'var(--surface-subtle)',
                borderRadius: 12,
                border: '1px solid var(--border-faint)',
                padding: '14px 10px',
                textAlign: 'center',
                display: 'grid',
                gap: 4,
              }}>
                <strong style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1, color: step.color }}>
                  {step.count.toLocaleString('es-AR')}
                </strong>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{step.label}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {step.pct === 100 ? 'base' : `${step.pct}%`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Métricas secundarias */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Pendientes de envío" value={funnel.pendientesEnvio} bg="var(--surface-subtle)" color="var(--text-secondary)" border />
          <Chip label="Descartados" value={funnel.descartados} bg="var(--gray-bg)" color="var(--gray-text)" />
          {funnel.rebotes > 0 && (
            <Chip label="Rebotes" value={funnel.rebotes} bg="var(--red-bg)" color="var(--red-text)" />
          )}
          {funnel.portalPendiente > 0 && (
            <Chip label="Portal pendiente" value={funnel.portalPendiente} bg="var(--purple-bg)" color="var(--purple-text)" />
          )}
        </div>

        {/* Motivos de descarte */}
        {funnel.discardReasons.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', fontFamily: "'Barlow Condensed', sans-serif" }}>
              Motivos de descarte
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {funnel.discardReasons.map(({ key, label, count }) => (
                <span
                  key={key}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontSize: '0.82rem', border: '1px solid var(--border-faint)' }}
                >
                  {label.replace(/_/g, ' ')}
                  <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Actividad semanal ── */}
      <section className="card">
        <div style={{ marginBottom: 16 }}>
          <span className="eyebrow">Ritmo</span>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Actividad semanal
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Últimos 7 días comparados con la ventana anterior.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {['enviar', 'seguir', 'portal', 'descartar'].map(action => (
            <article key={action} style={{ background: 'var(--surface-subtle)', borderRadius: 12, padding: 14, display: 'grid', gap: 10, border: '1px solid var(--border-faint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{prettifyAction(action)}</strong>
                <DeltaBadge value={reporting.activity.deltas_7d[action]} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--surface-raised)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border-faint)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', display: 'block', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>7d</span>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1.3rem', lineHeight: 1 }}>{reporting.activity.last_7d[action]}</strong>
                </div>
                <div style={{ background: 'var(--surface-raised)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border-faint)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', display: 'block', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ant.</span>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '1.3rem', lineHeight: 1 }}>{reporting.activity.previous_7d[action]}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── 3. Stock en el tiempo ── */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Evolución de stock</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Stock en el tiempo</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Contactos, cola activa, vencidos y sin fecha en la ventana elegida.
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}>
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
              style={{ borderRadius: 999, padding: '6px 18px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', border: activeRange === range ? '1px solid var(--accent)' : '1px solid var(--border)', background: activeRange === range ? 'var(--accent)' : 'transparent', color: activeRange === range ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'all 0.15s ease' }}
            >
              {range} días
            </button>
          ))}
          <button
            type="button"
            className="ghost-button"
            style={{ marginLeft: 'auto', fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar CSV
          </button>
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar snapshots
          </button>
        </div>

        {hasSnapshotData ? (
          <>
            <article style={{ background: 'var(--surface-subtle)', borderRadius: 12, padding: 18, display: 'grid', gap: 14, marginBottom: 16, border: '1px solid var(--border-faint)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', height: 76 }} aria-hidden="true">
                {multiSeries ? (
                  <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={{ width: '100%', height: 76 }}>
                    {Object.entries(multiSeries).map(([key, points]) => {
                      const strokeColor =
                        key === 'active'       ? 'var(--green-text)'
                        : key === 'overdue'    ? 'var(--red-text)'
                        : key === 'withoutDate'? 'var(--amber-text)'
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin variación suficiente para graficar.</div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[
                  { key: 'contacts',    color: 'var(--accent)',     label: 'Contactos'   },
                  { key: 'active',      color: 'var(--green-text)', label: 'Cola activa' },
                  { key: 'overdue',     color: 'var(--red-text)',   label: 'Vencidos'    },
                  { key: 'withoutDate', color: 'var(--amber-text)', label: 'Sin fecha'   },
                ].map(({ key, color, label }) => (
                  <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {label}
                  </span>
                ))}
              </div>
            </article>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
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
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--surface-subtle)', borderRadius: 12, border: '1px solid var(--border-faint)' }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Sin datos históricos suficientes
            </p>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.87rem' }}>
              Los snapshots se generan diariamente. Volvé mañana para ver la evolución del pipeline.
            </p>
          </div>
        )}
      </section>

      {/* ── 4. Historial de importaciones ── */}
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
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border-faint)' }}>
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
                      <ImportStatusBadge status={item.status} />
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

function Chip({ label, value, bg, color, border = false }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      borderRadius: 999,
      background: bg,
      color,
      fontSize: '0.85rem',
      ...(border ? { border: '1px solid var(--border-faint)' } : {}),
    }}>
      {label}: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </span>
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
    <article style={{ background: 'var(--surface-subtle)', borderRadius: 12, padding: 16, display: 'grid', gap: 12, border: '1px solid var(--border-faint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', display: 'block' }}>{label}</span>
          <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '1.45rem', marginTop: 4, lineHeight: 1 }}>{value}</strong>
        </div>
        <DeltaBadge value={delta} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 44 }} aria-hidden="true">
        {points ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: '100%', height: 44 }}>
            <polyline points={points} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

const IMPORT_STATUS_STYLE = {
  confirmed: { background: 'var(--green-bg)', color: 'var(--green-text)' },
  draft:     { background: 'var(--amber-bg)', color: 'var(--amber-text)' },
  error:     { background: 'var(--red-bg)',   color: 'var(--red-text)'   },
};

function ImportStatusBadge({ status }) {
  const style = IMPORT_STATUS_STYLE[status] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
  return (
    <span style={{ ...style, display: 'inline-flex', borderRadius: 999, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
      {status}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildFunnel(contacts, emailJobs, reporting) {
  const total = contacts.length;

  // Contactados: contactos con al menos un email enviado exitosamente
  const sentContactIds = new Set(
    emailJobs
      .filter(j => j.status === 'sent' || j.status === 'completed')
      .map(j => j.contact_id),
  );
  const contactados = sentContactIds.size;

  const byAction = reporting.pipeline?.by_action || [];
  const enSeguimiento = byAction.find(a => a.key === 'seguir')?.count  || 0;
  const pendientesEnvio = byAction.find(a => a.key === 'enviar')?.count || 0;

  const portal = reporting.outcomes?.portal || {};
  const enPortal       = portal.total     || 0;
  const portalAplicado = portal.aplicado  || 0;
  const portalPendiente = portal.pendiente || 0;

  const discard = reporting.outcomes?.discard || {};
  const descartados    = discard.total   || 0;
  const discardReasons = discard.reasons || [];

  const rebotes = contacts.filter(c => c.bounced_at).length;

  const sentJobs    = emailJobs.filter(j => j.status === 'sent' || j.status === 'completed').length;
  const failedJobs  = emailJobs.filter(j => j.status === 'failed').length;
  const totalResolved = sentJobs + failedJobs;
  const tasaEntrega = totalResolved > 0 ? Math.round((sentJobs / totalResolved) * 100) : null;

  return {
    total, contactados, enSeguimiento, enPortal, portalAplicado, portalPendiente,
    descartados, discardReasons, pendientesEnvio, rebotes,
    tasaEntrega, sentJobs, failedJobs,
  };
}
