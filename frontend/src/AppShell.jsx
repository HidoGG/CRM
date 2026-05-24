import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './components/views/Dashboard';
import { TrendsView } from './components/views/TrendsView';
import { Worktray } from './components/views/Worktray';
import { PipelineView } from './views/PipelineView';
import { ContactsView } from './views/ContactsView';
import { ImportsView } from './views/ImportsView';
import { TemplatesView } from './views/TemplatesView';
import { EmailJobsView } from './views/EmailJobsView';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

const defaultForm = {
  email: '',
  name: '',
  company: '',
  title: '',
  status: 'mantener',
  next_action: 'enviar',
  source: 'manual',
  notes: '',
};

export const worktrayActions = ['enviar', 'seguir', 'portal', 'descartar'];
export const timingFilters = ['todos', 'vencido', 'hoy', 'esta_semana'];

function AppShell() {
  const [activeView, setActiveView] = useState('dashboard');
  const [contacts, setContacts] = useState([]);
  const [imports, setImports] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [executingId, setExecutingId] = useState(null);
  const [editingFollowUp, setEditingFollowUp] = useState({});
  const [actionDetails, setActionDetails] = useState({});
  const [selectedWorktrayId, setSelectedWorktrayId] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [capabilities, setCapabilities] = useState({
    tesseract_available: false,
    tesseract_path: null,
    openai_enabled: false,
    providers: [],
  });
  const [summary, setSummary] = useState({
    total_contacts: 0,
    total_companies: 0,
    priority_contacts: 0,
    review_contacts: 0,
    imports_count: 0,
    draft_imports: 0,
    confirmed_imports: 0,
  });
  const [reporting, setReporting] = useState(createEmptyReporting());
  const [statusMessage, setStatusMessage] = useState('Conectando con la API local...');
  const [activeFilter, setActiveFilter] = useState('todos');
  const [activeActionFilter, setActiveActionFilter] = useState('enviar');
  const [activeTimingFilter, setActiveTimingFilter] = useState('todos');
  const [activePipelineActionFilter, setActivePipelineActionFilter] = useState('todos');
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [cvFiles, setCvFiles] = useState([]);
  const [emailJobs, setEmailJobs] = useState([]);
  const [gmailStatus, setGmailStatus] = useState({ authorized: false });

  const pageTitle = useMemo(() => {
    if (activeView === 'tendencias') return 'Tendencias operativas';
    if (activeView === 'pipeline') return 'Pipeline operativo';
    if (activeView === 'contactos') return 'Contactos';
    if (activeView === 'importaciones') return 'Importaciones';
    if (activeView === 'bandeja') return 'Bandeja de trabajo';
    if (activeView === 'plantillas') return 'Plantillas de mensaje';
    if (activeView === 'envios') return 'Envíos automáticos';
    return 'Dashboard';
  }, [activeView]);

  useEffect(() => {
    void refreshData();
  }, []);

  const filteredContacts = useMemo(
    () =>
      contacts.filter((contact) => {
        if (activeFilter === 'todos') return true;
        return String(contact.status || '').toLowerCase() === activeFilter;
      }),
    [activeFilter, contacts],
  );

  const worktrayCounts = useMemo(
    () =>
      worktrayActions.reduce((accumulator, action) => {
        accumulator[action] = contacts.filter(
          (contact) => String(contact.next_action || '').toLowerCase() === action,
        ).length;
        return accumulator;
      }, {}),
    [contacts],
  );

  const actionScopedContacts = useMemo(
    () => contacts.filter((contact) => String(contact.next_action || '').toLowerCase() === activeActionFilter),
    [activeActionFilter, contacts],
  );

  const timingCounts = useMemo(
    () =>
      timingFilters.reduce((accumulator, filter) => {
        accumulator[filter] = actionScopedContacts.filter((contact) =>
          matchesTimingFilter(contact.follow_up_date, filter),
        ).length;
        return accumulator;
      }, {}),
    [actionScopedContacts],
  );

  const actionableContacts = useMemo(
    () =>
      actionScopedContacts
        .filter((contact) => matchesTimingFilter(contact.follow_up_date, activeTimingFilter))
        .sort((left, right) => {
          const leftFollowUp = left.follow_up_date
            ? new Date(`${left.follow_up_date}T00:00:00`).getTime()
            : Number.MAX_SAFE_INTEGER;
          const rightFollowUp = right.follow_up_date
            ? new Date(`${right.follow_up_date}T00:00:00`).getTime()
            : Number.MAX_SAFE_INTEGER;
          const leftPriority = String(left.status || '').toLowerCase() === 'prioridad' ? 1 : 0;
          const rightPriority = String(right.status || '').toLowerCase() === 'prioridad' ? 1 : 0;
          return leftFollowUp - rightFollowUp || rightPriority - leftPriority || right.id - left.id;
        }),
    [actionScopedContacts, activeTimingFilter],
  );

  useEffect(() => {
    if (!actionableContacts.length) {
      setSelectedWorktrayId(null);
      setSelectedHistory([]);
      return;
    }
    const stillVisible = actionableContacts.some((contact) => contact.id === selectedWorktrayId);
    if (!stillVisible) {
      setSelectedWorktrayId(actionableContacts[0].id);
    }
  }, [actionableContacts, selectedWorktrayId]);

  useEffect(() => {
    if (!selectedWorktrayId) {
      setSelectedHistory([]);
      return;
    }
    void loadContactHistory(selectedWorktrayId);
  }, [selectedWorktrayId]);

  async function refreshData() {
    try {
      const [healthRes, contactsRes, summaryRes, importsRes, capabilitiesRes, reportingRes,
             templatesRes, cvFilesRes, emailJobsRes, gmailStatusRes] = await Promise.all([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/contacts`),
        fetch(`${API_BASE}/summary`),
        fetch(`${API_BASE}/imports`),
        fetch(`${API_BASE}/capabilities`),
        fetch(`${API_BASE}/reporting/overview`),
        fetch(`${API_BASE}/templates`),
        fetch(`${API_BASE}/cv-files`),
        fetch(`${API_BASE}/email-jobs`),
        fetch(`${API_BASE}/gmail/status`),
      ]);

      if (!healthRes.ok) throw new Error('No se pudo conectar con la API');

      const contactsData = contactsRes.ok ? await contactsRes.json() : [];
      const summaryData = summaryRes.ok ? await summaryRes.json() : summary;
      const importsData = importsRes.ok ? await importsRes.json() : [];
      const capabilitiesData = capabilitiesRes.ok ? await capabilitiesRes.json() : capabilities;
      const reportingData = reportingRes.ok ? await reportingRes.json() : createEmptyReporting();
      const templatesData = templatesRes.ok ? await templatesRes.json() : [];
      const cvFilesData = cvFilesRes.ok ? await cvFilesRes.json() : [];
      const emailJobsData = emailJobsRes.ok ? await emailJobsRes.json() : [];
      const gmailStatusData = gmailStatusRes.ok ? await gmailStatusRes.json() : { authorized: false };

      setContacts(contactsData);
      setSummary(summaryData);
      setImports(importsData);
      setCapabilities(capabilitiesData);
      setReporting(reportingData);
      setTemplates(templatesData);
      setCvFiles(cvFilesData);
      setEmailJobs(emailJobsData);
      setGmailStatus(gmailStatusData);
      setStatusMessage('API conectada. Ya podes cargar, confirmar y operar desde la bandeja.');
    } catch {
      setStatusMessage('No pude conectar con la API local. Primero hay que levantar el backend.');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo guardar el contacto');
      }
      setForm(defaultForm);
      setStatusMessage('Contacto guardado correctamente.');
      await refreshData();
      setActiveView('contactos');
    } catch (error) {
      setStatusMessage(error.message || 'Error al guardar el contacto.');
    } finally {
      setSaving(false);
    }
  }

  async function createMockImport() {
    try {
      const payload = {
        filename: `importacion_manual_${new Date().toISOString().slice(0, 10)}.csv`,
        source: 'ui',
        total_contacts: contacts.length,
        notes: 'Corrida de prueba creada desde el panel local.',
      };
      const response = await fetch(`${API_BASE}/imports/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('No se pudo registrar la importacion');
      setStatusMessage('Importacion mock registrada en historial.');
      await refreshData();
      setActiveView('importaciones');
    } catch (error) {
      setStatusMessage(error.message || 'Error al registrar la importacion.');
    }
  }

  async function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'upload_ui');
      const response = await fetch(`${API_BASE}/imports/preview`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo generar la vista previa');
      }
      const preview = await response.json();
      setImportPreview(preview);
      setStatusMessage('Archivo analizado. Revisa, confirma y luego opera desde la bandeja.');
      setActiveView('importaciones');
      await refreshData();
    } catch (error) {
      setStatusMessage(error.message || 'No se pudo procesar el archivo.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  function updateCandidate(candidateId, field, value) {
    setImportPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.id === candidateId ? { ...candidate, [field]: value } : candidate,
        ),
      };
    });
  }

  async function confirmPreview({ templateId, cvFileId } = {}) {
    if (!importPreview?.batch?.id) return;
    setConfirming(true);
    try {
      const response = await fetch(`${API_BASE}/imports/${importPreview.batch.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: importPreview.candidates,
          ...(templateId != null && { template_id: templateId }),
          ...(cvFileId != null && { cv_file_id: cvFileId }),
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo confirmar la importacion');
      }
      const result = await response.json();
      setStatusMessage(
        `Importacion confirmada. Se guardaron ${result.confirmed_contacts} contactos y ya quedaron listos para la bandeja.`,
      );
      setImportPreview(null);
      setSelectedFile(null);
      await refreshData();
      setActiveView('bandeja');
    } catch (error) {
      setStatusMessage(error.message || 'Error al confirmar la importacion.');
    } finally {
      setConfirming(false);
    }
  }

  async function executeContactAction(contact, action) {
    setExecutingId(contact.id);
    try {
      const details = actionDetails[contact.id] || {};
      const response = await fetch(`${API_BASE}/contacts/${contact.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          portal_url: details.portal_url,
          portal_status: details.portal_status,
          discard_reason: details.discard_reason,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo ejecutar la accion');
      }
      const result = await response.json();
      if (result.draft?.mailto_url) {
        const openedWindow = window.open(result.draft.mailto_url, '_blank', 'noopener,noreferrer');
        if (!openedWindow) {
          window.location.href = result.draft.mailto_url;
        }
      }
      setStatusMessage(result.message || `Accion ${prettifyAction(action)} ejecutada.`);
      await refreshData();
    } catch (error) {
      setStatusMessage(error.message || 'Error al ejecutar la accion.');
    } finally {
      setExecutingId(null);
    }
  }

  async function saveFollowUpDate(contact) {
    const follow_up_date = editingFollowUp[contact.id] ?? contact.follow_up_date ?? '';
    setExecutingId(contact.id);
    try {
      const response = await fetch(`${API_BASE}/contacts/${contact.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follow_up_date }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo guardar la fecha');
      }
      setStatusMessage(`Seguimiento actualizado para ${formatFollowUpLabel(follow_up_date)}.`);
      setEditingFollowUp((current) => ({ ...current, [contact.id]: follow_up_date }));
      await refreshData();
    } catch (error) {
      setStatusMessage(error.message || 'Error al guardar la fecha de seguimiento.');
    } finally {
      setExecutingId(null);
    }
  }

  async function loadContactHistory(contactId) {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${API_BASE}/contacts/${contactId}/history`);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo cargar el historial');
      }
      const history = await response.json();
      setSelectedHistory(history);
    } catch (error) {
      setSelectedHistory([]);
      setStatusMessage(error.message || 'Error al cargar historial del contacto.');
    } finally {
      setLoadingHistory(false);
    }
  }

  function openInWorktray(contact) {
    const nextAction = String(contact.next_action || '').toLowerCase();
    if (!worktrayActions.includes(nextAction)) return;
    setActiveActionFilter(nextAction);
    setActiveTimingFilter('todos');
    setSelectedWorktrayId(contact.id);
    setActiveView('bandeja');
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] min-h-screen">

      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-semibold text-gray-800 text-center">Analizando archivo…</p>
            <p className="text-sm text-gray-500 text-center">
              Estamos procesando el documento con inteligencia artificial.<br />
              Esto puede tardar unos minutos, no cierres la ventana.
            </p>
          </div>
        </div>
      )}

      <Sidebar activeView={activeView} setActiveView={setActiveView} statusMessage={statusMessage} />

      <main className="p-6 flex flex-col gap-6">
        <Topbar
          pageTitle={pageTitle}
          refreshData={refreshData}
          createMockImport={createMockImport}
          importing={importing}
          handleFileSelection={handleFileSelection}
          setActiveView={setActiveView}
        />

        {activeView === 'dashboard' && (
          <Dashboard
            summary={summary}
            imports={imports}
            contacts={contacts}
            worktrayCounts={worktrayCounts}
            reporting={reporting}
            onOpenInWorktray={openInWorktray}
          />
        )}

        {activeView === 'bandeja' && (
          <Worktray
            contacts={actionableContacts}
            activeActionFilter={activeActionFilter}
            onActionFilterChange={setActiveActionFilter}
            activeTimingFilter={activeTimingFilter}
            onTimingFilterChange={setActiveTimingFilter}
            counts={worktrayCounts}
            timingCounts={timingCounts}
            reporting={reporting}
            executingId={executingId}
            onExecuteAction={executeContactAction}
            editingFollowUp={editingFollowUp}
            onFollowUpChange={setEditingFollowUp}
            onSaveFollowUp={saveFollowUpDate}
            actionDetails={actionDetails}
            onActionDetailsChange={setActionDetails}
            selectedContactId={selectedWorktrayId}
            onSelectContact={setSelectedWorktrayId}
            selectedContact={actionableContacts.find((contact) => contact.id === selectedWorktrayId) || null}
            historyItems={selectedHistory}
            loadingHistory={loadingHistory}
          />
        )}

        {activeView === 'pipeline' && (
          <PipelineView
            contacts={contacts}
            reporting={reporting}
            activeActionFilter={activePipelineActionFilter}
            onActionFilterChange={setActivePipelineActionFilter}
            actionDetails={actionDetails}
            onActionDetailsChange={setActionDetails}
            executingId={executingId}
            onExecuteAction={executeContactAction}
            onOpenInWorktray={openInWorktray}
          />
        )}

        {activeView === 'tendencias' && <TrendsView reporting={reporting} />}

        {activeView === 'contactos' && (
          <ContactsView
            contacts={filteredContacts}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            form={form}
            onFormChange={setForm}
            onSubmit={handleSubmit}
            onReset={() => setForm(defaultForm)}
            saving={saving}
            onDelete={async (id) => {
              await fetch(`${API_BASE}/contacts/${id}`, { method: 'DELETE' });
              await refreshData();
            }}
          />
        )}

        {activeView === 'importaciones' && (
          <ImportsView
            imports={imports}
            importPreview={importPreview}
            selectedFile={selectedFile}
            importing={importing}
            confirming={confirming}
            capabilities={capabilities}
            templates={templates}
            cvFiles={cvFiles}
            onFileChange={handleFileSelection}
            onCandidateChange={updateCandidate}
            onConfirm={confirmPreview}
            onClearPreview={() => {
              setImportPreview(null);
              setSelectedFile(null);
            }}
          />
        )}

        {activeView === 'plantillas' && (
          <TemplatesView
            templates={templates}
            onRefresh={refreshData}
          />
        )}

        {activeView === 'envios' && (
          <EmailJobsView
            contacts={contacts}
            templates={templates}
            emailJobs={emailJobs}
            cvFiles={cvFiles}
            gmailStatus={gmailStatus}
            onRefresh={refreshData}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported utilities (usadas por Dashboard, Worktray, TrendsView, vistas)
// ---------------------------------------------------------------------------

export function createEmptyReporting() {
  return {
    generated_at: null,
    queue: { overdue: 0, due_today: 0, due_this_week: 0, without_date: 0, active_total: 0 },
    outcomes: {
      portal: { aplicado: 0, pendiente: 0, revisar: 0, total: 0 },
      discard: { total: 0, reasons: [] },
    },
    pipeline: { by_status: [], by_action: [] },
    activity: {
      last_24h: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      last_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      previous_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      deltas_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
    },
    stock_comparison: {
      previous_snapshot_date: null,
      current: { total_contacts: 0, active_total: 0, overdue_count: 0, without_date_count: 0 },
      deltas: { total_contacts: 0, active_total: 0, overdue_count: 0, without_date_count: 0 },
    },
    recent_snapshots: [],
  };
}

export function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export function prettifyAction(value) {
  if (value === 'revisar_manual') return 'Revisar manual';
  return capitalize(value);
}

export function prettifyTimingFilter(value) {
  if (value === 'esta_semana') return 'Esta semana';
  return capitalize(value);
}

export function formatDelta(value) {
  if (!value) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

export function getDeltaClassName(value) {
  if (value > 0) return 'is-positive';
  if (value < 0) return 'is-negative';
  return 'is-neutral';
}

export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR');
}

export function formatFollowUpLabel(value) {
  if (!value) return 'Sin fecha';
  const dateValue = new Date(`${value}T00:00:00`);
  return `Seguimiento ${dateValue.toLocaleDateString('es-AR')}`;
}

export function isFollowUpDue(value) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  return dueDate.getTime() <= today.getTime();
}

export function buildSparklinePoints(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return null;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  return numericValues
    .map((value, index) => {
      const x = (index / (numericValues.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');
}

export function buildMultiSparklineSeries(snapshots) {
  const series = {
    contacts: snapshots.map((s) => s.total_contacts).reverse(),
    active: snapshots.map((s) => s.active_total).reverse(),
    overdue: snapshots.map((s) => s.overdue_count).reverse(),
    withoutDate: snapshots.map((s) => s.without_date_count).reverse(),
  };
  const entries = Object.entries(series).map(([key, values]) => [key, buildSparklinePointsForDomain(values, 64)]);
  const validEntries = entries.filter(([, points]) => Boolean(points));
  if (!validEntries.length) return null;
  return Object.fromEntries(validEntries);
}

function buildSparklinePointsForDomain(values, height) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return null;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  return numericValues
    .map((value, index) => {
      const x = (index / (numericValues.length - 1)) * 100;
      const y = height - 8 - ((value - min) / range) * (height - 16);
      return `${x},${y}`;
    })
    .join(' ');
}

export function getRelativeBarWidth(value, reference) {
  const base = Math.max(value, reference, 1);
  return (value / base) * 100;
}

export function buildTodayInbox(contacts) {
  const actionable = contacts.filter((contact) =>
    worktrayActions.includes(String(contact.next_action || '').toLowerCase()),
  );
  const overdue = [];
  const today = [];
  const withoutDate = [];

  actionable.forEach((contact) => {
    const followUpDate = contact.follow_up_date ? new Date(`${contact.follow_up_date}T00:00:00`) : null;
    const timing = getFollowUpTimingBucket(followUpDate);
    if (timing === 'overdue') overdue.push(contact);
    if (timing === 'today') today.push(contact);
    if (timing === 'without_date') withoutDate.push(contact);
  });

  return {
    overdue: overdue.slice(0, 5),
    today: today.slice(0, 5),
    withoutDate: withoutDate.slice(0, 5),
    total: overdue.length + today.length + withoutDate.length,
  };
}

function getFollowUpTimingBucket(followUpDate) {
  if (!followUpDate || Number.isNaN(followUpDate.getTime())) return 'without_date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (followUpDate.getTime() < today.getTime()) return 'overdue';
  if (followUpDate.getTime() === today.getTime()) return 'today';
  return 'future';
}

export function prettifyEvent(value) {
  const text = String(value || '').replaceAll('.', ' ');
  return capitalize(text);
}

function matchesTimingFilter(value, filter) {
  if (filter === 'todos') return true;
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  if (filter === 'vencido') return diffDays < 0;
  if (filter === 'hoy') return diffDays === 0;
  if (filter === 'esta_semana') return diffDays >= 0 && diffDays <= 6;
  return true;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

export default AppShell;
