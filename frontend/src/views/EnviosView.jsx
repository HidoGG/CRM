import { useState } from 'react';
import { EmailJobsView } from './EmailJobsView';
import { TemplatesView } from './TemplatesView';
import { SchedulesView } from './SchedulesView';

const TABS = [
  { id: 'cola',       label: 'Cola de envíos' },
  { id: 'plantillas', label: 'Plantillas'      },
  { id: 'cronogramas',label: 'Cronogramas'     },
];

export function EnviosView({ contacts, templates, emailJobs, cvFiles, gmailStatus, schedules, onRefresh }) {
  const [activeTab, setActiveTab] = useState('cola');

  return (
    <div className="flex flex-col gap-5">
      {/* Gmail status chip — visible en todos los tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            padding: '6px 16px',
            fontSize: '0.87rem',
            fontWeight: 600,
            border: `1px solid ${gmailStatus.authorized ? 'var(--green-text)' : 'var(--amber-text)'}`,
            background: gmailStatus.authorized ? 'var(--green-bg)' : 'var(--amber-bg)',
            color: gmailStatus.authorized ? 'var(--green-text)' : 'var(--amber-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: gmailStatus.authorized ? 'var(--green-text)' : 'var(--amber-text)',
            }}
            aria-hidden="true"
          />
          Gmail: {gmailStatus.authorized ? 'Conectado · listo para enviar' : 'Sin autorizar — abrí "Cola" para conectar'}
        </div>
        {gmailStatus.authorized && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Scheduler cada 10 min · Lun–Sáb
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--surface-subtle)',
          borderRadius: 14,
          padding: 6,
          width: 'fit-content',
          border: '1px solid var(--border-faint)',
        }}
        role="tablist"
        aria-label="Secciones de envíos"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              borderRadius: 10,
              padding: '7px 18px',
              fontSize: '0.87rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === tab.id ? '1px solid var(--border)' : '1px solid transparent',
              background: activeTab === tab.id ? 'var(--surface-raised)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de cada tab */}
      {activeTab === 'cola' && (
        <EmailJobsView
          contacts={contacts}
          templates={templates}
          emailJobs={emailJobs}
          cvFiles={cvFiles}
          gmailStatus={gmailStatus}
          onRefresh={onRefresh}
        />
      )}
      {activeTab === 'plantillas' && (
        <TemplatesView templates={templates} onRefresh={onRefresh} />
      )}
      {activeTab === 'cronogramas' && (
        <SchedulesView schedules={schedules} onRefresh={onRefresh} />
      )}
    </div>
  );
}
