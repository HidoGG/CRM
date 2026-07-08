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

const BOUNCE_REASON_LABEL = {
  usuario_inexistente: 'Usuario inexistente',
  casilla_llena:       'Casilla llena',
  dominio_invalido:    'Dominio inválido',
  casilla_desactivada: 'Casilla desactivada',
  rechazado_politica:  'Rechazado por spam',
  persona_no_trabaja:  'Persona no trabaja',
  rebote_temporario:   'Rebote temporario',
  direccion_invalida:  'Dirección inválida',
  tamano_excedido:     'Tamaño excedido',
  rebote_email:        'Permanente',
};

const BOUNCE_REASON_DESC = {
  usuario_inexistente: 'El email no existe en el servidor destino. La dirección está mal escrita o fue eliminada.',
  casilla_llena:       'La casilla del destinatario está llena. Puede funcionar si se reintenta más adelante.',
  dominio_invalido:    'El dominio del email no existe. Puede que la empresa haya cerrado o el email sea falso.',
  casilla_desactivada: 'La cuenta fue desactivada o suspendida por el proveedor de email.',
  rechazado_politica:  'El servidor de la empresa rechazó el email por políticas anti-spam. Filtran correos de cuentas personales.',
  persona_no_trabaja:  'El email existe pero el sistema indica que esa persona ya no trabaja en la empresa.',
  rebote_temporario:   'El servidor estaba ocupado o caído al momento del envío. Se puede reintentar.',
  direccion_invalida:  'El formato de la dirección es incorrecto o tiene un error de redirección.',
  tamano_excedido:     'El email fue rechazado por superar el tamaño máximo permitido por el servidor.',
  rebote_email:        'Rebote permanente sin motivo específico identificado.',
};

const AUTOREPLY_REASON_LABEL = {
  ausencia_temporal:    'Fuera de la oficina',
  licencia_medica:      'Licencia médica',
  licencia_maternidad:  'Licencia de maternidad / paternidad',
};

const AUTOREPLY_REASON_DESC = {
  ausencia_temporal:    'La persona está temporalmente fuera (vacaciones, viaje u otra ausencia). Probablemente regrese pronto.',
  licencia_medica:      'La persona se encuentra de licencia por enfermedad o motivos de salud. Contactar más adelante o buscar otro referente.',
  licencia_maternidad:  'La persona está en licencia de maternidad o paternidad. Su reincorporación puede demorar meses.',
};

const STATUS_STYLE = {
  prioridad:   { background: 'var(--red-bg)',      color: 'var(--red-text)'    },
  mantener:    { background: 'var(--green-bg)',    color: 'var(--green-text)'  },
  seguimiento: { background: 'var(--blue-subtle)', color: 'var(--blue)'        },
  revisar:     { background: 'var(--amber-bg)',    color: 'var(--amber-text)'  },
  sacar:       { background: 'var(--gray-bg)',     color: 'var(--gray-text)'   },
  portal:      { background: 'var(--purple-bg)',   color: 'var(--purple-text)' },
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
    <section className="grid gap-4">

      {/* ── 1. Banner de vencidos (prominente, ancho completo) ── */}
      {reporting.queue.overdue > 0 && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'var(--red-bg)',
            border: '1px solid color-mix(in oklch, var(--red-text) 40%, transparent)',
            borderRadius: 10,
            padding: '13px 18px',
          }}
        >
          <span style={{ fontSize: '1.15rem', flexShrink: 0, color: 'var(--red-text)' }} aria-hidden="true">⚠</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--red-text)', fontSize: '0.94rem', display: 'block' }}>
              {reporting.queue.overdue} contacto{reporting.queue.overdue !== 1 ? 's' : ''} con seguimiento vencido
            </strong>
            <p style={{ margin: '2px 0 0', color: 'var(--red-text)', fontSize: '0.83rem', opacity: 0.75 }}>
              Sin fecha activa de seguimiento. Agendá fechas para distribuir el trabajo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTimingFilterChange('vencido')}
            style={{
              flexShrink: 0,
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid var(--red-text)',
              background: 'transparent',
              color: 'var(--red-text)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            Ver vencidos
          </button>
        </div>
      )}

      {/* ── 2. Métricas horizontales (chips clickeables) ── */}
      <div className="worktray-action-chips" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {worktrayActions.map(action => (
          <button
            key={action}
            type="button"
            aria-pressed={activeActionFilter === action}
            onClick={() => onActionFilterChange(action)}
            className={`worktray-metric${activeActionFilter === action ? ' is-active' : ''}`}
            style={{ textAlign: 'left', minWidth: 110 }}
          >
            <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--text-primary)', lineHeight: 1 }}>
              {counts[action] || 0}
            </strong>
            <span style={{
              fontSize: '0.85rem',
              color: activeActionFilter === action ? 'var(--blue)' : 'var(--text-secondary)',
              fontWeight: activeActionFilter === action ? 600 : 400,
              marginTop: 4,
              display: 'block',
            }}>
              {prettifyAction(action)}
            </span>
          </button>
        ))}
      </div>

      {/* ── 3. Stats opcionales (solo modo no-compact) ── */}
      {!compact && (
        <section className="worktray-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          <article className="card">
            <span className="eyebrow mb-3 block">Seguimientos</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Vencidos',    value: reporting.queue.overdue       },
                { label: 'Para hoy',    value: reporting.queue.due_today     },
                { label: 'Esta semana', value: reporting.queue.due_this_week },
                { label: 'Sin fecha',   value: reporting.queue.without_date  },
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

      {/* ── 4. Card principal: tabla + drawer de historial ── */}
      <section className="card" style={{ display: 'grid', gap: 14 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <span className="eyebrow">Contactos pendientes</span>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {prettifyAction(activeActionFilter)}
            </h3>
          </div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
            aria-live="polite"
          >
            {contacts.length} pendientes
          </span>
        </div>

        {/* Filtros de timing */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Filtrar por tiempo">
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

        {/* Tabla + Drawer de historial lado a lado */}
        <div className="worktray-detail-grid" style={{ display: 'grid', gridTemplateColumns: selectedContact ? '1fr 280px' : '1fr', gap: 12, alignItems: 'start' }}>

          {/* Tabla */}
          <div className="worktray-table-wrap">
          <div style={{ borderRadius: 12, border: '1px solid var(--border-faint)', background: 'var(--surface-raised)', overflow: 'clip' }}>
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {selectedContact ? (
                  <>
                    <col style={{ width: '23%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '17%' }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '33%' }} />
                    <col style={{ width: '12%' }} />
                  </>
                )}
              </colgroup>
              <thead>
                <tr>
                  {(selectedContact
                    ? ['Contacto', 'Empresa', 'Estado', 'Seguimiento', 'Ejecutar']
                    : ['Contacto', 'Empresa', 'Estado', 'Seguimiento', 'Lectura operativa', 'Ejecutar']
                  ).map(col => (
                    <th
                      key={col}
                      scope="col"
                      style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-faint)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, whiteSpace: 'nowrap' }}
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
                        <td style={{ padding: '5px 8px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name || 'Sin nombre'}</strong>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.79rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company || '—'}</strong>
                            {contact.discard_reason && (
                              <span style={{ display: 'inline-flex', alignSelf: 'start', borderRadius: 6, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 600, background: 'var(--gray-bg)', color: 'var(--gray-text)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {contact.bounce_reason
                                  ? (BOUNCE_REASON_LABEL[contact.bounce_reason] || 'Rebote')
                                  : (contact.discard_reason === 'rebote_email' ? 'Rebote' : contact.discard_reason)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ ...ss, display: 'inline-flex', borderRadius: 6, padding: '2px 7px', fontSize: '0.76rem', fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {contact.status}
                          </span>
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ display: 'grid', gap: 5 }}>
                            <span style={{ display: 'inline-flex', borderRadius: 999, padding: '2px 8px', fontSize: '0.78rem', fontWeight: 600, background: followUpDue ? 'var(--red-bg)' : 'var(--surface-subtle)', color: followUpDue ? 'var(--red-text)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {formatFollowUpLabel(contact.follow_up_date)}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input
                                type="date"
                                onClick={e => e.stopPropagation()}
                                style={{ flex: 1, minWidth: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)', padding: '3px 5px', fontSize: '0.78rem' }}
                                value={editingFollowUp[contact.id] ?? contact.follow_up_date ?? ''}
                                onChange={event => onFollowUpChange(current => ({ ...current, [contact.id]: event.target.value }))}
                              />
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); onSaveFollowUp(contact); }}
                                disabled={executingId === contact.id}
                                className="ghost-button"
                                style={{ padding: '3px 7px', fontSize: '0.76rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        </td>
                        {!selectedContact && (
                          <td style={{ padding: '5px 8px', overflow: 'hidden' }}>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {contact.suggested_message || 'Sin sugerencia disponible.'}
                            </p>
                          </td>
                        )}
                        <td style={{ padding: '5px 7px' }}>
                          <button
                            type="button"
                            className="primary-button"
                            style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '6px 8px', width: '100%' }}
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
                    <td colSpan="6">
                      {(activeTimingFilter === 'hoy' || activeTimingFilter === 'esta_semana') ? (
                        <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            Sin contactos agendados para {activeTimingFilter === 'hoy' ? 'hoy' : 'esta semana'}
                          </p>
                          <p style={{ margin: '8px 0 18px', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
                            Usá el campo de fecha en cada fila para agendar cuándo hacer seguimiento.
                          </p>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => onTimingFilterChange('todos')}
                          >
                            Ver todos los contactos ({counts[activeActionFilter] || 0})
                          </button>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '0.9rem' }}>
                          No hay contactos pendientes para esta acción.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>

          {/* ── Panel de historial (separado de la tabla) ── */}
          {selectedContact && (
            <aside
              aria-label="Historial del contacto"
              style={{
                borderRadius: 12,
                border: '1px solid var(--border-faint)',
                background: 'var(--surface-subtle)',
                padding: '16px',
                display: 'grid',
                gap: 12,
                alignContent: 'start',
                overflowY: 'auto',
                maxHeight: 600,
              }}
            >
              {/* Info del contacto */}
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.97rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {selectedContact.name || 'Sin nombre'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onSelectContact(null)}
                    aria-label="Cerrar historial"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: 2, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {selectedContact.company || 'Sin empresa'}
                </span>
                {(() => {
                  const sk = String(selectedContact.status || '').toLowerCase();
                  const ss = STATUS_STYLE[sk] || STATUS_STYLE.revisar;
                  return (
                    <span style={{ ...ss, display: 'inline-flex', width: 'fit-content', borderRadius: 8, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                      {selectedContact.status}
                    </span>
                  );
                })()}
              </div>

              {/* Alerta de rebote */}
              {selectedContact.bounced_at && (
                <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-text)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 4 }}>
                  <span style={{ color: 'var(--red-text)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Email rebotado
                  </span>
                  <span style={{ color: 'var(--red-text)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {BOUNCE_REASON_LABEL[selectedContact.bounce_reason] || 'Permanente'}
                  </span>
                  {BOUNCE_REASON_DESC[selectedContact.bounce_reason] && (
                    <span style={{ color: 'var(--red-text)', fontSize: '0.81rem', opacity: 0.85, lineHeight: 1.4 }}>
                      {BOUNCE_REASON_DESC[selectedContact.bounce_reason]}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                    Detectado el {formatDate(selectedContact.bounced_at)}
                  </span>
                </div>
              )}

              {/* Auto-respuesta (ausencia, enfermedad, maternidad) */}
              {selectedContact.autoreply_reason && !selectedContact.bounced_at && (
                <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-text)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 4 }}>
                  <span style={{ color: 'var(--amber-text)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Auto-respuesta recibida
                  </span>
                  <span style={{ color: 'var(--amber-text)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {AUTOREPLY_REASON_LABEL[selectedContact.autoreply_reason] || 'Ausencia temporal'}
                  </span>
                  {AUTOREPLY_REASON_DESC[selectedContact.autoreply_reason] && (
                    <span style={{ color: 'var(--amber-text)', fontSize: '0.81rem', opacity: 0.85, lineHeight: 1.4 }}>
                      {AUTOREPLY_REASON_DESC[selectedContact.autoreply_reason]}
                    </span>
                  )}
                </div>
              )}

              {/* Email alternativo detectado */}
              {selectedContact.alternative_email && (
                <div style={{ background: 'var(--blue-subtle)', border: '1px solid var(--blue)', borderRadius: 8, padding: '10px 12px', display: 'grid', gap: 4 }}>
                  <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Email alternativo detectado
                  </span>
                  <span style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {selectedContact.alternative_email}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    La auto-respuesta indica enviar a esta dirección.
                  </span>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--border-faint)' }} />

              {/* Timeline */}
              <div
                style={{ display: 'grid', gap: 14, position: 'relative', paddingLeft: 16 }}
                role="log"
                aria-label="Historial de actividad"
              >
                <div style={{ position: 'absolute', left: 3, top: 4, bottom: 4, width: 2, background: 'var(--border-faint)' }} aria-hidden="true" />
                {loadingHistory ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Cargando historial…</div>
                ) : historyItems.length ? (
                  historyItems.map(item => (
                    <article key={item.id} style={{ position: 'relative', display: 'grid', gap: 3 }}>
                      <span style={{ position: 'absolute', left: -19, top: 5, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface-raised)' }} aria-hidden="true" />
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>{prettifyEvent(item.event_type)}</strong>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4 }}>{item.message}</p>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{formatDate(item.created_at)}</span>
                    </article>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Sin eventos registrados.</div>
                )}
              </div>
            </aside>
          )}
        </div>
      </section>
    </section>
  );
}
