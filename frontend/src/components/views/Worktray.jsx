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
}) {
  return (
    <section className="grid gap-[20px]">
      <section className="grid grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)] gap-[18px] items-stretch">
        <div className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Operacion directa</span>
          <h2 className="m-0 mt-3 text-2xl font-bold">Bandeja operativa</h2>
          <p className="mt-2 mb-0 text-[#142433]/70 leading-relaxed">Filtra por accion, escanea rapido y ejecuta el siguiente paso sin volver al preview.</p>
        </div>
        <div className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid grid-cols-2 lg:grid-cols-4 gap-[12px]">
          {worktrayActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`p-[14px] rounded-[18px] grid gap-[6px] text-left transition-colors cursor-pointer border ${
                activeActionFilter === action
                  ? 'bg-gradient-to-br from-[#4bb3fd]/20 to-[#5ce1e6]/12 border-[#5ce1e6]/35'
                  : 'bg-[#f4f8fc] border-transparent hover:bg-white'
              }`}
              onClick={() => onActionFilterChange(action)}
            >
              <strong className="block text-[1.4rem] text-[#142433]">{counts[action] || 0}</strong>
              <span className={`text-[0.9rem] ${activeActionFilter === action ? 'text-[#184e77] font-semibold' : 'text-[#597189]'}`}>{prettifyAction(action)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex gap-[18px] flex-wrap mb-[4px]">
        <article className="flex-1 min-w-[300px] bg-[radial-gradient(circle_at_top_right,rgba(75,179,253,0.12),transparent_34%),rgba(255,255,255,0.9)] rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold mb-[14px]">Seguimientos</span>
          <div className="grid grid-cols-4 gap-[10px]">
            <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.overdue}</strong><span className="text-[#597189] text-[0.88rem]">Vencidos</span></div>
            <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.due_today}</strong><span className="text-[#597189] text-[0.88rem]">Para hoy</span></div>
            <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.due_this_week}</strong><span className="text-[#597189] text-[0.88rem]">Esta semana</span></div>
            <div className="grid gap-[4px]"><strong className="text-[1.3rem] text-[#142433]">{reporting.queue.without_date}</strong><span className="text-[#597189] text-[0.88rem]">Sin fecha</span></div>
          </div>
        </article>

        <article className="flex-1 min-w-[280px] bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <div className="flex justify-between gap-[12px] items-start mb-[14px]">
            <h3 className="m-0 text-xl font-bold">Actividad</h3>
            <span className="text-[#597189] text-[0.9rem]">Real</span>
          </div>
          <div className="grid gap-[12px]">
            <div className="flex justify-between items-center gap-[12px] bg-[#f6f9fc] rounded-[16px] px-[14px] py-[12px]">
              <strong className="text-[#142433]">24h</strong>
              <span className="text-[#597189] text-[0.9rem]">
                {reporting.activity.last_24h.enviar} enviados · {reporting.activity.last_24h.seguir} seguimientos
              </span>
            </div>
            <div className="flex justify-between items-center gap-[12px] bg-[#f6f9fc] rounded-[16px] px-[14px] py-[12px]">
              <strong className="text-[#142433]">7 dias</strong>
              <span className="text-[#597189] text-[0.9rem]">
                {reporting.activity.last_7d.portal} portales · {reporting.activity.last_7d.descartar} descartes
              </span>
            </div>
          </div>
        </article>

        <article className="flex-1 min-w-[280px] bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
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

      <section className="grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.72fr)] items-start gap-[20px]">
        <div className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid gap-[16px]">
          <div className="flex justify-between gap-[12px] items-start mb-[14px]">
            <div>
              <h3 className="m-0 text-xl font-bold">{prettifyAction(activeActionFilter)}</h3>
              <p className="mt-[4px] mb-0 text-[#597189] text-[0.9rem]">Contactos listos para resolver en esta pasada.</p>
            </div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">{contacts.length} pendientes</span>
          </div>

          <div className="flex flex-wrap gap-[10px]">
            {worktrayActions.map((action) => (
              <button
                key={action}
                type="button"
                className={`rounded-full border border-[#142433]/12 px-[14px] py-[10px] text-[0.95rem] cursor-pointer transition-colors ${
                  activeActionFilter === action ? 'bg-[#184e77] text-white border-[#184e77]' : 'bg-white/84 text-[#173047] hover:bg-white'
                }`}
                onClick={() => onActionFilterChange(action)}
              >
                {prettifyAction(action)} ({counts[action] || 0})
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-[10px] mt-[-6px]">
            {timingFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`rounded-full border border-[#142433]/12 px-[14px] py-[10px] text-[0.95rem] cursor-pointer transition-colors ${
                  activeTimingFilter === filter ? 'bg-[#184e77] text-white border-[#184e77]' : 'bg-white/84 text-[#173047] hover:bg-white'
                }`}
                onClick={() => onTimingFilterChange(filter)}
              >
                {prettifyTimingFilter(filter)} ({timingCounts[filter] || 0})
              </button>
            ))}
          </div>

          <div className="overflow-auto rounded-[24px] border border-[#142433]/8 bg-white/90 shadow-[0_20px_50px_rgba(32,57,82,0.08)] mt-[8px]">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Contacto</th>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Empresa</th>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Estado</th>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Seguimiento</th>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Lectura operativa</th>
                  <th className="bg-[#f4f8fc] text-[#597189] text-[0.85rem] uppercase tracking-[0.08em] px-[18px] py-[16px] text-left border-b border-[#142433]/8">Ejecutar</th>
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
                        <td className="px-[18px] py-[16px]">
                          <div className="grid gap-[4px]">
                            <strong className="text-[#102538]">{contact.name || 'Sin nombre'}</strong>
                            <span className="text-[#597189] text-[0.9rem]">{contact.email || '-'}</span>
                          </div>
                        </td>
                        <td className="px-[18px] py-[16px]">
                          <div className="grid gap-[4px]">
                            <strong className="text-[#102538]">{contact.company || '-'}</strong>
                            <span className="text-[#597189] text-[0.9rem]">{prettifyAction(action)}</span>
                          </div>
                        </td>
                        <td className="px-[18px] py-[16px]">
                          <span className={`inline-flex rounded-[8px] px-[10px] py-[4px] text-[0.85rem] font-bold border ${
                            String(contact.status).toLowerCase() === 'prioridad' ? 'bg-[#5b2b2b]/10 text-[#5b2b2b] border-[#5b2b2b]/15' :
                            String(contact.status).toLowerCase() === 'mantener' ? 'bg-[#1f5c3a]/10 text-[#1f5c3a] border-[#1f5c3a]/15' :
                            'bg-[#495764]/10 text-[#495764] border-[#495764]/15'
                          }`}>
                            {contact.status}
                          </span>
                        </td>
                        <td className="px-[18px] py-[16px]">
                          <div className="flex flex-wrap gap-[6px] items-center">
                            <span className={`inline-flex rounded-full px-[12px] py-[6px] text-[0.88rem] font-medium ${
                              isFollowUpDue(contact.follow_up_date) ? 'bg-[#bc4749]/14 text-[#9c2730]' : 'bg-[#142433]/6 text-[#142433]'
                            }`}>
                              {formatFollowUpLabel(contact.follow_up_date)}
                            </span>
                            <div className="flex gap-[6px] mt-1 w-full flex-col">
                              <input
                                type="date"
                                className="w-full rounded-[10px] border border-[#142433]/12 bg-white px-3 py-2 text-[0.9rem]"
                                value={editingFollowUp[contact.id] ?? contact.follow_up_date ?? ''}
                                onChange={(event) =>
                                  onFollowUpChange((current) => ({
                                    ...current,
                                    [contact.id]: event.target.value,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="border border-[#142433]/12 rounded-[10px] px-3 py-2 font-bold bg-white/75 text-[#173047] hover:bg-white/90 text-[0.85rem]"
                                onClick={() => onSaveFollowUp(contact)}
                                disabled={executingId === contact.id}
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-[18px] py-[16px]">
                          <div className="grid gap-[8px]">
                            <span className="inline-flex rounded-full px-[12px] py-[6px] text-[0.88rem] bg-[#142433]/6 text-[#142433] font-medium w-fit">{prettifyAction(action)}</span>
                            <p className="m-0 text-[#597189] text-[0.9rem] leading-[1.4] max-w-[280px]">{contact.suggested_message || 'Sin sugerencia disponible.'}</p>
                            {/* Detailed action forms would go here, simplified for Tailwind structure translation */}
                          </div>
                        </td>
                        <td className="px-[18px] py-[16px]">
                          <button
                            type="button"
                            className="bg-gradient-to-br from-[#184e77] to-[#1d70a2] text-white border-0 rounded-[12px] px-3 py-2 font-bold cursor-pointer hover:opacity-90 transition-opacity"
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
                    <td colSpan="6" className="text-center text-[#597189] py-[36px]">No hay contactos pendientes para esta accion.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="sticky top-[24px] grid gap-[16px]">
          <div className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid gap-[14px]">
            <div className="flex justify-between gap-[12px] items-start mb-[4px]">
              <div>
                <h3 className="m-0 text-xl font-bold">Pipeline actual</h3>
                <p className="m-0 mt-1 text-[#597189] text-[0.9rem]">Foto de estados y motivos para decidir la pasada.</p>
              </div>
            </div>

            <div className="grid gap-[6px]">
              {reporting.pipeline.by_status.slice(0, 4).map((item) => (
                <div key={item.key} className="flex justify-between p-[12px] rounded-[14px] bg-[#f4f8fc]">
                  <strong className="text-[#102538]">{capitalize(item.label)}</strong>
                  <span className="text-[#597189] font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid gap-[14px]">
            <div className="flex justify-between gap-[12px] items-start mb-[4px]">
              <div>
                <h3 className="m-0 text-xl font-bold">{selectedContact?.name || 'Historial'}</h3>
                <p className="m-0 mt-1 text-[#597189] text-[0.9rem]">{selectedContact ? 'Trazabilidad del contacto seleccionado.' : 'Selecciona un contacto para ver actividad.'}</p>
              </div>
            </div>

            {selectedContact ? (
              <>
                <div className="flex gap-[10px] items-center mb-[8px]">
                  <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">{selectedContact.company || 'Sin empresa'}</span>
                  <span className="inline-flex rounded-[8px] px-[10px] py-[4px] text-[0.85rem] font-bold border bg-[#495764]/10 text-[#495764] border-[#495764]/15">
                    {selectedContact.status}
                  </span>
                </div>

                <div className="grid gap-[12px] relative pl-[18px] before:content-[''] before:absolute before:left-[4px] before:top-0 before:bottom-0 before:w-[2px] before:bg-[#142433]/8">
                  {loadingHistory ? (
                    <div className="text-[#597189] text-[0.95rem]">Cargando historial...</div>
                  ) : historyItems.length ? (
                    historyItems.map((item) => (
                      <article key={item.id} className="relative grid gap-[4px] before:content-[''] before:absolute before:left-[-19px] before:top-[6px] before:w-[10px] before:h-[10px] before:rounded-full before:bg-[#184e77] before:border-[2px] before:border-white">
                        <strong className="text-[#102538] text-[0.95rem]">{prettifyEvent(item.event_type)}</strong>
                        <p className="m-0 text-[#142433]/80 text-[0.9rem] leading-[1.4]">{item.message}</p>
                        <span className="text-[#597189] text-[0.8rem] uppercase tracking-wide">{formatDate(item.created_at)}</span>
                      </article>
                    ))
                  ) : (
                    <div className="text-[#597189] text-[0.95rem]">Todavia no hay eventos...</div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-[#597189] text-[0.95rem]">No hay contacto seleccionado.</div>
            )}
          </div>
        </aside>
      </section>
    </section>
  );
}
