import { useState } from 'react';
import { EmailJobsView } from './EmailJobsView';
import { TemplatesView } from './TemplatesView';
import { SchedulesView } from './SchedulesView';

const TABS = [
  { id: 'cola', label: 'Cola de envíos' },
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'cronogramas', label: 'Cronogramas' },
];

export function EnviosView({
  contacts,
  templates,
  emailJobs,
  cvFiles,
  gmailStatus,
  schedules,
  onRefresh,
}) {
  const [activeTab, setActiveTab] = useState('cola');

  return (
    <div className="flex flex-col gap-5">

      {/* Gmail status chip — siempre visible arriba */}
      <div className="flex items-center gap-3">
        <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border ${
          gmailStatus.authorized
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            gmailStatus.authorized ? 'bg-green-500' : 'bg-amber-400'
          }`} />
          Gmail: {gmailStatus.authorized ? 'Conectado y listo para enviar' : 'Sin autorizar — ir a Cola para conectar'}
        </div>
        {gmailStatus.authorized && (
          <span className="text-xs text-[#597189]">
            El scheduler revisa la cola cada 10 minutos · Lunes a Sábado
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#f4f8fc] rounded-[18px] p-1.5 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-[12px] px-5 py-2 text-sm font-semibold transition-all cursor-pointer border-0 ${
              activeTab === tab.id
                ? 'bg-white text-[#184e77] shadow-sm'
                : 'text-[#597189] bg-transparent hover:text-[#142433]'
            }`}
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
