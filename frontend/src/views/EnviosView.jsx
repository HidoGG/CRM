import { useState } from 'react';
import { EmailJobsView } from './EmailJobsView';
import { TemplatesView } from './TemplatesView';
import { SchedulesView } from './SchedulesView';
import { useCvFiles, useGmailStatus, useSchedules, useTemplateStats, useTemplates } from '../lib/queries';
import { API_BASE, apiFetch } from '../lib/api';

const TABS = [
  { id: 'cola',         label: 'Cola de envíos'   },
  { id: 'plantillas',   label: 'Plantillas'        },
  { id: 'cronogramas',  label: 'Cronogramas'       },
  { id: 'estadisticas', label: 'Stats de respuesta'},
];

export function EnviosView({ contacts, emailJobs, onRefresh }) {
  const [activeTab, setActiveTab] = useState('cola');
  const templates = useTemplates().data || [];
  const cvFiles = useCvFiles().data || [];
  const schedules = useSchedules().data || [];
  const gmailStatus = useGmailStatus().data ?? { authorized: false, has_readonly: false };
  const { data: templateStats } = useTemplateStats();

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
      {activeTab === 'estadisticas' && (
        <TemplateStatsPanel stats={templateStats} onSync={() => apiFetch(`${API_BASE}/engagement/sync`, { method: 'POST' }).then(() => Promise.all([onRefresh('jobs'), onRefresh('contacts')]))} />
      )}
    </div>
  );
}

function TemplateStatsPanel({ stats, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      await onSync();
      setSyncMsg('Sincronización completada.');
    } catch {
      setSyncMsg('Error al sincronizar.');
    } finally {
      setSyncing(false);
    }
  }

  const rows = stats?.by_template ?? [];
  const totals = stats?.totals ?? { sent: 0, replied: 0, response_rate: 0 };

  return (
    <section className="card" aria-labelledby="stats-heading">
      <div className="section-head">
        <div>
          <span className="eyebrow">Engagement</span>
          <h3 id="stats-heading" className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginTop: 4 }}>
            Estadísticas por plantilla
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
            Tasa de respuesta calculada desde threads de Gmail. Total: {totals.sent} enviados · {totals.replied} respuestas · <strong>{totals.response_rate}%</strong>
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button
            type="button"
            className="primary-button"
            onClick={handleSync}
            disabled={syncing}
            aria-label="Sincronizar respuestas y rebotes desde Gmail"
          >
            {syncing ? 'Sincronizando…' : '↺ Sync Gmail'}
          </button>
          {syncMsg && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{syncMsg}</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Sin datos aún — asegurate de haber enviado emails con plantillas y de tener Gmail readonly autorizado.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid var(--border-faint)' }}>
          <table className="w-full border-collapse" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                {['Plantilla', 'Enviados', 'Respuestas', 'Tasa'].map(col => (
                  <th
                    key={col}
                    scope="col"
                    style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-faint)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.template_id} style={{ borderBottom: '1px solid var(--border-faint)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {row.template_name}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{row.sent}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{row.replied}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: row.response_rate >= 20 ? 'var(--green-bg)' : row.response_rate >= 5 ? 'var(--amber-bg)' : 'var(--gray-bg)',
                      color: row.response_rate >= 20 ? 'var(--green-text)' : row.response_rate >= 5 ? 'var(--amber-text)' : 'var(--gray-text)',
                    }}>
                      {row.response_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
