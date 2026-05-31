import { capitalize, formatFollowUpLabel, isFollowUpDue, prettifyAction, worktrayActions } from '../AppShell';

const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

export function PipelineView({
  contacts,
  reporting,
  activeActionFilter,
  onActionFilterChange,
  actionDetails,
  onActionDetailsChange,
  executingId,
  onExecuteAction,
  onOpenInWorktray,
  mode = 'kanban',
}) {
  const statusOrder = ['prioridad', 'mantener', 'revisar', 'seguimiento', 'portal', 'sacar'];
  const visibleContacts = contacts
    .filter((contact) =>
      activeActionFilter === 'todos'
        ? true
        : String(contact.next_action || '').toLowerCase() === activeActionFilter,
    )
    .sort((left, right) => {
      const leftFollowUp = left.follow_up_date
        ? new Date(`${left.follow_up_date}T00:00:00`).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightFollowUp = right.follow_up_date
        ? new Date(`${right.follow_up_date}T00:00:00`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return leftFollowUp - rightFollowUp || right.id - left.id;
    });

  const columns = statusOrder.map((status) => ({
    status,
    items: visibleContacts.filter((contact) => String(contact.status || '').toLowerCase() === status),
  }));
  const weeklyBuckets = buildWeeklyFollowUpBuckets(visibleContacts);

  return (
    <section className="page">
      <section className="pipeline-hero">
        <article className="hero-panel hero-panel-main">
          <span className="pill">Pipeline</span>
          <h2>Lectura de estados para decidir donde empujar la proxima pasada.</h2>
          <p>
            Esta vista junta volumen, siguiente accion y seguimiento para ver rapido donde se esta
            acumulando trabajo operativo.
          </p>
        </article>

        <article className="hero-panel">
          <span className="pill pill-warm">Resumen</span>
          <div className="mini-kpis">
            <div>
              <strong>{reporting.queue.active_total}</strong>
              <span>En cola activa</span>
            </div>
            <div>
              <strong>{reporting.queue.overdue}</strong>
              <span>Vencidos</span>
            </div>
            <div>
              <strong>{reporting.outcomes.portal.total}</strong>
              <span>Portales</span>
            </div>
            <div>
              <strong>{reporting.outcomes.discard.total}</strong>
              <span>Descartes</span>
            </div>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Pipeline por estado</h2>
            <p>Filtra por siguiente accion para aislar el cuello operativo de la semana.</p>
          </div>
          <span className="pill pill-soft">{visibleContacts.length} contactos visibles</span>
        </div>

        <div className="filters">
          {['todos', ...actionOptions].map((action) => (
            <button
              key={action}
              type="button"
              className={`filter-chip ${activeActionFilter === action ? 'is-active' : ''}`}
              onClick={() => onActionFilterChange(action)}
            >
              {action === 'todos' ? 'Todos' : prettifyAction(action)}
            </button>
          ))}
        </div>
      </section>

      {mode === 'agenda' && (
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Agenda semanal</h2>
            <p>Lectura por fecha de seguimiento para ordenar hoy, esta semana y lo que quedo sin fecha.</p>
          </div>
          <span className="pill pill-soft">{weeklyBuckets.totalScheduled} con fecha</span>
        </div>

        <div className="weekly-board">
          {weeklyBuckets.buckets.map((bucket) => (
            <article key={bucket.key} className={`weekly-column ${bucket.isToday ? 'is-today' : ''}`}>
              <div className="weekly-column-head">
                <strong>{bucket.label}</strong>
                <span>{bucket.items.length} contactos</span>
              </div>

              <div className="weekly-card-list">
                {bucket.items.length ? (
                  bucket.items.map((contact) => (
                    <article key={contact.id} className="weekly-contact-card">
                      <div className="weekly-contact-head">
                        <strong>{contact.name || 'Sin nombre'}</strong>
                        <span>{contact.company || 'Sin empresa'}</span>
                      </div>
                      <span className={`status-badge status-${String(contact.status || '').toLowerCase()}`}>
                        {contact.status}
                      </span>
                      <span className="provider-pill">
                        {prettifyAction(contact.next_action || 'revisar_manual')}
                      </span>
                      {worktrayActions.includes(String(contact.next_action || '').toLowerCase()) ? (
                        <button
                          type="button"
                          className="ghost-button weekly-jump-button"
                          onClick={() => onOpenInWorktray(contact)}
                        >
                          Abrir en bandeja
                        </button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="pipeline-empty">Sin carga para este dia.</div>
                )}
              </div>
            </article>
          ))}

          <article className="weekly-column weekly-column-muted">
            <div className="weekly-column-head">
              <strong>Sin fecha</strong>
              <span>{weeklyBuckets.withoutDate.length} contactos</span>
            </div>

            <div className="weekly-card-list">
              {weeklyBuckets.withoutDate.length ? (
                weeklyBuckets.withoutDate.slice(0, 6).map((contact) => (
                  <article key={contact.id} className="weekly-contact-card">
                    <div className="weekly-contact-head">
                      <strong>{contact.name || 'Sin nombre'}</strong>
                      <span>{contact.company || 'Sin empresa'}</span>
                    </div>
                    <span className="provider-pill">
                      {prettifyAction(contact.next_action || 'revisar_manual')}
                    </span>
                    {worktrayActions.includes(String(contact.next_action || '').toLowerCase()) ? (
                      <button
                        type="button"
                        className="ghost-button weekly-jump-button"
                        onClick={() => onOpenInWorktray(contact)}
                      >
                        Abrir en bandeja
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="pipeline-empty">Todo lo visible ya tiene fecha.</div>
              )}
            </div>
          </article>
        </div>
      </section>
      )}

      {mode === 'kanban' && (
      <section className="pipeline-board">
        {columns.map((column) => (
          <article key={column.status} className="pipeline-column">
            <div className="pipeline-column-head">
              <div>
                <span className={`status-badge status-${column.status}`}>{capitalize(column.status)}</span>
                <strong>{column.items.length}</strong>
              </div>
              <span>{pipelineColumnNote(column.status)}</span>
            </div>

            <div className="pipeline-card-list">
              {column.items.length ? (
                column.items.map((contact) => (
                  <article key={contact.id} className="pipeline-contact-card">
                    <div className="pipeline-contact-head">
                      <strong>{contact.name || 'Sin nombre'}</strong>
                      <span>{contact.company || 'Sin empresa'}</span>
                    </div>

                    <div className="pipeline-contact-meta">
                      <span className="provider-pill">{prettifyAction(contact.next_action || 'revisar_manual')}</span>
                      <span className={`provider-pill ${isFollowUpDue(contact.follow_up_date) ? 'is-due' : ''}`}>
                        {formatFollowUpLabel(contact.follow_up_date)}
                      </span>
                    </div>

                    <p>{contact.suggested_message || 'Sin sugerencia cargada para este contacto.'}</p>

                    {contact.portal_status ? (
                      <span className="pipeline-inline-note">Portal: {capitalize(contact.portal_status)}</span>
                    ) : null}
                    {contact.discard_reason ? (
                      <span className="pipeline-inline-note">Descarte: {capitalize(contact.discard_reason)}</span>
                    ) : null}

                    <div className="pipeline-card-actions">
                      {['enviar', 'seguir'].includes(String(contact.next_action || '').toLowerCase()) && (
                        <button
                          type="button"
                          className="primary-button pipeline-inline-button"
                          onClick={() => onExecuteAction(contact, String(contact.next_action || '').toLowerCase())}
                          disabled={executingId === contact.id}
                        >
                          {executingId === contact.id
                            ? 'Ejecutando...'
                            : prettifyAction(String(contact.next_action || '').toLowerCase())}
                        </button>
                      )}

                      {String(contact.next_action || '').toLowerCase() === 'portal' && (
                        <div className="pipeline-inline-form">
                          <input
                            type="url"
                            placeholder="Link del portal"
                            value={actionDetails[contact.id]?.portal_url ?? contact.portal_url ?? ''}
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: { ...current[contact.id], portal_url: event.target.value },
                              }))
                            }
                          />
                          <select
                            value={actionDetails[contact.id]?.portal_status ?? contact.portal_status ?? 'pendiente'}
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: { ...current[contact.id], portal_status: event.target.value },
                              }))
                            }
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="aplicado">Aplicado</option>
                            <option value="revisar">Revisar</option>
                          </select>
                          <button
                            type="button"
                            className="primary-button pipeline-inline-button"
                            onClick={() => onExecuteAction(contact, 'portal')}
                            disabled={executingId === contact.id}
                          >
                            {executingId === contact.id ? 'Guardando...' : 'Resolver portal'}
                          </button>
                        </div>
                      )}

                      {String(contact.next_action || '').toLowerCase() === 'descartar' && (
                        <div className="pipeline-inline-form">
                          <select
                            value={actionDetails[contact.id]?.discard_reason ?? contact.discard_reason ?? 'sin_respuesta'}
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: { ...current[contact.id], discard_reason: event.target.value },
                              }))
                            }
                          >
                            <option value="sin_respuesta">Sin respuesta</option>
                            <option value="no_encaja">No encaja</option>
                            <option value="duplicado">Duplicado</option>
                            <option value="descartado_manual">Descartado manual</option>
                          </select>
                          <button
                            type="button"
                            className="primary-button pipeline-inline-button"
                            onClick={() => onExecuteAction(contact, 'descartar')}
                            disabled={executingId === contact.id}
                          >
                            {executingId === contact.id ? 'Guardando...' : 'Descartar'}
                          </button>
                        </div>
                      )}

                      {worktrayActions.includes(String(contact.next_action || '').toLowerCase()) &&
                      !['enviar', 'seguir', 'portal', 'descartar'].includes(
                        String(contact.next_action || '').toLowerCase(),
                      ) ? (
                        <button
                          type="button"
                          className="ghost-button pipeline-jump-button"
                          onClick={() => onOpenInWorktray(contact)}
                        >
                          Abrir en bandeja
                        </button>
                      ) : (
                        !worktrayActions.includes(String(contact.next_action || '').toLowerCase()) && (
                          <span className="pipeline-inline-note">Sin accion operativa directa en bandeja.</span>
                        )
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="pipeline-empty">Sin contactos en este estado para el filtro actual.</div>
              )}
            </div>
          </article>
        ))}
      </section>
      )}
    </section>
  );
}

function pipelineColumnNote(status) {
  if (status === 'prioridad') return 'Empujar primero';
  if (status === 'mantener') return 'Base estable';
  if (status === 'revisar') return 'Pide criterio';
  if (status === 'seguimiento') return 'Recontacto activo';
  if (status === 'portal') return 'Fuera de cola';
  if (status === 'sacar') return 'Ya descartado';
  return 'Operacion';
}

function buildWeeklyFollowUpBuckets(contacts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const bucketDate = new Date(today);
    bucketDate.setDate(today.getDate() + index);
    return {
      key: bucketDate.toISOString().slice(0, 10),
      label: formatWeeklyBucketLabel(bucketDate, index === 0),
      isToday: index === 0,
      items: [],
    };
  });

  const bucketMap = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));
  const withoutDate = [];

  contacts.forEach((contact) => {
    if (!contact.follow_up_date) {
      withoutDate.push(contact);
      return;
    }
    const key = String(contact.follow_up_date);
    if (bucketMap[key]) {
      bucketMap[key].items.push(contact);
      return;
    }
    const followUpDate = new Date(`${key}T00:00:00`);
    if (followUpDate.getTime() < today.getTime()) {
      buckets[0].items.push(contact);
      return;
    }
    withoutDate.push(contact);
  });

  return {
    buckets,
    withoutDate,
    totalScheduled: contacts.filter((contact) => Boolean(contact.follow_up_date)).length,
  };
}

function formatWeeklyBucketLabel(dateValue, isToday) {
  const weekday = dateValue.toLocaleDateString('es-AR', { weekday: 'short' });
  const shortDate = dateValue.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return isToday
    ? `Hoy · ${shortDate}`
    : `${capitalize(weekday.replace('.', ''))} · ${shortDate}`;
}
