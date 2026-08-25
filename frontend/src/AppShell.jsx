import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { NewContactModal } from './components/ContactForm';
import { HoyView } from './views/HoyView';
import { OperacionesView } from './views/OperacionesView';
import { ContactsView } from './views/ContactsView';
import { ImportsView } from './views/ImportsView';
import { EnviosView } from './views/EnviosView';
import { CareerView } from './views/CareerView';
import { LoginView } from './views/LoginView';
import { API_BASE, apiFetch, setAccessToken } from './lib/api';
import { authEnabled, supabase } from './lib/supabaseClient';
import {
  useContacts,
  useEmailJobs,
  useGmailStatus,
  useImports,
  useRefresh,
  useReporting,
  useSummary,
  useCycleInfo,
} from './lib/queries';
import { defaultTabFilter, getTabFilters, matchesTabFilter, prettifyAction, worktrayActions } from './lib/utils';

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
  industry: null,
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
  asistente: '/asistente',
};

const PATH_TITLES = {
  '/': 'Hoy',
  '/operaciones': 'Operaciones',
  '/contactos': 'Contactos',
  '/importaciones': 'Importaciones',
  '/envios': 'Configuración',
  '/asistente': 'Asistente IA',
};

function pathToViewId(pathname) {
  if (pathname.startsWith('/operaciones')) return 'operaciones';
  if (pathname.startsWith('/contactos')) return 'contactos';
  if (pathname.startsWith('/importaciones')) return 'importaciones';
  if (pathname.startsWith('/envios')) return 'envios';
  if (pathname.startsWith('/asistente')) return 'asistente';
  return 'dashboard';
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('crm-theme') || 'dark');
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.classList.toggle('light', theme === 'light');
    localStorage.setItem('crm-theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

function AppShell() {
  // ── Sesión Supabase (opcional) ──
  const [session, setSession] = useState(undefined); // undefined = cargando
  // Los hooks siempre antes de cualquier return condicional (regla de React)
  const { theme, toggle: toggleTheme } = useTheme();

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
  return <AuthenticatedApp theme={theme} toggleTheme={toggleTheme} />;
}

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

function AuthenticatedApp({ theme, toggleTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = useRefresh();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Alerta de re-autorización de Gmail ──
  const gmailStatusQuery = useGmailStatus();
  const gmailStatus = gmailStatusQuery.data;
  const [gmailReauthDismissed, setGmailReauthDismissed] = useState(
    () => sessionStorage.getItem('gmail-reauth-dismissed') === '1'
  );
  // Antes solo se disparaba con needs_reauth (caso puntual: rotación de
  // CRM_API_KEY). El caso mas frecuente es que el token se venza o Google lo
  // revoque solo (las apps en modo "Prueba" duran 7 días) y ahí
  // needs_reauth queda en false — authorized:false ya cubre ambos casos.
  // isPlaceholderData evita un falso positivo: el placeholder de
  // useGmailStatus arranca con authorized:false hasta que responde el
  // backend, y no queremos mostrar el modal en ese instante inicial.
  const showGmailReauth =
    !gmailReauthDismissed &&
    !gmailStatusQuery.isPlaceholderData &&
    gmailStatus?.authorized === false;
  function dismissGmailReauth() {
    sessionStorage.setItem('gmail-reauth-dismissed', '1');
    setGmailReauthDismissed(true);
  }

  const activeView = pathToViewId(location.pathname);
  const setActiveView = (viewId) => navigate(VIEW_ROUTES[viewId] || '/');
  const pageTitle = PATH_TITLES[location.pathname] || 'Hoy';

  // Cerrar sidebar al cambiar de ruta en mobile
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // ── Datos críticos (cargados al inicio) ──
  const contactsQuery = useContacts();
  const contacts = contactsQuery.data || [];
  const summary = useSummary().data;
  const reporting = useReporting().data;
  const imports = useImports().data || [];
  const emailJobs = useEmailJobs().data || [];
  const cycleInfo = useCycleInfo().data;
  const cycleStartedAt = cycleInfo?.cycle_started_at ?? null;

  // ── Auto-sync de Gmail al abrir el CRM (una sola vez por carga de la app) ──
  const didAutoSyncRef = useRef(false);
  useEffect(() => {
    if (didAutoSyncRef.current) return;
    didAutoSyncRef.current = true;
    apiFetch(`${API_BASE}/engagement/sync`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok && ((data.replies_found ?? 0) > 0 || (data.bounces_found ?? 0) > 0)) {
          refresh('jobs');
          refresh('contacts');
        }
      })
      .catch(() => {}); // silencioso: no es una acción disparada por el usuario, no hay feedback visual que dar
  }, []);

  // ── Cold start: si el backend tarda más de 7s, avisamos al usuario ──
  const [slowBackend, setSlowBackend] = useState(false);
  useEffect(() => {
    if (!contactsQuery.isLoading) { setSlowBackend(false); return; }
    const t = setTimeout(() => setSlowBackend(true), 7000);
    return () => clearTimeout(t);
  }, [contactsQuery.isLoading]);

  // ── Estado de UI ──
  const [importPreview, setImportPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [executingId, setExecutingId] = useState(null);
  const [editingFollowUp, setEditingFollowUp] = useState({});
  const [selectedWorktrayId, setSelectedWorktrayId] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Conectando con la API...');
  const [activeFilter, setActiveFilter] = useState('todos');
  const [activeActionFilter, setActiveActionFilter] = useState('enviar');
  const [activeTimingFilter, setActiveTimingFilter] = useState('hoy');
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);

  useEffect(() => {
    if (contactsQuery.isError) {
      setStatusMessage('No pude conectar con la API. Verificá que el backend esté levantado.');
    } else if (contactsQuery.isSuccess) {
      setStatusMessage('API conectada. Ya podés cargar, confirmar y operar desde la bandeja.');
    } else if (slowBackend) {
      setStatusMessage('El servidor está despertando… puede tardar hasta 60 segundos la primera vez.');
    }
  }, [contactsQuery.isError, contactsQuery.isSuccess, slowBackend]);

  // Errores de acciones: traducir los de red y no dejarlos pegados en el
  // sidebar — a los 12 segundos vuelve el estado general de la conexión.
  const statusTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(statusTimerRef.current), []);
  function reportError(error, fallback) {
    const raw = error?.message || '';
    const isNetwork = raw === 'Failed to fetch' || raw.includes('NetworkError') || raw.includes('Load failed');
    setStatusMessage(
      isNetwork
        ? 'Sin conexión con el servidor (puede estar despertando). Esperá unos segundos y reintentá.'
        : (raw || fallback),
    );
    clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(
        contactsQuery.isError
          ? 'No pude conectar con la API. Verificá que el backend esté levantado.'
          : 'API conectada. Ya podés cargar, confirmar y operar desde la bandeja.',
      );
    }, 12000);
  }

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

  const timingCounts = useMemo(() => {
    const filters = getTabFilters(activeActionFilter);
    return filters.reduce((acc, filter) => {
      acc[filter] = actionScopedContacts.filter((c) =>
        matchesTabFilter(c, activeActionFilter, filter, { cycleStartedAt }),
      ).length;
      return acc;
    }, {});
  }, [actionScopedContacts, activeActionFilter, cycleStartedAt]);

  const statusDistribution = useMemo(() => {
    const ORDER = ['prioridad', 'mantener', 'revisar', 'seguimiento', 'portal', 'sacar'];
    return ORDER.map(status => ({
      status,
      count: contacts.filter(c => String(c.status || '').toLowerCase() === status).length,
    }));
  }, [contacts]);

  const actionableContacts = useMemo(
    () =>
      actionScopedContacts
        .filter((contact) => matchesTabFilter(contact, activeActionFilter, activeTimingFilter, { cycleStartedAt }))
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
    [actionScopedContacts, activeActionFilter, activeTimingFilter, cycleStartedAt],
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
  // Devuelve { ok, error } para que el modal muestre el resultado en pantalla
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
      return { ok: true };
    } catch (error) {
      const isNetwork = error?.message === 'Failed to fetch';
      const message = isNetwork
        ? 'Sin conexión con el servidor (puede estar despertando). Esperá unos segundos y reintentá.'
        : (error?.message || 'Error al guardar el contacto.');
      reportError(error, 'Error al guardar el contacto.');
      return { ok: false, error: message };
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
      reportError(new Error(errorBody.detail || ''), 'No se pudo eliminar el contacto.');
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
      reportError(error, 'Error al registrar la importación.');
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
      reportError(error, 'No se pudo procesar el archivo.');
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
      reportError(error, 'Error al confirmar la importación.');
    } finally {
      setConfirming(false);
    }
  }

  async function executeContactAction(contact, action) {
    if (executingId != null) return; // evita doble-click → doble ejecución
    setExecutingId(contact.id);
    try {
      const response = await apiFetch(`${API_BASE}/contacts/${contact.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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
      reportError(error, 'Error al ejecutar la acción.');
    } finally {
      setExecutingId(null);
    }
  }

  async function saveFollowUpDate(contact) {
    if (executingId != null) return; // evita doble-click → doble ejecución
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
      reportError(error, 'Error al guardar la fecha de seguimiento.');
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
      reportError(error, 'Error al cargar historial del contacto.');
    } finally {
      setLoadingHistory(false);
    }
  }

  function openInWorktray(contact) {
    const nextAction = String(contact.next_action || '').toLowerCase();
    if (!worktrayActions.includes(nextAction)) return;
    setActiveActionFilter(nextAction);
    setActiveTimingFilter(defaultTabFilter(nextAction));
    setSelectedWorktrayId(contact.id);
    navigate('/operaciones');
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[167px_minmax(0,1fr)]">

      {/* ── Overlay mobile: cierra el drawer al tocar fuera ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

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

      {/* ── Modal: Gmail no está autorizado (token vencido/revocado o rotación de CRM_API_KEY) ── */}
      {showGmailReauth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Gmail necesita re-autorización"
        >
          <div
            className="rounded-2xl px-8 py-7 flex flex-col gap-5 max-w-sm w-full mx-4"
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--amber-text)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="flex items-start gap-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Gmail necesita re-autorización
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {gmailStatus?.reason || 'Tu sesión de Gmail venció. Los envíos automáticos y la detección de respuestas están pausados hasta que vuelvas a conectar tu cuenta.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={dismissGmailReauth}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 500,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => { setActiveView('envios'); dismissGmailReauth(); }}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                  background: 'var(--amber-bg)', border: '1px solid var(--amber-text)',
                  color: 'var(--amber-text)', cursor: 'pointer',
                }}
              >
                Ir a Configuración y re-autorizar
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        statusMessage={statusMessage}
        overdueCount={reporting.queue.overdue}
        unseenRepliesCount={contacts.filter((c) => c.replied_at && !c.reply_seen_at).length}
        theme={theme}
        toggleTheme={toggleTheme}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex flex-col gap-4 p-4 pt-[60px] md:p-6 md:gap-6">

        {/* ── Header mobile: hamburguesa + título de página ── */}
        <header
          className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4"
          style={{
            height: 56,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border-faint)',
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: 'transparent', border: 'none',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            <HamburgerIcon />
          </button>
          <div className="brand-mark" aria-hidden="true" style={{ flexShrink: 0 }}>C</div>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pageTitle}
          </span>
        </header>

        <Topbar
          pageTitle={pageTitle}
          refreshData={() => refresh()}
          createMockImport={createMockImport}
          importing={importing}
          handleFileSelection={handleFileSelection}
          onNewContact={() => setShowNewContact(true)}
        />

        {showNewContact && (
          <NewContactModal
            form={form}
            onFormChange={setForm}
            saving={saving}
            onClose={() => setShowNewContact(false)}
            onSubmit={handleSubmit}
          />
        )}

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
                onRefresh={refresh}
              />
            }
          />
          <Route
            path="/operaciones"
            element={
              <OperacionesView
                actionableContacts={actionableContacts}
                activeActionFilter={activeActionFilter}
                onActionFilterChange={(action) => { setActiveActionFilter(action); setActiveTimingFilter(defaultTabFilter(action)); }}
                activeTimingFilter={activeTimingFilter}
                onTimingFilterChange={setActiveTimingFilter}
                cycleStartedAt={cycleStartedAt}
                counts={worktrayCounts}
                timingCounts={timingCounts}
                reporting={reporting}
                executingId={executingId}
                onExecuteAction={executeContactAction}
                editingFollowUp={editingFollowUp}
                onFollowUpChange={setEditingFollowUp}
                onSaveFollowUp={saveFollowUpDate}
                selectedContactId={selectedWorktrayId}
                onSelectContact={setSelectedWorktrayId}
                selectedContact={actionableContacts.find((contact) => contact.id === selectedWorktrayId) || null}
                historyItems={selectedHistory}
                loadingHistory={loadingHistory}
                statusDistribution={statusDistribution}
              />
            }
          />
          <Route
            path="/contactos"
            element={
              <ContactsView
                contacts={filteredContacts}
                allContacts={contacts}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                form={form}
                onFormChange={setForm}
                onSubmit={handleSubmit}
                onReset={() => setForm(defaultForm)}
                saving={saving}
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
              <EnviosView onRefresh={refresh} />
            }
          />
          <Route path="/asistente" element={<CareerView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default AppShell;
