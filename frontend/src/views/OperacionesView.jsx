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
        <div className="flex gap-1 bg-[#f4f8fc] rounded-[16px] p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveView(v.id)}
              title={v.note}
              className={`flex items-center gap-2 rounded-[12px] px-5 py-2 text-sm font-semibold transition-all cursor-pointer border-0 ${
                activeView === v.id
                  ? 'bg-white text-[#184e77] shadow-sm'
                  : 'text-[#597189] bg-transparent hover:text-[#142433]'
              }`}
            >
              <span>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        {/* Resumen rápido */}
        <div className="flex gap-2 ml-auto flex-wrap">
          {reporting.queue.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold">
              ● {reporting.queue.overdue} vencido{reporting.queue.overdue !== 1 ? 's' : ''}
            </span>
          )}
          {reporting.queue.due_today > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-semibold">
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
