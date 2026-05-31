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
    <section className="grid gap-[20px]">

      {/* ── Hero + métricas nuevas ── */}
      <section className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)] gap-[20px]">
        <article className="rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] bg-[radial-gradient(circle_at_top_right,rgba(75,179,253,0.12),transparent_34%),rgba(255,255,255,0.9)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Estadísticas</span>
          <h2 className="m-0 mt-3 text-2xl font-bold">Analítica a mediano plazo: ritmo, calidad y trazabilidad del pipeline.</h2>
          <p className="mt-2 mb-0 text-[#142433]/70 leading-relaxed">
            Snapshots comparativos, evolución de stock y métricas de efectividad de envíos. El trabajo
            diario vive en "Hoy" — acá se lee el resultado acumulado.
          </p>
        </article>

        <div className="grid gap-[14px]">
          <MetricCard
            label="Tasa de éxito de envíos"
            value={analytics.successRate !== null ? `${analytics.successRate}%` : '—'}
            sub={
              analytics.totalResolved > 0
                ? `${analytics.sentJobs} enviados · ${analytics.failedJobs} fallidos`
                : 'Sin jobs resueltos aún'
            }
            color={
              analytics.successRate === null ? 'neutral'
              : analytics.successRate >= 80 ? 'positive'
              : analytics.successRate >= 50 ? 'warning'
              : 'negative'
            }
          />
          <MetricCard
            label="Tiempo medio import → envío"
            value={analytics.avgDaysToFirstSend !== null ? `${analytics.avgDaysToFirstSend}d` : '—'}
            sub={
              analytics.sampledContacts > 0
                ? `sobre ${analytics.sampledContacts} contactos accionados`
                : 'Sin contactos accionados aún'
            }
            color="neutral"
          />
        </div>
      </section>

      {/* ── Actividad semanal comparativa ── */}
      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-[12px] items-start mb-[18px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Actividad semanal</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem]">Comparación entre los últimos 7 días y la ventana anterior.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">Ritmo</span>
        </div>

        <div className="grid gap-[14px] mb-[20px]">
          {['enviar', 'seguir', 'portal', 'descartar'].map((action) => (
            <div key={action} className="grid gap-[8px]">
              <div className="flex justify-between gap-[12px] items-baseline">
                <strong className="text-[#102538]">{prettifyAction(action)}</strong>
                <span className="text-[#597189] text-[0.9rem]">
                  {reporting.activity.last_7d[action]} vs {reporting.activity.previous_7d[action]}
                </span>
              </div>
              <div className="relative h-[16px] rounded-full bg-[#142433]/8 overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full bg-[#184e77]/78"
                  style={{ width: `${getRelativeBarWidth(reporting.activity.last_7d[action], reporting.activity.previous_7d[action])}%` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full bg-[#5c7189]/42"
                  style={{ width: `${getRelativeBarWidth(reporting.activity.previous_7d[action], reporting.activity.last_7d[action])}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-[16px]">
          {['enviar', 'seguir', 'portal', 'descartar'].map((action) => (
            <article key={action} className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
              <div className="flex justify-between gap-[12px] items-start">
                <strong className="text-[#102538]">{prettifyAction(action)}</strong>
                <DeltaBadge value={reporting.activity.deltas_7d[action]} />
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                <div className="bg-white/88 rounded-[16px] p-[12px] grid gap-[6px]">
                  <span className="text-[#597189] text-[0.88rem]">Últimos 7d</span>
                  <strong className="text-[#102538] text-[1.3rem]">{reporting.activity.last_7d[action]}</strong>
                </div>
                <div className="bg-white/88 rounded-[16px] p-[12px] grid gap-[6px]">
                  <span className="text-[#597189] text-[0.88rem]">7d previos</span>
                  <strong className="text-[#102538] text-[1.3rem]">{reporting.activity.previous_7d[action]}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Evolución de snapshots ── */}
      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-[12px] items-start mb-[14px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Evolución de stock</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem]">Contactos, cola activa, vencidos y sin fecha en la ventana elegida.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">{filteredSnapshots.length} cortes</span>
        </div>

        <div className="flex flex-wrap gap-[10px] mb-[16px]">
          {[7, 14, 30].map((range) => (
            <button
              key={range}
              type="button"
              className={`rounded-full border px-[14px] py-[10px] cursor-pointer font-medium text-[0.95rem] transition-colors ${
                activeRange === range
                  ? 'bg-[#184e77] text-white border-[#184e77]'
                  : 'bg-white/84 text-[#173047] border-[#142433]/12 hover:bg-white'
              }`}
              onClick={() => setActiveRange(range)}
            >
              {range} días
            </button>
          ))}

          <button
            type="button"
            className="ml-auto border border-[#142433]/12 rounded-[14px] px-4 py-[10px] font-semibold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors text-[0.92rem]"
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar resumen CSV
          </button>
          <button
            type="button"
            className="border border-[#142433]/12 rounded-[14px] px-4 py-[10px] font-semibold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors text-[0.92rem]"
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer')}
          >
            ↓ Exportar snapshots CSV
          </button>
        </div>

        <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px] mb-[16px]">
          <div className="flex items-end h-[76px]" aria-hidden="true">
            {buildMultiSparklineSeries(filteredSnapshots) ? (
              <svg viewBox="0 0 100 64" preserveAspectRatio="none" className="w-full h-[76px]">
                {Object.entries(buildMultiSparklineSeries(filteredSnapshots)).map(([key, points]) => {
                  const stroke =
                    key === 'active' ? '#2d7b55'
                    : key === 'overdue' ? '#bc4749'
                    : key === 'withoutDate' ? '#b5761a'
                    : '#184e77';
                  return (
                    <polyline
                      key={key}
                      points={points}
                      fill="none"
                      stroke={stroke}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            ) : (
              <div className="text-[#597189] text-[0.9rem]">Sin serie suficiente para graficar.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-[10px]">
            {[
              { key: 'contacts', color: '#184e77', label: 'Contactos' },
              { key: 'active',   color: '#2d7b55', label: 'Cola activa' },
              { key: 'overdue',  color: '#bc4749', label: 'Vencidos' },
              { key: 'withoutDate', color: '#b5761a', label: 'Sin fecha' },
            ].map(({ key, color, label }) => (
              <span key={key} className="inline-flex items-center gap-[8px] text-[#597189] text-[0.9rem]">
                <span className="w-[10px] h-[10px] rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </article>

        <div className="grid grid-cols-4 gap-[16px]">
          {[
            { label: 'Contactos',  valueKey: 'total_contacts',   deltaKey: 'total_contacts',   snapshotKey: 'total_contacts' },
            { label: 'Cola activa', valueKey: 'active_total',    deltaKey: 'active_total',     snapshotKey: 'active_total' },
            { label: 'Vencidos',   valueKey: 'overdue_count',    deltaKey: 'overdue_count',    snapshotKey: 'overdue_count' },
            { label: 'Sin fecha',  valueKey: 'without_date_count', deltaKey: 'without_date_count', snapshotKey: 'without_date_count' },
          ].map(({ label, valueKey, deltaKey, snapshotKey }) => (
            <SparklineCard
              key={label}
              label={label}
              value={reporting.stock_comparison.current[valueKey]}
              delta={reporting.stock_comparison.deltas[deltaKey]}
              data={filteredSnapshots.map((s) => s[snapshotKey]).reverse()}
            />
          ))}
        </div>
      </section>

      {/* ── Historial de importaciones ── */}
      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-[12px] items-start mb-[18px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Historial de importaciones</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem]">Trazabilidad completa de archivos procesados — qué base se subió y cuándo.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">
            {imports.length} registros
          </span>
        </div>

        {imports.length ? (
          <div className="overflow-auto rounded-[18px] border border-[#142433]/8">
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr>
                  {['Archivo', 'Contactos', 'Estado', 'Notas', 'Fecha'].map((col) => (
                    <th key={col} className="bg-[#f4f8fc] text-[#597189] text-[0.84rem] uppercase tracking-[0.07em] px-[18px] py-[14px] text-left border-b border-[#142433]/8 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id} className="border-b border-[#142433]/6 hover:bg-[#f9fbfd] transition-colors">
                    <td className="px-[18px] py-[14px]">
                      <strong className="text-[#102538] text-[0.95rem]">{item.filename || '—'}</strong>
                    </td>
                    <td className="px-[18px] py-[14px] text-[#597189]">{item.total_contacts ?? '—'}</td>
                    <td className="px-[18px] py-[14px]">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-[18px] py-[14px] text-[#597189] text-[0.9rem] max-w-[240px]">
                      <span className="line-clamp-2">{item.notes || '—'}</span>
                    </td>
                    <td className="px-[18px] py-[14px] text-[#597189] text-[0.88rem] whitespace-nowrap">
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
          <div className="text-[#597189] text-[0.95rem] py-6 text-center">
            Todavía no hay importaciones registradas en el sistema.
          </div>
        )}
      </section>

    </section>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'neutral' }) {
  const valueColor =
    color === 'positive' ? 'text-[#1f5c3a]'
    : color === 'negative' ? 'text-[#9c2730]'
    : color === 'warning' ? 'text-[#7a4f10]'
    : 'text-[#102538]';
  const bg =
    color === 'positive' ? 'bg-[#1f5c3a]/6 border-[#1f5c3a]/14'
    : color === 'negative' ? 'bg-[#bc4749]/6 border-[#bc4749]/14'
    : color === 'warning' ? 'bg-[#e6a340]/8 border-[#e6a340]/20'
    : 'bg-white/86 border-[#142433]/8';

  return (
    <article className={`rounded-[22px] p-[20px] border shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid gap-[8px] ${bg}`}>
      <span className="text-[#597189] text-[0.88rem] font-medium">{label}</span>
      <strong className={`text-[1.9rem] leading-none font-bold ${valueColor}`}>{value}</strong>
      {sub && <span className="text-[#597189] text-[0.82rem]">{sub}</span>}
    </article>
  );
}

function DeltaBadge({ value }) {
  const cls = getDeltaClassName(value);
  return (
    <span className={`rounded-full px-[10px] py-[6px] text-[0.84rem] font-bold ${
      cls === 'is-positive' ? 'bg-[#308a5a]/14 text-[#1f6b45]'
      : cls === 'is-negative' ? 'bg-[#bc4749]/14 text-[#9c2730]'
      : 'bg-[#76828f]/16 text-[#495764]'
    }`}>
      {formatDelta(value)}
    </span>
  );
}

function SparklineCard({ label, value, delta, data }) {
  const points = buildSparklinePoints(data);
  return (
    <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
      <div className="flex justify-between items-start gap-3">
        <div>
          <span className="text-[#597189] text-[0.9rem] block">{label}</span>
          <strong className="block text-[#102538] text-[1.45rem] mt-1">{value}</strong>
        </div>
        <DeltaBadge value={delta} />
      </div>
      <div className="flex items-end h-[44px]" aria-hidden="true">
        {points ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-[44px]">
            <polyline
              points={points}
              fill="none"
              stroke="#184e77"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="text-[#597189] text-[0.9rem]">Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

const STATUS_STYLES = {
  confirmed: 'bg-[#1f5c3a]/10 text-[#1f5c3a]',
  draft:     'bg-[#e6a340]/16 text-[#7a4f10]',
  error:     'bg-[#bc4749]/12 text-[#9c2730]',
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-[#142433]/6 text-[#597189]';
  return (
    <span className={`inline-flex rounded-full px-[10px] py-[4px] text-[0.82rem] font-semibold ${style}`}>
      {status}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAnalytics(emailJobs, contacts) {
  const sentJobs = emailJobs.filter((j) => j.status === 'sent' || j.status === 'completed').length;
  const failedJobs = emailJobs.filter((j) => j.status === 'failed' || j.status === 'error').length;
  const totalResolved = sentJobs + failedJobs;
  const successRate = totalResolved > 0 ? Math.round((sentJobs / totalResolved) * 100) : null;

  // Tiempo medio import → primer envío:
  // Proxy: contactos que ya pasaron de 'enviar' a otra acción, con created_at y updated_at.
  const actioned = contacts.filter((c) => {
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
