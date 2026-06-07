import { useState } from 'react';
import { Worktray } from '../components/views/Worktray';
import { PipelineView } from './PipelineView';

const VIEWS = [
  { id: 'tabla',  label: 'Tabla',   icon: '☰', note: 'Lista ejecutable con historial' },
  { id: 'kanban', label: 'Kanban',  icon: '⊞', note: 'Columnas por estado'            },
  { id: 'agenda', label: 'Agenda',  icon: '📅', note: 'Vista semanal por fecha'         },
];

export function OperacionesView({
  // Props para Tabla (Worktray)
  actionableContacts,
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
  // Props para Kanban / Agenda (PipelineView)
  contacts,
  activePipelineActionFilter,
  onPipelineActionFilterChange,
  onOpenInWorktray,
}) {
  const [activeView, setActiveView] = useState('tabla');

  return (
    <div className="flex flex-col gap-5">

      {/* View switcher */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          style={{ display: 'flex', gap: 4, background: 'var(--surface-subtle)', borderRadius: 14, padding: 6, border: '1px solid var(--border-faint)' }}
          role="tablist"
          aria-label="Modo de vista"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={activeView === v.id}
              onClick={() => setActiveView(v.id)}
              title={v.note}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 10,
                padding: '7px 18px',
                fontSize: '0.87rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: activeView === v.id ? '1px solid var(--border)' : '1px solid transparent',
                background: activeView === v.id ? 'var(--surface-raised)' : 'transparent',
                color: activeView === v.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: activeView === v.id ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span aria-hidden="true">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        {/* Resumen rápido */}
        <div className="flex gap-2 ml-auto flex-wrap">
          {reporting.queue.overdue > 0 && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: '0.8rem', fontWeight: 700 }}
              aria-label={`${reporting.queue.overdue} contacto${reporting.queue.overdue !== 1 ? 's' : ''} vencido${reporting.queue.overdue !== 1 ? 's' : ''}`}
            >
              ● {reporting.queue.overdue} vencido{reporting.queue.overdue !== 1 ? 's' : ''}
            </span>
          )}
          {reporting.queue.due_today > 0 && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', background: 'var(--amber-bg)', color: 'var(--amber-text)', fontSize: '0.8rem', fontWeight: 700 }}
              aria-label={`${reporting.queue.due_today} contacto${reporting.queue.due_today !== 1 ? 's' : ''} para hoy`}
            >
              ● {reporting.queue.due_today} para hoy
            </span>
          )}
        </div>
      </div>

      {/* Contenido según vista activa */}
      {activeView === 'tabla' && (
        <Worktray
          compact
          contacts={actionableContacts}
          activeActionFilter={activeActionFilter}
          onActionFilterChange={onActionFilterChange}
          activeTimingFilter={activeTimingFilter}
          onTimingFilterChange={onTimingFilterChange}
          counts={counts}
          timingCounts={timingCounts}
          reporting={reporting}
          executingId={executingId}
          onExecuteAction={onExecuteAction}
          editingFollowUp={editingFollowUp}
          onFollowUpChange={onFollowUpChange}
          onSaveFollowUp={onSaveFollowUp}
          actionDetails={actionDetails}
          onActionDetailsChange={onActionDetailsChange}
          selectedContactId={selectedContactId}
          onSelectContact={onSelectContact}
          selectedContact={selectedContact}
          historyItems={historyItems}
          loadingHistory={loadingHistory}
        />
      )}

      {(activeView === 'kanban' || activeView === 'agenda') && (
        <PipelineView
          mode={activeView}
          contacts={contacts}
          reporting={reporting}
          activeActionFilter={activePipelineActionFilter}
          onActionFilterChange={onPipelineActionFilterChange}
          actionDetails={actionDetails}
          onActionDetailsChange={onActionDetailsChange}
          executingId={executingId}
          onExecuteAction={onExecuteAction}
          onOpenInWorktray={onOpenInWorktray}
        />
      )}
    </div>
  );
}
