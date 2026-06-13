import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { HoyView } from './views/HoyView';
import { EstadisticasView } from './views/EstadisticasView';
import { OperacionesView } from './views/OperacionesView';
import { ContactsView } from './views/ContactsView';
import { ImportsView } from './views/ImportsView';
import { EnviosView } from './views/EnviosView';
import { LoginView } from './views/LoginView';
import { API_BASE, apiFetch, setAccessToken } from './lib/api';
import { authEnabled, supabase } from './lib/supabaseClient';
import {
  useCapabilities,
  useContacts,
  useCvFiles,
  useEmailJobs,
  useGmailStatus,
  useImports,
  useRefresh,
  useReporting,
  useSchedules,
  useSummary,
  useTemplates,
} from './lib/queries';
import { matchesTimingFilter, prettifyAction, timingFilters, worktrayActions } from './lib/utils';

const defaultForm = {
  email: '',
  name: '',
  company: '',
  title: '',
  status: 'mantener',
  next_action: 'enviar',
  source: 'manual',
  notes: '',
  schedule_id: null,
};

// Rutas reales (URL navegable, botón atrás del navegador funciona)
const VIEW_ROUTES = {
  dashboard: '/',
  operaciones: '/operaciones',
  bandeja: '/operaciones',
  pipeline: '/operaciones',
  contactos: '/contactos',
  importaciones: '/importaciones',
  envios: '/envios',
  plantillas: '/envios',
  cronogramas: '/envios',
  estadisticas: '/estadisticas',
  tendencias: '/estadisticas',
};

const PATH_TITLES = {
  '/': 'Hoy',
  '/operaciones': 'Operaciones',
  '/contactos': 'Contactos',
  '/importaciones': 'Importaciones',
  '/envios': 'Envíos',
  '/estadisticas': 'Estadísticas',
};

function pathToViewId(pathname) {
  if (pathname.startsWith('/operaciones')) return 'operaciones';
  if (pathname.startsWith('/contactos')) return 'contactos';
  if (pathname.startsWith('/importaciones')) return 'importaciones';
  if (pathname.startsWith('/envios')) return 'envios';
  if (pathname.startsWith('/estadisticas')) return 'estadisticas';
  return 'dashboard';
}

function AppShell() {
  // ── Sesión Supabase (opcional) ──
  const [session, setSession] = useState(undefined); // undefined = cargando

  useEffect(() => {
    if (!authEnabled) {
      setSession(null);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token);
      setSession(data.session ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setAccessToken(newSession?.access_token);
      setSession(newSession ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authEnabled && session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
        Cargando sesión…
      </div>
    );
  }
  if (authEnabled && !session) {
    return <LoginView />;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = useRefresh();

  const activeView = pathToViewId(location.pathname);
  const setActiveView = (viewId) => navigate(VIEW_ROUTES[viewId] || '/');
  const pageTitle = PATH_TITLES[location.pathname] || 'Hoy';

  // ── Datos (TanStack Query) ──
  const contactsQuery = useContacts();
  const contacts = contactsQuery.data || [];
  const summary = useSummary().data;
  const reporting = useReporting().data;
  const imports = useImports().data || [];
  const capabilities = useCapabilities().data;
  const templates = useTemplates().data || [];
  const cvFiles = useCvFiles().data || [];
  const schedules = useSchedules().data || [];
  const emailJobs = useEmailJobs().data || [];
  const gmailStatus = useGmailStatus().data;

  // ── Estado de UI ──
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
  const [statusMessage, setStatusMessage] = useState('Conectando con la API...');
  const [activeFilter, setActiveFilter] = useState('todos');
  const [activeActionFilter, setActiveActionFilter] = useState('enviar');
  const [activeTimingFilter, setActiveTimingFilter] = useState('todos');
  const [activePipelineActionFilter, setActivePipelineActionFilter] = useState('todos');
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contactsQuery.isError) {
      setStatusMessage('No pude conectar con la API. Verificá que el backend esté levantado.');
    } else if (contactsQuery.isSuccess) {
      setStatusMessage('API conectada. Ya podés cargar, confirmar y operar desde la bandeja.');
    }
  }, [contactsQuery.isError, contactsQuery.isSuccess]);

  // ── Derivados ──
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

  // ── Acciones ──
  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch(`${API_BASE}/contacts`, {
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
      await refresh('contacts');
      navigate('/contactos');
    } catch (error) {
      setStatusMessage(error.message || 'Error al guardar el contacto.');
    } finally {
      setSaving(false);
    }
  }

  async function updateContact(contactId, fields) {
    const response = await apiFetch(`${API_BASE}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.detail || 'No se pudo actualizar el contacto');
    }
    setStatusMessage('Contacto actualizado.');
    await refresh('contacts');
    return response.json();
  }

  async function deleteContact(contactId) {
    const response = await apiFetch(`${API_BASE}/contacts/${contactId}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      setStatusMessage(errorBody.detail || 'No se pudo eliminar el contacto.');
      return;
    }
    const result = await response.json().catch(() => ({}));
    setStatusMessage(
      result.cancelled_jobs > 0
        ? `Contacto eliminado. Se cancelaron ${result.cancelled_jobs} envío(s) programado(s).`
        : 'Contacto eliminado.',
    );
    await refresh('contacts');
    await refresh('jobs');
  }

  async function createMockImport() {
    try {
      const payload = {
        filename: `importacion_manual_${new Date().toISOString().slice(0, 10)}.csv`,
        source: 'ui',
        total_contacts: contacts.length,
        notes: 'Corrida de prueba creada desde el panel local.',
      };
      const response = await apiFetch(`${API_BASE}/imports/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('No se pudo registrar la importacion');
      setStatusMessage('Importacion mock registrada en historial.');
      await refresh();
      navigate('/importaciones');
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
      const response = await apiFetch(`${API_BASE}/imports/preview`, {
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
      navigate('/importaciones');
      await refresh();
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

  async function confirmPreview({ templateId, cvFileId, scheduleId } = {}) {
    if (!importPreview?.batch?.id) return;
    setConfirming(true);
    try {
      const response = await apiFetch(`${API_BASE}/imports/${importPreview.batch.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: importPreview.candidates,
          ...(templateId != null && { template_id: templateId }),
          ...(cvFileId != null && { cv_file_id: cvFileId }),
          ...(scheduleId != null && { schedule_id: scheduleId }),
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
      await refresh();
      navigate('/operaciones');
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
      const response = await apiFetch(`${API_BASE}/contacts/${contact.id}/execute`, {
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
      await refresh('contacts');
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
      const response = await apiFetch(`${API_BASE}/contacts/${contact.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follow_up_date }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'No se pudo guardar la fecha');
      }
      setStatusMessage('Fecha de seguimiento actualizada.');
      setEditingFollowUp((current) => ({ ...current, [contact.id]: follow_up_date }));
      await refresh('contacts');
    } catch (error) {
      setStatusMessage(error.message || 'Error al guardar la fecha de seguimiento.');
    } finally {
      setExecutingId(null);
    }
  }

  async function loadContactHistory(contactId) {
    setLoadingHistory(true);
    try {
      const response = await apiFetch(`${API_BASE}/contacts/${contactId}/history`);
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
    navigate('/operaciones');
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] min-h-screen">

      {importing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0 0 0 / 0.75)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Procesando archivo"
        >
          <div
            className="rounded-2xl px-10 py-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4"
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div
              className="w-11 h-11 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)' }}
              aria-hidden="true"
            />
            <p className="text-base font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
              Analizando archivo…
            </p>
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              Procesando con IA. Esto puede tardar unos minutos.<br />
              No cierres la ventana.
            </p>
          </div>
        </div>
      )}

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        statusMessage={statusMessage}
        overdueCount={reporting.queue.overdue}
      />

      <main className="p-6 flex flex-col gap-6">
        <Topbar
          pageTitle={pageTitle}
          refreshData={() => refresh()}
          createMockImport={createMockImport}
          importing={importing}
          handleFileSelection={handleFileSelection}
          setActiveView={setActiveView}
        />

        <Routes>
          <Route
            path="/"
            element={
              <HoyView
                summary={summary}
                contacts={contacts}
                reporting={reporting}
                imports={imports}
                emailJobs={emailJobs}
                onOpenInWorktray={openInWorktray}
              />
            }
          />
          <Route
            path="/operaciones"
            element={
              <OperacionesView
                actionableContacts={actionableContacts}
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
                contacts={contacts}
                activePipelineActionFilter={activePipelineActionFilter}
                onPipelineActionFilterChange={setActivePipelineActionFilter}
                onOpenInWorktray={openInWorktray}
                onUpdateContact={updateContact}
              />
            }
          />
          <Route
            path="/estadisticas"
            element={
              <EstadisticasView
                reporting={reporting}
                imports={imports}
                emailJobs={emailJobs}
                contacts={contacts}
              />
            }
          />
          <Route
            path="/contactos"
            element={
              <ContactsView
                contacts={filteredContacts}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                form={form}
                onFormChange={setForm}
                onSubmit={handleSubmit}
                onReset={() => setForm(defaultForm)}
                saving={saving}
                schedules={schedules}
                onDelete={deleteContact}
                onUpdate={updateContact}
              />
            }
          />
          <Route
            path="/importaciones"
            element={
              <ImportsView
                imports={imports}
                importPreview={importPreview}
                selectedFile={selectedFile}
                importing={importing}
                confirming={confirming}
                capabilities={capabilities}
                templates={templates}
                cvFiles={cvFiles}
                schedules={schedules}
                onFileChange={handleFileSelection}
                onCandidateChange={updateCandidate}
                onConfirm={confirmPreview}
                onClearPreview={() => {
                  setImportPreview(null);
                  setSelectedFile(null);
                }}
              />
            }
          />
          <Route
            path="/envios"
            element={
              <EnviosView
                contacts={contacts}
                templates={templates}
                emailJobs={emailJobs}
                cvFiles={cvFiles}
                gmailStatus={gmailStatus}
                schedules={schedules}
                onRefresh={refresh}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default AppShell;
