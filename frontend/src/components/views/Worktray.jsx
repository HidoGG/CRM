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
} from '../../lib/utils';

const STATUS_STYLE = {
  prioridad:   { background: 'var(--red-bg)',    color: 'var(--red-text)'   },
  mantener:    { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  seguimiento: { background: 'var(--blue-subtle)', color: 'var(--blue)'    },
  revisar:     { background: 'var(--amber-bg)',  color: 'var(--amber-text)' },
  sacar:       { background: 'var(--gray-bg)',   color: 'var(--gray-text)'  },
  portal:      { background: 'var(--purple-bg)', color: 'var(--purple-text)'},
};

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
  return (
    <section className="grid gap-5">

      {/* ── Fila superior: 3 cards ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>

        {/* Card 1 — Descripción */}
        <div className="card">
          <span className="eyebrow">Operación directa</span>
          <h2 style={{ margin: '6px 0 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Bandeja operativa</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.9rem' }}>
            Filtrá por acción, escaneá rápido y ejecutá el siguiente paso sin volver al preview.
          </p>
        </div>

        {/* Card 2 — Métricas / contadores */}
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <span className="eyebrow">Métricas</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {worktrayActions.map(action => (
              <button
                key={action}
                type="button"
                aria-pressed={activeActionFilter === action}
                onClick={() => onActionFilterChange(action)}
                className={`worktray-metric${activeActionFilter === action ? ' is-active' : ''}`}
                style={{ textAlign: 'left' }}
              >
                <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--text-primary)', lineHeight: 1 }}>{counts[action] || 0}</strong>
                <span style={{ fontSize: '0.85rem', color: activeActionFilter === action ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: activeActionFilter === action ? 600 : 400, marginTop: 4, display: 'block' }}>
                  {prettifyAction(action)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Card 3 — Historial del contacto */}
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedContact?.name || 'Historial'}</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              {selectedContact ? 'Trazabilidad del contacto seleccionado.' : 'Seleccioná un contacto de la tabla para ver su actividad.'}
            </p>
          </div>

          {selectedContact ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '4px 12px', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontSize: '0.83rem', fontWeight: 600 }}>
                  {selectedContact.company || 'Sin empresa'}
                </span>
                {(() => {
                  const sk = String(selectedContact.status || '').toLowerCase();
                  const ss = STATUS_STYLE[sk] || STATUS_STYLE.revisar;
                  return (
                    <span style={{ ...ss, display: 'inline-flex', borderRadius: 8, padding: '3px 10px', fontSize: '0.83rem', fontWeight: 700 }}>
                      {selectedContact.status}
                    </span>
                  );
                })()}
              </div>
              <div
                style={{ display: 'grid', gap: 12, position: 'relative', paddingLeft: 18, overflowY: 'auto', maxHeight: 220 }}
                role="log"
                aria-label="Historial de actividad"
              >
                <div style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 2, background: 'var(--border-faint)' }} aria-hidden="true" />
                {loadingHistory ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>Cargando historial…</div>
                ) : historyItems.length ? (
                  historyItems.map(item => (
                    <article key={item.id} style={{ position: 'relative', display: 'grid', gap: 3 }}>
                      <span style={{ position: 'absolute', left: -19, top: 6, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface-raised)' }} aria-hidden="true" />
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{prettifyEvent(item.event_type)}</strong>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.45 }}>{item.message}</p>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{formatDate(item.created_at)}</span>
                    </article>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>Todavía no hay eventos…</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>No hay contacto seleccionado.</div>
          )}
        </div>
      </section>

      {/* ── Stats opcionales (solo en modo no-compact) ── */}
      {!compact && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          <article className="card">
            <span className="eyebrow mb-3 block">Seguimientos</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Vencidos',     value: reporting.queue.overdue       },
                { label: 'Para hoy',     value: reporting.queue.due_today     },
                { label: 'Esta semana',  value: reporting.queue.due_this_week },
                { label: 'Sin fecha',    value: reporting.queue.without_date  },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: '1.3rem', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Actividad</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Real</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { label: '24h',    text: `${reporting.activity.last_24h.enviar} enviados · ${reporting.activity.last_24h.seguir} seguimientos` },
                { label: '7 días', text: `${reporting.activity.last_7d.portal} portales · ${reporting.activity.last_7d.descartar} descartes` },
              ].map(({ label, text }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'var(--surface-subtle)', borderRadius: 16, padding: '12px 14px', border: '1px solid var(--border-faint)' }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{label}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.87rem' }}>{text}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Resultado</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cierre</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ display: 'inline-flex', borderRadius: 999, padding: '6px 14px', fontSize: '0.87rem', background: 'var(--green-bg)', color: 'var(--green-text)', fontWeight: 600 }}>
                Portales aplicados: {reporting.outcomes.portal.aplicado}
              </span>
              <span style={{ display: 'inline-flex', borderRadius: 999, padding: '6px 14px', fontSize: '0.87rem', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontWeight: 600, border: '1px solid var(--border-faint)' }}>
                Pendientes portal: {reporting.outcomes.portal.pendiente}
              </span>
              <span style={{ display: 'inline-flex', borderRadius: 999, padding: '6px 14px', fontSize: '0.87rem', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontWeight: 600, border: '1px solid var(--border-faint)' }}>
                Descartes: {reporting.outcomes.discard.total}
              </span>
            </div>
          </article>
        </section>
      )}

      {/* ── Tabla a ancho completo ── */}
      <section className="card" style={{ display: 'grid', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <span className="eyebrow">Contactos pendientes</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {prettifyAction(activeActionFilter)}
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              Contactos listos para resolver en esta pasada.
            </p>
          </div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
            aria-live="polite"
          >
            {contacts.length} pendientes
          </span>
        </div>

        {/* Filtros acción + timing */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Filtros de acción y tiempo">
          {worktrayActions.map(action => (
            <button
              key={action}
              type="button"
              aria-pressed={activeActionFilter === action}
              onClick={() => onActionFilterChange(action)}
              style={{
                borderRadius: 999,
                padding: '6px 16px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: activeActionFilter === action ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeActionFilter === action ? 'var(--accent)' : 'transparent',
                color: activeActionFilter === action ? 'var(--accent-text)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {prettifyAction(action)} ({counts[action] || 0})
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--border-faint)', margin: '0 4px', alignSelf: 'stretch' }} aria-hidden="true" />
          {timingFilters.map(filter => (
            <button
              key={filter}
              type="button"
              aria-pressed={activeTimingFilter === filter}
              onClick={() => onTimingFilterChange(filter)}
              style={{
                borderRadius: 999,
                padding: '6px 16px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: activeTimingFilter === filter ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeTimingFilter === filter ? 'var(--accent)' : 'transparent',
                color: activeTimingFilter === filter ? 'var(--accent-text)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {prettifyTimingFilter(filter)} ({timingCounts[filter] || 0})
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div style={{ overflowX: 'auto', borderRadius: 18, border: '1px solid var(--border-faint)', background: 'var(--surface-raised)' }}>
          <table className="w-full border-collapse" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                {['Contacto', 'Empresa', 'Estado', 'Seguimiento', 'Lectura operativa', 'Ejecutar'].map(col => (
                  <th
                    key={col}
                    scope="col"
                    style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '12px 18px', textAlign: 'left', borderBottom: '1px solid var(--border-faint)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.length ? (
                contacts.map(contact => {
                  const action = String(contact.next_action || '').toLowerCase();
                  const sk = String(contact.status || '').toLowerCase();
                  const ss = STATUS_STYLE[sk] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
                  const isSelected = selectedContactId === contact.id;
                  const followUpDue = isFollowUpDue(contact.follow_up_date);

                  return (
                    <tr
                      key={contact.id}
                      onClick={() => onSelectContact(contact.id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-faint)',
                        background: isSelected ? 'var(--blue-subtle)' : 'transparent',
                        transition: 'background 0.12s ease',
                      }}
                      aria-selected={isSelected}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gap: 3 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{contact.name || 'Sin nombre'}</strong>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{contact.email || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gap: 3 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{contact.company || '—'}</strong>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{prettifyAction(action)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ ...ss, display: 'inline-flex', borderRadius: 8, padding: '3px 10px', fontSize: '0.82rem', fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {contact.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <span style={{ display: 'inline-flex', borderRadius: 999, padding: '3px 10px', fontSize: '0.83rem', fontWeight: 600, background: followUpDue ? 'var(--red-bg)' : 'var(--surface-subtle)', color: followUpDue ? 'var(--red-text)' : 'var(--text-secondary)' }}>
                            {formatFollowUpLabel(contact.follow_up_date)}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              type="date"
                              onClick={e => e.stopPropagation()}
                              style={{ flex: 1, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)', padding: '5px 8px', fontSize: '0.83rem' }}
                              value={editingFollowUp[contact.id] ?? contact.follow_up_date ?? ''}
                              onChange={event => onFollowUpChange(current => ({ ...current, [contact.id]: event.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); onSaveFollowUp(contact); }}
                              disabled={executingId === contact.id}
                              className="ghost-button"
                              style={{ padding: '5px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <span style={{ display: 'inline-flex', width: 'fit-content', borderRadius: 999, padding: '3px 10px', fontSize: '0.83rem', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontWeight: 600, border: '1px solid var(--border-faint)' }}>
                            {prettifyAction(action)}
                          </span>
                          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4, maxWidth: 260 }}>
                            {contact.suggested_message || 'Sin sugerencia disponible.'}
                          </p>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <button
                          type="button"
                          className="primary-button"
                          style={{ whiteSpace: 'nowrap', fontSize: '0.87rem', padding: '8px 14px' }}
                          onClick={e => { e.stopPropagation(); onExecuteAction(contact, action); }}
                          disabled={executingId === contact.id}
                          aria-label={`Ejecutar ${prettifyAction(action)} para ${contact.name || 'contacto'}`}
                        >
                          {executingId === contact.id ? 'Ejecutando…' : prettifyAction(action)}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '0.9rem' }}>
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
