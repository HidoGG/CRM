import { Worktray } from '../components/views/Worktray';

const STATUS_LABEL = {
  prioridad:   'Prioridad',
  mantener:    'Mantener',
  revisar:     'Revisar',
  seguimiento: 'Seguimiento',
  portal:      'Portal',
  sacar:       'Sacar',
};

export function OperacionesView({
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
  selectedContactId,
  onSelectContact,
  selectedContact,
  historyItems,
  loadingHistory,
  statusDistribution,
  cycleStartedAt,
}) {
  const total = statusDistribution.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Distribución del pipeline (reemplaza Kanban) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '11px 16px',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-faint)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 6, flexShrink: 0 }}>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            Pipeline
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500 }}>
            {total} contactos
          </span>
        </div>

        <div
          aria-hidden="true"
          style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-faint)', flexShrink: 0 }}
        />

        {statusDistribution.map(({ status, count }) => (
          <span
            key={status}
            className={`status-badge status-${status}`}
            style={{ gap: 7, cursor: 'default' }}
          >
            {STATUS_LABEL[status]}
            <strong style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{count}</strong>
          </span>
        ))}
      </div>

      {/* ── Bandeja operativa ── */}
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
        cycleStartedAt={cycleStartedAt}
        selectedContactId={selectedContactId}
        onSelectContact={onSelectContact}
        selectedContact={selectedContact}
        historyItems={historyItems}
        loadingHistory={loadingHistory}
      />
    </div>
  );
}
