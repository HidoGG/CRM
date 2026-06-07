import React, { useState } from 'react';
import {
  API_BASE,
  buildMultiSparklineSeries,
  getRelativeBarWidth,
  prettifyAction,
  getDeltaClassName,
  formatDelta,
  buildSparklinePoints,
} from '../../AppShell';

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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.87rem', display: 'block' }}>{label}</span>
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
          <div style={{ color: 'var(--text-muted)', fontSize: '0.87rem' }}>Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

export function TrendsView({ reporting }) {
  const [activeRange, setActiveRange] = useState(7);
  const filteredSnapshots = reporting.recent_snapshots.slice(0, activeRange);

  return (
    <section className="grid gap-5">

      {/* ── Hero + corte actual ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(280px,0.8fr)', gap: 20 }}>
        <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="eyebrow">Tendencias</span>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            Lectura histórica para entender ritmo, acumulación y calidad del pipeline.
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.9rem' }}>
            Esta vista separa el análisis del trabajo diario y concentra snapshots, comparativas y
            evolución de stock en un solo lugar.
          </p>
        </article>

        <article className="card">
          <span className="eyebrow">Corte actual</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            {[
              { label: 'Contactos',   value: reporting.stock_comparison.current.total_contacts      },
              { label: 'Cola activa', value: reporting.stock_comparison.current.active_total        },
              { label: 'Vencidos',    value: reporting.stock_comparison.current.overdue_count       },
              { label: 'Sin fecha',   value: reporting.stock_comparison.current.without_date_count  },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: 14, borderRadius: 18, background: 'var(--surface-subtle)', border: '1px solid var(--border-faint)' }}>
                <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.87rem', marginTop: 4, display: 'block' }}>{label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* ── Actividad semanal ── */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Ritmo</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Actividad semanal</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Comparación entre los últimos 7 días y la ventana anterior.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
          {['enviar', 'seguir', 'portal', 'descartar'].map(action => (
            <div key={`bar-${action}`} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{prettifyAction(action)}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  {reporting.activity.last_7d[action]} vs {reporting.activity.previous_7d[action]}
                </span>
              </div>
              <div style={{ position: 'relative', height: 16, borderRadius: 999, background: 'var(--surface-subtle)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, background: 'var(--accent)', opacity: 0.85, width: `${getRelativeBarWidth(reporting.activity.last_7d[action], reporting.activity.previous_7d[action])}%` }} />
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, background: 'var(--text-muted)', opacity: 0.35, width: `${getRelativeBarWidth(reporting.activity.previous_7d[action], reporting.activity.last_7d[action])}%` }} />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <span className="eyebrow">Stock histórico</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Evolución de snapshots</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Serie de contactos, cola activa, vencidos y sin fecha en la ventana elegida.
            </p>
          </div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
          >
            {filteredSnapshots.length} cortes
          </span>
        </div>

        {/* Acciones exportar + filtros */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar resumen CSV
          </button>
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: '0.88rem' }}
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar snapshots CSV
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {[7, 14, 30].map(range => (
            <button
              key={range}
              type="button"
              aria-pressed={activeRange === range}
              onClick={() => setActiveRange(range)}
              style={{
                borderRadius: 999,
                padding: '6px 18px',
                fontSize: '0.9rem',
                fontWeight: 600,
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
        </div>

        <article style={{ background: 'var(--surface-subtle)', borderRadius: 22, padding: 18, display: 'grid', gap: 14, marginBottom: 16, border: '1px solid var(--border-faint)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Stock histórico</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              Lectura conjunta de contactos, cola activa, vencidos y sin fecha.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', height: 76 }} aria-hidden="true">
            {buildMultiSparklineSeries(filteredSnapshots) ? (
              <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={{ width: '100%', height: 76 }}>
                {Object.entries(buildMultiSparklineSeries(filteredSnapshots)).map(([key, points]) => {
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
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin serie suficiente para graficar.</div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { color: 'var(--accent)',     label: 'Contactos'   },
              { color: 'var(--green-text)', label: 'Cola activa' },
              { color: 'var(--red-text)',   label: 'Vencidos'    },
              { color: 'var(--amber-text)', label: 'Sin fecha'   },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </span>
            ))}
          </div>
        </article>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <SparklineCard label="Contactos"   value={reporting.stock_comparison.current.total_contacts}     delta={reporting.stock_comparison.deltas.total_contacts}     data={filteredSnapshots.map(s => s.total_contacts).reverse()}     />
          <SparklineCard label="Cola activa" value={reporting.stock_comparison.current.active_total}       delta={reporting.stock_comparison.deltas.active_total}       data={filteredSnapshots.map(s => s.active_total).reverse()}       />
          <SparklineCard label="Vencidos"    value={reporting.stock_comparison.current.overdue_count}      delta={reporting.stock_comparison.deltas.overdue_count}      data={filteredSnapshots.map(s => s.overdue_count).reverse()}      />
          <SparklineCard label="Sin fecha"   value={reporting.stock_comparison.current.without_date_count} delta={reporting.stock_comparison.deltas.without_date_count} data={filteredSnapshots.map(s => s.without_date_count).reverse()} />
        </div>
      </section>
    </section>
  );
}
