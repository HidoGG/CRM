// frontend/src/components/views/Worktray.jsx
import React from 'react';
import {
  worktrayActions,
  timingFilters,
  prettifyAction,
  prettifyTimingFilter,
  formatFollowUpLabel,
  isFollowUpDue,
  prettifyEvent,
  formatDate,
  capitalize,
} from '../../AppShell';

export function Worktray({
  contacts,
  activeActionFilter,
  onActionFilterChange,
  activeTimingFilter,
  onTimingFilterChange,
  counts,
  timingCounts,
  reporting,
  executingId,
  onExecuteAction,
  editingFollowUp,
  onFollowUpChange,
  onSaveFollowUp,
  actionDetails,
  onActionDetailsChange,
  selectedContactId,
  onSelectContact,
  selectedContact,
  historyItems,
  loadingHistory,
  compact = false,
}) {
  const card = 'bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]';

  return (
    <section className="grid gap-[20px]">

      {/* ── FILA SUPERIOR: 3 tarjetas iguales ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">

        {/* Tarjeta 1 — Bandeja operativa */}
        <div className={card}>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Operación directa</span>
          <h2 className="m-0 mt-3 text-2xl font-bold">Bandeja operativa</h2>
          <p className="mt-2 mb-0 text-[#142433]/70 leading-relaxed">Filtrá por acción, escaneá rápido y ejecutá el siguiente paso sin volver al preview.</p>
        </div>

        {/* Tarjeta 2 — Métricas / contadores */}
        <div className={`${card} grid gap-[10px]`}>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold w-fit">Métricas</span>
          <div className="grid grid-cols-2 gap-[10px]">
            {worktrayActions.map((action) => (
              <button
                key={action}
                type="button"
                className={`p-[14px] rounded-[18px] grid gap-[4px] text-left transition-colors cursor-pointer border ${
                  activeActionFilter === action
                    ? 'bg-gradient-to-br from-[#4bb3fd]/20 to-[#5ce1e6]/12 border-[#5ce1e6]/35'
                    : 'bg-[#f4f8fc] border-transparent hover:bg-white'
                }`}
                onClick={() => onActionFilterChange(action)}
              >
                <strong className="block text-[1.4rem] text-[#142433]">{counts[action] || 0}</strong>
                <span className={`text-[0.88rem] ${activeActionFilter === action ? 'text-[#184e77] font-semibold' : 'text-[#597189]'}`}>
                  {prettifyAction(action)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tarjeta 3 — Historial del contacto seleccionado */}
        <div className={`${card} grid gap-[12px]`}>
          <div>
            <h3 className="m-0 text-xl font-bold">{selectedContact?.name || 'Historial'}</h3>
            <p className="m-0 mt-1 text-[#597189] text-[0.9rem]">
              {selectedContact ? 'Trazabilidad del contacto seleccionado.' : 'Seleccioná un contacto de la tabla para ver su actividad.'}
            </p>
          </div>

          {selectedContact ? (
            <>
              <div className="flex gap-[8px] items-center flex-wrap">
                <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">
                  {selectedContact.company || 'Sin empresa'}
                </span>
                <span className="inline-flex rounded-[8px] px-[10px] py-[4px] text-[0.85rem] font-bold border bg-[#495764]/10 text-[#495764] border-[#495764]/15">
                  {selectedContact.status}
                </span>
              </div>
              <div className="grid gap-[12px] relative pl-[18px] before:content-[''] before:absolute before:left-[4px] before:top-0 before:bottom-0 before:w-[2px] before:bg-[#142433]/8 overflow-y-auto max-h-[220px]">
                {loadingHistory ? (
                  <div className="text-[#597189] text-[0.95rem]">Cargando historial...</div>
                ) : historyItems.length ? (
                  historyItems.map((item) => (
                    <article
                      key={item.id}
                      className="relative grid gap-[3px] before:content-[''] before:absolute before:left-[-19px] before:top-[6px] before:w-[10px] before:h-[10px] before:rounded-full before:bg-[#184e77] before:border-[2px] before:border-white"
                    >
                      <strong className="text-[#102538] text-[0.92rem]">{prettifyEvent(item.event_type)}</strong>
                      <p className="m-0 text-[#142433]/80 text-[0.88rem] leading-[1.4]">{item.message}</p>
                      <span className="text-[#597189] text-[0.78rem] uppercase tracking-wide">{formatDate(item.created_at)}</span>
                    </article>
                  ))
                ) : (
                  <div className="text-[#597189] text-[0.95rem]">Todavía no hay eventos...</div>
                )}
              </div>
            </>
          ) : (
            <div className="text-[#597189] text-[0.95rem]">No hay contacto seleccionado.</div>
          )}
        </div>
      </section>

      {/* ── Stats opcionales (solo en modo no-compact) ── */}
      {!compact && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
          <article className={`${card} bg-[radial-gradient(circle_at_top_right,rgba(75,179,253,0.12),transparent_34%),rgba(255,255,255,0.9)]`}>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold mb-[14px]">Seguimientos</span>
            <div className="grid grid-cols-2 gap-[10px]">
              <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.overdue}</strong><span className="text-[#597189] text-[0.88rem]">Vencidos</span></div>
              <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.due_today}</strong><span className="text-[#597189] text-[0.88rem]">Para hoy</span></div>
              <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.due_this_week}</strong><span className="text-[#597189] text-[0.88rem]">Esta semana</span></div>
              <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.without_date}</strong><span className="text-[#597189] text-[0.88rem]">Sin fecha</span></div>
            </div>
          </article>

          <article className={card}>
            <div className="flex justify-between gap-[12px] items-start mb-[14px]">
              <h3 className="m-0 text-xl font-bold">Actividad</h3>
              <span className="text-[#597189] text-[0.9rem]">Real</span>
            </div>
            <div className="grid gap-[10px]">
              <div className="flex justify-between items-center gap-[12px] bg-[#f6f9fc] rounded-[16px] px-[14px] py-[12px]">
                <strong className="text-[#142433]">24h</strong>
                <span className="text-[#597189] text-[0.9rem]">{reporting.activity.last_24h.enviar} enviados · {reporting.activity.last_24h.seguir} seguimientos</span>
              </div>
              <div className="flex justify-between items-center gap-[12px] bg-[#f6f9fc] rounded-[16px] px-[14px] py-[12px]">
                <strong className="text-[#142433]">7 días</strong>
                <span className="text-[#597189] text-[0.9rem]">{reporting.activity.last_7d.portal} portales · {reporting.activity.last_7d.descartar} descartes</span>
              </div>
            </div>
          </article>

          <article className={card}>
            <div className="flex justify-between gap-[12px] items-start mb-[14px]">
              <h3 className="m-0 text-xl font-bold">Resultado</h3>
              <span className="text-[#597189] text-[0.9rem]">Cierre</span>
            </div>
            <div className="grid gap-[10px]">
              <span className="inline-flex rounded-full px-[12px] py-[6px] text-[0.88rem] bg-[#2d7b55]/14 text-[#1a5437] font-medium">Portales aplicados: {reporting.outcomes.portal.aplicado}</span>
              <span className="inline-flex rounded-full px-[12px] py-[6px] text-[0.88rem] bg-[#142433]/6 text-[#142433] font-medium">Pendientes portal: {reporting.outcomes.portal.pendiente}</span>
              <span className="inline-flex rounded-full px-[12px] py-[6px] text-[0.88rem] bg-[#142433]/6 text-[#142433] font-medium">Descartes: {reporting.outcomes.discard.total}</span>
            </div>
          </article>
        </section>
      )}

      {/* ── FILA INFERIOR: tabla a ancho completo ── */}
      <section className={`${card} grid gap-[16px]`}>

        {/* Header */}
        <div className="flex justify-between gap-[12px] items-start">
          <div>
            <h3 className="m-0 text-xl font-bold">{prettifyAction(activeActionFilter)}</h3>
            <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem]">Contactos listos para resolver en esta pasada.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">
            {contacts.length} pendientes
          </span>
        </div>

        {/* Filtros de acción + timing en una fila */}
        <div className="flex flex-wrap gap-[8px]">
          {worktrayActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`rounded-full border px-[14px] py-[8px] text-[0.9rem] cursor-pointer transition-colors ${
                activeActionFilter === action
                  ? 'bg-[#184e77] text-white border-[#184e77]'
                  : 'bg-white/84 text-[#173047] border-[#142433]/12 hover:bg-white'
              }`}
              onClick={() => onActionFilterChange(action)}
            >
              {prettifyAction(action)} ({counts[action] || 0})
            </button>
          ))}
          <span className="w-px bg-[#142433]/10 mx-[4px] self-stretch" />
          {timingFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`rounded-full border px-[14px] py-[8px] text-[0.9rem] cursor-pointer transition-colors ${
                activeTimingFilter === filter
                  ? 'bg-[#184e77] text-white border-[#184e77]'
                  : 'bg-white/84 text-[#173047] border-[#142433]/12 hover:bg-white'
              }`}
              onClick={() => onTimingFilterChange(filter)}
            >
              {prettifyTimingFilter(filter)} ({timingCounts[filter] || 0})
            </button>
          ))}
        </div>

        {/* Tabla full-width */}
        <div className="overflow-x-auto rounded-[18px] border border-[#142433]/8 bg-white/90">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                {['Contacto', 'Empresa', 'Estado', 'Seguimiento', 'Lectura operativa', 'Ejecutar'].map((col) => (
                  <th key={col} className="bg-[#f4f8fc] text-[#597189] text-[0.84rem] uppercase tracking-[0.07em] px-[18px] py-[14px] text-left border-b border-[#142433]/8 font-semibold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.length ? (
                contacts.map((contact) => {
                  const action = String(contact.next_action || '').toLowerCase();
                  return (
                    <tr
                      key={contact.id}
                      className={`cursor-pointer transition-colors border-b border-[#142433]/8 ${
                        selectedContactId === contact.id ? 'bg-[#f4f8fc]' : 'hover:bg-[#f9fbfd]'
                      }`}
                      onClick={() => onSelectContact(contact.id)}
                    >
                      <td className="px-[18px] py-[14px]">
                        <div className="grid gap-[3px]">
                          <strong className="text-[#102538]">{contact.name || 'Sin nombre'}</strong>
                          <span className="text-[#597189] text-[0.88rem]">{contact.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-[18px] py-[14px]">
                        <div className="grid gap-[3px]">
                          <strong className="text-[#102538]">{contact.company || '-'}</strong>
                          <span className="text-[#597189] text-[0.88rem]">{prettifyAction(action)}</span>
                        </div>
                      </td>
                      <td className="px-[18px] py-[14px]">
                        <span className={`inline-flex rounded-[8px] px-[10px] py-[4px] text-[0.85rem] font-bold border ${
                          String(contact.status).toLowerCase() === 'prioridad' ? 'bg-[#5b2b2b]/10 text-[#5b2b2b] border-[#5b2b2b]/15' :
                          String(contact.status).toLowerCase() === 'mantener'  ? 'bg-[#1f5c3a]/10 text-[#1f5c3a] border-[#1f5c3a]/15' :
                          'bg-[#495764]/10 text-[#495764] border-[#495764]/15'
                        }`}>
                          {contact.status}
                        </span>
                      </td>
                      <td className="px-[18px] py-[14px]">
                        <div className="grid gap-[6px]">
                          <span className={`inline-flex rounded-full px-[10px] py-[4px] text-[0.85rem] font-medium ${
                            isFollowUpDue(contact.follow_up_date) ? 'bg-[#bc4749]/14 text-[#9c2730]' : 'bg-[#142433]/6 text-[#142433]'
                          }`}>
                            {formatFollowUpLabel(contact.follow_up_date)}
                          </span>
                          <div className="flex gap-[6px]">
                            <input
                              type="date"
                              className="flex-1 rounded-[8px] border border-[#142433]/12 bg-white px-2 py-1.5 text-[0.85rem]"
                              value={editingFollowUp[contact.id] ?? contact.follow_up_date ?? ''}
                              onChange={(event) =>
                                onFollowUpChange((current) => ({ ...current, [contact.id]: event.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="border border-[#142433]/12 rounded-[8px] px-2 py-1.5 font-bold bg-white/75 text-[#173047] hover:bg-white/90 text-[0.82rem] whitespace-nowrap"
                              onClick={() => onSaveFollowUp(contact)}
                              disabled={executingId === contact.id}
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-[18px] py-[14px]">
                        <div className="grid gap-[6px]">
                          <span className="inline-flex rounded-full px-[10px] py-[4px] text-[0.85rem] bg-[#142433]/6 text-[#142433] font-medium w-fit">
                            {prettifyAction(action)}
                          </span>
                          <p className="m-0 text-[#597189] text-[0.88rem] leading-[1.4] max-w-[260px]">
                            {contact.suggested_message || 'Sin sugerencia disponible.'}
                          </p>
                        </div>
                      </td>
                      <td className="px-[18px] py-[14px]">
                        <button
                          type="button"
                          className="bg-gradient-to-br from-[#184e77] to-[#1d70a2] text-white border-0 rounded-[12px] px-3 py-2 font-bold cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                          onClick={() => onExecuteAction(contact, action)}
                          disabled={executingId === contact.id}
                        >
                          {executingId === contact.id ? 'Ejecutando...' : prettifyAction(action)}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="text-center text-[#597189] py-[36px]">
                    No hay contactos pendientes para esta acción.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </section>
  );
}
