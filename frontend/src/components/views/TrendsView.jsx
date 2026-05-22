// frontend/src/components/views/TrendsView.jsx
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

function SparklineCard({ label, value, delta, data }) {
  const points = buildSparklinePoints(data);

  return (
    <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
      <div className="flex justify-between items-start gap-3">
        <div>
          <span className="text-[#597189] text-[0.9rem] block">{label}</span>
          <strong className="block text-[#102538] text-[1.45rem] mt-1">{value}</strong>
        </div>
        <span
          className={`rounded-full px-[10px] py-[6px] text-[0.84rem] font-bold ${
            getDeltaClassName(delta) === 'is-positive'
              ? 'bg-[#308a5a]/14 text-[#1f6b45]'
              : getDeltaClassName(delta) === 'is-negative'
              ? 'bg-[#bc4749]/14 text-[#9c2730]'
              : 'bg-[#76828f]/16 text-[#495764]'
          }`}
        >
          {formatDelta(delta)}
        </span>
      </div>

      <div className="flex items-end h-[44px]" aria-hidden="true">
        {points ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-[44px]">
            <polyline
              points={points}
              className="fill-none stroke-[#184e77] stroke-[2.4px] strokeLinecap-round strokeLinejoin-round"
            />
          </svg>
        ) : (
          <div className="text-[#597189] text-[0.9rem]">Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

export function TrendsView({ reporting }) {
  const [activeRange, setActiveRange] = useState(7);
  const filteredSnapshots = reporting.recent_snapshots.slice(0, activeRange);

  return (
    <section className="grid gap-[20px]">
      <section className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)] gap-[20px]">
        <article className="bg-[#ffffff]/90 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] bg-[radial-gradient(circle_at_top_right,rgba(75,179,253,0.12),transparent_34%),rgba(255,255,255,0.9)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Tendencias</span>
          <h2 className="m-0 mt-3 text-2xl font-bold">Lectura historica para entender ritmo, acumulacion y calidad del pipeline.</h2>
          <p className="mt-2 mb-0 text-[#142433]/70 leading-relaxed">
            Esta vista separa el analisis del trabajo diario y concentra snapshots, comparativas y
            evolucion de stock en un solo lugar.
          </p>
        </article>

        <article className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#e6a340]/16 text-[#9a6111] text-[0.84rem] font-bold">Corte actual</span>
          <div className="mt-[18px] grid grid-cols-2 gap-[12px]">
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.stock_comparison.current.total_contacts}</strong>
              <span className="text-[#597189]">Contactos</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.stock_comparison.current.active_total}</strong>
              <span className="text-[#597189]">Cola activa</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.stock_comparison.current.overdue_count}</strong>
              <span className="text-[#597189]">Vencidos</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.stock_comparison.current.without_date_count}</strong>
              <span className="text-[#597189]">Sin fecha</span>
            </div>
          </div>
        </article>
      </section>

      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-[12px] items-start mb-[14px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Actividad semanal</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem] leading-[1.5]">Comparacion entre los ultimos 7 dias y la ventana anterior.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">Ritmo</span>
        </div>

        <div className="grid gap-[14px] mb-[16px]">
          {['enviar', 'seguir', 'portal', 'descartar'].map((action) => (
            <div key={`bar-${action}`} className="grid gap-[8px]">
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
                <span
                  className={`rounded-full px-[10px] py-[6px] text-[0.84rem] font-bold ${
                    getDeltaClassName(reporting.activity.deltas_7d[action]) === 'is-positive'
                      ? 'bg-[#308a5a]/14 text-[#1f6b45]'
                      : getDeltaClassName(reporting.activity.deltas_7d[action]) === 'is-negative'
                      ? 'bg-[#bc4749]/14 text-[#9c2730]'
                      : 'bg-[#76828f]/16 text-[#495764]'
                  }`}
                >
                  {formatDelta(reporting.activity.deltas_7d[action])}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                <div className="bg-white/88 rounded-[16px] p-[12px] grid gap-[6px]">
                  <span className="text-[#597189] text-[0.88rem]">Ultimos 7 dias</span>
                  <strong className="text-[#102538] text-[1.3rem]">{reporting.activity.last_7d[action]}</strong>
                </div>
                <div className="bg-white/88 rounded-[16px] p-[12px] grid gap-[6px]">
                  <span className="text-[#597189] text-[0.88rem]">7 previos</span>
                  <strong className="text-[#102538] text-[1.3rem]">{reporting.activity.previous_7d[action]}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-[12px] items-start mb-[14px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Evolucion de snapshots</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem] leading-[1.5]">Serie corta de stock para seguir contactos, cola activa, vencidos y sin fecha.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">{filteredSnapshots.length} cortes visibles</span>
        </div>

        <div className="flex flex-wrap gap-[12px] mb-[16px]">
          <button
            type="button"
            className="border border-[#142433]/12 rounded-[14px] px-4 py-3 font-bold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors"
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer')}
          >
            Exportar resumen CSV
          </button>
          <button
            type="button"
            className="border border-[#142433]/12 rounded-[14px] px-4 py-3 font-bold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors"
            onClick={() => window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer')}
          >
            Exportar snapshots CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-[10px] mb-[16px]">
          {[7, 14, 30].map((range) => (
            <button
              key={range}
              type="button"
              className={`rounded-full border border-[#142433]/12 px-[14px] py-[10px] cursor-pointer font-medium text-[0.95rem] transition-colors ${
                activeRange === range ? 'bg-[#184e77] text-white border-[#184e77]' : 'bg-white/84 text-[#173047] hover:bg-white'
              }`}
              onClick={() => setActiveRange(range)}
            >
              {range} dias
            </button>
          ))}
        </div>

        <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px] mb-[16px]">
          <div className="flex justify-between gap-[12px] items-start mb-[14px]">
            <div>
              <h3 className="m-0 text-[1.1rem] font-bold">Stock historico</h3>
              <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem] leading-[1.5]">Lectura conjunta de contactos, cola activa, vencidos y sin fecha en la ventana elegida.</p>
            </div>
          </div>

          <div className="flex items-end h-[76px]" aria-hidden="true">
            {buildMultiSparklineSeries(filteredSnapshots) ? (
              <svg viewBox="0 0 100 64" preserveAspectRatio="none" className="w-full h-[76px]">
                {Object.entries(buildMultiSparklineSeries(filteredSnapshots)).map(([key, points]) => {
                  let strokeClass = 'stroke-[#184e77]';
                  if (key === 'active') strokeClass = 'stroke-[#2d7b55]';
                  else if (key === 'overdue') strokeClass = 'stroke-[#bc4749]';
                  else if (key === 'withoutDate') strokeClass = 'stroke-[#b5761a]';

                  return (
                    <polyline
                      key={key}
                      points={points}
                      className={`fill-none stroke-[2.4px] strokeLinecap-round strokeLinejoin-round ${strokeClass}`}
                    />
                  );
                })}
              </svg>
            ) : (
              <div className="text-[#597189] text-[0.9rem]">Sin serie suficiente</div>
            )}
          </div>

          <div className="flex flex-wrap gap-[10px]">
            <span className="inline-flex items-center gap-[8px] text-[#597189] text-[0.9rem]">
              <span className="w-[10px] h-[10px] rounded-full bg-[#184e77]" /> Contactos
            </span>
            <span className="inline-flex items-center gap-[8px] text-[#597189] text-[0.9rem]">
              <span className="w-[10px] h-[10px] rounded-full bg-[#2d7b55]" /> Cola activa
            </span>
            <span className="inline-flex items-center gap-[8px] text-[#597189] text-[0.9rem]">
              <span className="w-[10px] h-[10px] rounded-full bg-[#bc4749]" /> Vencidos
            </span>
            <span className="inline-flex items-center gap-[8px] text-[#597189] text-[0.9rem]">
              <span className="w-[10px] h-[10px] rounded-full bg-[#b5761a]" /> Sin fecha
            </span>
          </div>
        </article>

        <div className="grid grid-cols-4 gap-[16px]">
          <SparklineCard
            label="Contactos"
            value={reporting.stock_comparison.current.total_contacts}
            delta={reporting.stock_comparison.deltas.total_contacts}
            data={filteredSnapshots.map((snapshot) => snapshot.total_contacts).reverse()}
          />
          <SparklineCard
            label="Cola activa"
            value={reporting.stock_comparison.current.active_total}
            delta={reporting.stock_comparison.deltas.active_total}
            data={filteredSnapshots.map((snapshot) => snapshot.active_total).reverse()}
          />
          <SparklineCard
            label="Vencidos"
            value={reporting.stock_comparison.current.overdue_count}
            delta={reporting.stock_comparison.deltas.overdue_count}
            data={filteredSnapshots.map((snapshot) => snapshot.overdue_count).reverse()}
          />
          <SparklineCard
            label="Sin fecha"
            value={reporting.stock_comparison.current.without_date_count}
            delta={reporting.stock_comparison.deltas.without_date_count}
            data={filteredSnapshots.map((snapshot) => snapshot.without_date_count).reverse()}
          />
        </div>
      </section>
    </section>
  );
}
