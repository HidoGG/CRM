import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { capitalize, formatFollowUpLabel, isFollowUpDue, prettifyAction, worktrayActions } from '../lib/utils';

const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];
const STATUS_ORDER  = ['prioridad', 'mantener', 'revisar', 'seguimiento', 'portal', 'sacar'];

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
  onUpdateContact,
  mode = 'kanban',
}) {
  /* ── Optimistic status overrides ─────────────────────────────────────────── */
  const [statusOverrides, setStatusOverrides] = useState({});
  const [dragError,       setDragError]       = useState('');
  const [activeCard,      setActiveCard]      = useState(null);

  /* ── dnd-kit sensors ─────────────────────────────────────────────────────── */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8 px of movement before drag starts — clicks on buttons still fire.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  /* ── Merge overrides into contacts list ──────────────────────────────────── */
  const effectiveContacts = contacts.map(c => ({
    ...c,
    status: statusOverrides[c.id] ?? c.status,
  }));

  /* ── Filtered + sorted contacts ──────────────────────────────────────────── */
  const visibleContacts = effectiveContacts
    .filter(c =>
      activeActionFilter === 'todos'
        ? true
        : String(c.next_action || '').toLowerCase() === activeActionFilter,
    )
    .sort((l, r) => {
      const lDate = l.follow_up_date
        ? new Date(`${l.follow_up_date}T00:00:00`).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rDate = r.follow_up_date
        ? new Date(`${r.follow_up_date}T00:00:00`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return lDate - rDate || r.id - l.id;
    });

  const columns      = STATUS_ORDER.map(status => ({
    status,
    items: visibleContacts.filter(c => String(c.status || '').toLowerCase() === status),
  }));
  const weeklyBuckets = buildWeeklyFollowUpBuckets(visibleContacts);

  /* ── Drag handlers ───────────────────────────────────────────────────────── */
  function handleDragStart(event) {
    const contact = effectiveContacts.find(c => c.id === event.active.id);
    setActiveCard(contact ?? null);
    setDragError('');
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over || !active) return;

    const contactId = active.id;
    const newStatus = over.id;                                  // column.status value
    const contact   = contacts.find(c => c.id === contactId);
    const oldStatus = statusOverrides[contactId] ?? contact?.status;
    if (!contact || oldStatus === newStatus) return;

    // 1. Optimistic update
    setStatusOverrides(prev => ({ ...prev, [contactId]: newStatus }));

    // 2. API call
    try {
      await onUpdateContact(contactId, { status: newStatus });
      // Success — clear override; query refresh will provide canonical data.
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    } catch (e) {
      // Rollback
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
      setDragError(e.message || 'No se pudo mover el contacto.');
    }
  }

  function handleDragCancel() {
    setActiveCard(null);
  }

  /* ── Render ───────────────────────────────────────────────────────────────── */
  return (
    <section className="page">
      {/* ── Hero ── */}
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
            <div><strong>{reporting.queue.active_total}</strong><span>En cola activa</span></div>
            <div><strong>{reporting.queue.overdue}</strong><span>Vencidos</span></div>
            <div><strong>{reporting.outcomes.portal.total}</strong><span>Portales</span></div>
            <div><strong>{reporting.outcomes.discard.total}</strong><span>Descartes</span></div>
          </div>
        </article>
      </section>

      {/* ── Filtros + error de drag ── */}
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Pipeline por estado</h2>
            <p>Filtra por siguiente accion. En Kanban, arrastrá tarjetas entre columnas para cambiar el estado.</p>
          </div>
          <span className="pill pill-soft">{visibleContacts.length} contactos visibles</span>
        </div>
        {dragError && (
          <p style={{ margin: '0 0 12px', color: 'var(--red-text)', fontSize: '0.87rem', fontWeight: 500 }}>
            {dragError}
          </p>
        )}
        <div className="filters">
          {['todos', ...actionOptions].map(action => (
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

      {/* ── Agenda ── */}
      {mode === 'agenda' && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Agenda semanal</h2>
              <p>Lectura por fecha de seguimiento.</p>
            </div>
            <span className="pill pill-soft">{weeklyBuckets.totalScheduled} con fecha</span>
          </div>
          <div className="weekly-board">
            {weeklyBuckets.buckets.map(bucket => (
              <article key={bucket.key} className={`weekly-column ${bucket.isToday ? 'is-today' : ''}`}>
                <div className="weekly-column-head">
                  <strong>{bucket.label}</strong>
                  <span>{bucket.items.length} contactos</span>
                </div>
                <div className="weekly-card-list">
                  {bucket.items.length ? (
                    bucket.items.map(contact => (
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
                  weeklyBuckets.withoutDate.slice(0, 6).map(contact => (
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

      {/* ── Kanban con DnD ── */}
      {mode === 'kanban' && (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <section className="pipeline-board">
            {columns.map(column => (
              <KanbanColumn key={column.status} column={column}>
                {column.items.length ? (
                  column.items.map(contact => (
                    <KanbanCard
                      key={contact.id}
                      contact={contact}
                      actionDetails={actionDetails}
                      onActionDetailsChange={onActionDetailsChange}
                      executingId={executingId}
                      onExecuteAction={onExecuteAction}
                      onOpenInWorktray={onOpenInWorktray}
                    />
                  ))
                ) : (
                  <div className="pipeline-empty">Sin contactos en este estado para el filtro actual.</div>
                )}
              </KanbanColumn>
            ))}
          </section>

          {/* Ghost card shown while dragging */}
          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <article
                className="pipeline-contact-card"
                style={{ opacity: 0.9, boxShadow: '0 8px 32px rgba(0,0,0,0.28)', cursor: 'grabbing' }}
              >
                <div className="pipeline-contact-head">
                  <strong>{activeCard.name || 'Sin nombre'}</strong>
                  <span>{activeCard.company || 'Sin empresa'}</span>
                </div>
                <div className="pipeline-contact-meta">
                  <span className="provider-pill">{prettifyAction(activeCard.next_action || 'revisar_manual')}</span>
                </div>
              </article>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}

/* ── KanbanColumn ──────────────────────────────────────────────────────────── */

function KanbanColumn({ column, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.status });

  return (
    <article
      ref={setNodeRef}
      className={`pipeline-column${isOver ? ' pipeline-column--over' : ''}`}
      aria-label={`Columna ${column.status}`}
    >
      <div className="pipeline-column-head">
        <div>
          <span className={`status-badge status-${column.status}`}>{capitalize(column.status)}</span>
          <strong>{column.items.length}</strong>
        </div>
        <span>{pipelineColumnNote(column.status)}</span>
      </div>
      <div className="pipeline-card-list">
        {children}
      </div>
    </article>
  );
}

/* ── KanbanCard ──────────────────────────────────────────────────────────── */

function KanbanCard({ contact, actionDetails, onActionDetailsChange, executingId, onExecuteAction, onOpenInWorktray }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
    data: { contact },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`pipeline-contact-card${isDragging ? ' pipeline-contact-card--dragging' : ''}`}
      {...attributes}
    >
      {/* Drag handle — only this area activates the drag */}
      <div
        {...listeners}
        className="kanban-drag-handle"
        title="Arrastrá para cambiar el estado"
        aria-label="Mover tarjeta"
      >
        ⠿
      </div>

      <div className="pipeline-contact-head">
        <strong>{contact.name || 'Sin nombre'}</strong>
        <span>{contact.company || 'Sin empresa'}</span>
      </div>

      <div className="pipeline-contact-meta">
        <span className="provider-pill">{prettifyAction(contact.next_action || 'revisar_manual')}</span>
        <span className={`provider-pill ${isFollowUpDue(contact.follow_up_date) ? 'is-due' : ''}`}>
          {formatFollowUpLabel(contact.follow_up_date, contact.next_job_scheduled_at)}
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
            {executingId === contact.id ? 'Ejecutando...' : prettifyAction(String(contact.next_action || '').toLowerCase())}
          </button>
        )}

        {String(contact.next_action || '').toLowerCase() === 'portal' && (
          <div className="pipeline-inline-form">
            <input
              type="url"
              placeholder="Link del portal"
              value={actionDetails[contact.id]?.portal_url ?? contact.portal_url ?? ''}
              onChange={e =>
                onActionDetailsChange(curr => ({
                  ...curr,
                  [contact.id]: { ...curr[contact.id], portal_url: e.target.value },
                }))
              }
            />
            <select
              value={actionDetails[contact.id]?.portal_status ?? contact.portal_status ?? 'pendiente'}
              onChange={e =>
                onActionDetailsChange(curr => ({
                  ...curr,
                  [contact.id]: { ...curr[contact.id], portal_status: e.target.value },
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
              onChange={e =>
                onActionDetailsChange(curr => ({
                  ...curr,
                  [contact.id]: { ...curr[contact.id], discard_reason: e.target.value },
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
        !['enviar', 'seguir', 'portal', 'descartar'].includes(String(contact.next_action || '').toLowerCase()) ? (
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
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function pipelineColumnNote(status) {
  if (status === 'prioridad')   return 'Empujar primero';
  if (status === 'mantener')    return 'Base estable';
  if (status === 'revisar')     return 'Pide criterio';
  if (status === 'seguimiento') return 'Recontacto activo';
  if (status === 'portal')      return 'Fuera de cola';
  if (status === 'sacar')       return 'Ya descartado';
  return 'Operacion';
}

function buildWeeklyFollowUpBuckets(contacts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      key: d.toISOString().slice(0, 10),
      label: formatWeeklyBucketLabel(d, i === 0),
      isToday: i === 0,
      items: [],
    };
  });
  const bucketMap = Object.fromEntries(buckets.map(b => [b.key, b]));
  const withoutDate = [];

  contacts.forEach(c => {
    if (!c.follow_up_date) { withoutDate.push(c); return; }
    const key = String(c.follow_up_date);
    if (bucketMap[key]) { bucketMap[key].items.push(c); return; }
    const d = new Date(`${key}T00:00:00`);
    if (d.getTime() < today.getTime()) { buckets[0].items.push(c); return; }
    withoutDate.push(c);
  });

  return {
    buckets,
    withoutDate,
    totalScheduled: contacts.filter(c => Boolean(c.follow_up_date)).length,
  };
}

function formatWeeklyBucketLabel(date, isToday) {
  const weekday   = date.toLocaleDateString('es-AR', { weekday: 'short' });
  const shortDate = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return isToday
    ? `Hoy · ${shortDate}`
    : `${capitalize(weekday.replace('.', ''))} · ${shortDate}`;
}
