import { useEffect, useMemo, useState } from 'react';

const API_BASE = 'http://127.0.0.1:8000';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', note: 'Resumen general' },
  { id: 'bandeja', label: 'Bandeja', note: 'Accion directa' },
  { id: 'pipeline', label: 'Pipeline', note: 'Estados actuales' },
  { id: 'tendencias', label: 'Tendencias', note: 'Historico y ritmo' },
  { id: 'contactos', label: 'Contactos', note: 'Base y filtros' },
  { id: 'importaciones', label: 'Importaciones', note: 'Trazabilidad' },
];

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

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];
const worktrayActions = ['enviar', 'seguir', 'portal', 'descartar'];
const timingFilters = ['todos', 'vencido', 'hoy', 'esta_semana'];

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

  const pageTitle = useMemo(() => {
    if (activeView === 'tendencias') return 'Tendencias operativas';
    if (activeView === 'pipeline') return 'Pipeline operativo';
    if (activeView === 'contactos') return 'Contactos';
    if (activeView === 'importaciones') return 'Importaciones';
    if (activeView === 'bandeja') return 'Bandeja de trabajo';
    return 'Dashboard';
  }, [activeView]);

  useEffect(() => {
    void refreshData();
  }, []);

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (activeFilter === 'todos') return true;
      return String(contact.status || '').toLowerCase() === activeFilter;
    });
  }, [activeFilter, contacts]);

  const worktrayCounts = useMemo(() => {
    return worktrayActions.reduce((accumulator, action) => {
      accumulator[action] = contacts.filter(
        (contact) => String(contact.next_action || '').toLowerCase() === action,
      ).length;
      return accumulator;
    }, {});
  }, [contacts]);

  const actionScopedContacts = useMemo(() => {
    return contacts.filter((contact) => String(contact.next_action || '').toLowerCase() === activeActionFilter);
  }, [activeActionFilter, contacts]);

  const timingCounts = useMemo(() => {
    return timingFilters.reduce((accumulator, filter) => {
      accumulator[filter] = actionScopedContacts.filter((contact) =>
        matchesTimingFilter(contact.follow_up_date, filter),
      ).length;
      return accumulator;
    }, {});
  }, [actionScopedContacts]);

  const actionableContacts = useMemo(() => {
    return actionScopedContacts
      .filter((contact) => matchesTimingFilter(contact.follow_up_date, activeTimingFilter))
      .sort((left, right) => {
        const leftFollowUp = left.follow_up_date ? new Date(`${left.follow_up_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const rightFollowUp = right.follow_up_date ? new Date(`${right.follow_up_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const leftPriority = String(left.status || '').toLowerCase() === 'prioridad' ? 1 : 0;
        const rightPriority = String(right.status || '').toLowerCase() === 'prioridad' ? 1 : 0;
        return leftFollowUp - rightFollowUp || rightPriority - leftPriority || right.id - left.id;
      });
  }, [actionScopedContacts, activeTimingFilter]);

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
      const [healthRes, contactsRes, summaryRes, importsRes, capabilitiesRes, reportingRes] = await Promise.all([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/contacts`),
        fetch(`${API_BASE}/summary`),
        fetch(`${API_BASE}/imports`),
        fetch(`${API_BASE}/capabilities`),
        fetch(`${API_BASE}/reporting/overview`),
      ]);

      if (!healthRes.ok) throw new Error('No se pudo conectar con la API');

      const contactsData = contactsRes.ok ? await contactsRes.json() : [];
      const summaryData = summaryRes.ok ? await summaryRes.json() : summary;
      const importsData = importsRes.ok ? await importsRes.json() : [];
      const capabilitiesData = capabilitiesRes.ok ? await capabilitiesRes.json() : capabilities;
      const reportingData = reportingRes.ok ? await reportingRes.json() : createEmptyReporting();

      setContacts(contactsData);
      setSummary(summaryData);
      setImports(importsData);
      setCapabilities(capabilitiesData);
      setReporting(reportingData);
      setStatusMessage('API conectada. Ya podes cargar, confirmar y operar desde la bandeja.');
    } catch (error) {
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
      const content_base64 = await fileToBase64(file);
      const response = await fetch(`${API_BASE}/imports/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          content_base64,
          source: 'upload_ui',
        }),
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
          candidate.id === candidateId ? { ...candidate, [field]: value } : candidate
        ),
      };
    });
  }

  async function confirmPreview() {
    if (!importPreview?.batch?.id) return;
    setConfirming(true);
    try {
      const response = await fetch(`${API_BASE}/imports/${importPreview.batch.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: importPreview.candidates }),
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CRM IA Local</strong>
            <p>Operacion laboral con revision humana</p>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeView === item.id ? 'is-active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.note}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="pill pill-soft">Estado</span>
          <h2>Importar una vez y operar despues desde la bandeja</h2>
          <p>{statusMessage}</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">CRM laboral</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <button type="button" className="ghost-button" onClick={refreshData}>
              Refrescar
            </button>
            <button type="button" className="ghost-button" onClick={createMockImport}>
              Registrar importacion
            </button>
            <label className="ghost-button upload-button">
              {importing ? 'Analizando archivo...' : 'Subir archivo'}
              <input
                type="file"
                accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                onChange={handleFileSelection}
                hidden
              />
            </label>
            <button type="button" className="primary-button" onClick={() => setActiveView('contactos')}>
              Nuevo contacto
            </button>
          </div>
        </header>

        {activeView === 'dashboard' && (
          <Dashboard
            summary={summary}
            imports={imports}
            contacts={contacts}
            worktrayCounts={worktrayCounts}
            reporting={reporting}
            onOpenInWorktray={(contact) => {
              const nextAction = String(contact.next_action || '').toLowerCase();
              if (!worktrayActions.includes(nextAction)) return;
              setActiveActionFilter(nextAction);
              setActiveTimingFilter('todos');
              setSelectedWorktrayId(contact.id);
              setActiveView('bandeja');
            }}
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
            onOpenInWorktray={(contact) => {
              const nextAction = String(contact.next_action || '').toLowerCase();
              if (!worktrayActions.includes(nextAction)) return;
              setActiveActionFilter(nextAction);
              setActiveTimingFilter('todos');
              setSelectedWorktrayId(contact.id);
              setActiveView('bandeja');
            }}
          />
        )}
        {activeView === 'tendencias' && <TrendsView reporting={reporting} />}
        {activeView === 'contactos' && (
          <Contacts
            contacts={filteredContacts}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            form={form}
            onFormChange={setForm}
            onSubmit={handleSubmit}
            saving={saving}
          />
        )}
        {activeView === 'importaciones' && (
          <Imports
            imports={imports}
            importPreview={importPreview}
            selectedFile={selectedFile}
            importing={importing}
            confirming={confirming}
            capabilities={capabilities}
            onFileChange={handleFileSelection}
            onCandidateChange={updateCandidate}
            onConfirm={confirmPreview}
            onClearPreview={() => {
              setImportPreview(null);
              setSelectedFile(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({ summary, imports, contacts, worktrayCounts, reporting, onOpenInWorktray }) {
  const cards = [
    { label: 'Contactos', value: summary.total_contacts },
    { label: 'Empresas', value: summary.total_companies },
    { label: 'Prioridad', value: summary.priority_contacts },
    { label: 'Revisar', value: summary.review_contacts },
  ];
  const inboxToday = buildTodayInbox(contacts);

  return (
    <section className="page">
      <div className="hero-grid">
        <article className="hero-panel hero-panel-main">
          <span className="pill">Resumen operativo</span>
          <h2>Base propia para reemplazar la parte operativa del Excel.</h2>
          <p>
            Ahora el flujo ya queda dividido en dos etapas claras: importar para guardar y
            operar despues desde una bandeja accionable.
          </p>

          <div className="hero-stats">
            {cards.map((card) => (
              <div key={card.label} className="stat-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="hero-panel">
          <span className="pill pill-warm">Bandeja activa</span>
          <h3>Trabajo diario sin volver al preview</h3>
          <div className="mini-kpis">
            <div>
              <strong>{worktrayCounts.enviar || 0}</strong>
              <span>Enviar</span>
            </div>
            <div>
              <strong>{worktrayCounts.seguir || 0}</strong>
              <span>Seguir</span>
            </div>
            <div>
              <strong>{reporting.queue.overdue}</strong>
              <span>Vencidos</span>
            </div>
            <div>
              <strong>{reporting.outcomes.portal.aplicado}</strong>
              <span>Portales aplicados</span>
            </div>
          </div>
        </article>
      </div>

      <div className="secondary-grid">
        <section className="card">
          <div className="section-head">
            <h3>Flujo recomendado</h3>
            <span>Operativo</span>
          </div>
          <ol className="steps">
            <li>Subir archivo.</li>
            <li>Confirmar los candidatos utiles.</li>
            <li>Entrar a la bandeja por tipo de accion.</li>
            <li>Ejecutar enviar, seguir, portal o descartar sin volver al preview.</li>
          </ol>
        </section>

        <section className="card">
          <div className="section-head">
            <h3>Actividad reciente</h3>
            <span>24h / 7 dias</span>
          </div>
          <div className="feed">
            {imports.length ? (
              imports.slice(0, 4).map((item) => (
                <div key={item.id} className="feed-row">
                  <strong>{item.filename}</strong>
                  <span>
                    {item.total_contacts} contactos · {item.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="feed-row">
                <strong>Sin actividad</strong>
                <span>Registra una importacion desde el panel</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Inbox de hoy</h3>
            <p>Lo primero que conviene resolver hoy entre vencidos, agenda del dia y pendientes sin fecha.</p>
          </div>
          <span className="pill pill-soft">{inboxToday.total} items</span>
        </div>

        <div className="today-inbox-grid">
          <article className="today-inbox-panel">
            <div className="today-inbox-head">
              <strong>Vencidos</strong>
              <span>{inboxToday.overdue.length}</span>
            </div>
            <div className="today-inbox-list">
              {inboxToday.overdue.length ? (
                inboxToday.overdue.map((contact) => (
                  <button
                    key={`overdue-${contact.id}`}
                    type="button"
                    className="today-inbox-item"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong>{contact.name || 'Sin nombre'}</strong>
                    <span>{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="pipeline-empty">Nada vencido para resolver ahora.</div>
              )}
            </div>
          </article>

          <article className="today-inbox-panel">
            <div className="today-inbox-head">
              <strong>Para hoy</strong>
              <span>{inboxToday.today.length}</span>
            </div>
            <div className="today-inbox-list">
              {inboxToday.today.length ? (
                inboxToday.today.map((contact) => (
                  <button
                    key={`today-${contact.id}`}
                    type="button"
                    className="today-inbox-item"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong>{contact.name || 'Sin nombre'}</strong>
                    <span>{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="pipeline-empty">No hay seguimientos marcados para hoy.</div>
              )}
            </div>
          </article>

          <article className="today-inbox-panel">
            <div className="today-inbox-head">
              <strong>Sin fecha</strong>
              <span>{inboxToday.withoutDate.length}</span>
            </div>
            <div className="today-inbox-list">
              {inboxToday.withoutDate.length ? (
                inboxToday.withoutDate.map((contact) => (
                  <button
                    key={`without-date-${contact.id}`}
                    type="button"
                    className="today-inbox-item"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong>{contact.name || 'Sin nombre'}</strong>
                    <span>{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="pipeline-empty">Todo lo operativo ya tiene fecha.</div>
              )}
            </div>
          </article>
        </div>
      </section>
    </section>
  );
}

function TrendsView({ reporting }) {
  const [activeRange, setActiveRange] = useState(7);
  const filteredSnapshots = reporting.recent_snapshots.slice(0, activeRange);

  return (
    <section className="page">
      <section className="trends-hero">
        <article className="hero-panel hero-panel-main">
          <span className="pill">Tendencias</span>
          <h2>Lectura historica para entender ritmo, acumulacion y calidad del pipeline.</h2>
          <p>
            Esta vista separa el analisis del trabajo diario y concentra snapshots, comparativas y
            evolucion de stock en un solo lugar.
          </p>
        </article>

        <article className="hero-panel">
          <span className="pill pill-warm">Corte actual</span>
          <div className="mini-kpis">
            <div>
              <strong>{reporting.stock_comparison.current.total_contacts}</strong>
              <span>Contactos</span>
            </div>
            <div>
              <strong>{reporting.stock_comparison.current.active_total}</strong>
              <span>Cola activa</span>
            </div>
            <div>
              <strong>{reporting.stock_comparison.current.overdue_count}</strong>
              <span>Vencidos</span>
            </div>
            <div>
              <strong>{reporting.stock_comparison.current.without_date_count}</strong>
              <span>Sin fecha</span>
            </div>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Actividad semanal</h3>
            <p>Comparacion entre los ultimos 7 dias y la ventana anterior.</p>
          </div>
          <span className="pill pill-soft">Ritmo</span>
        </div>

        <div className="activity-bars">
          {['enviar', 'seguir', 'portal', 'descartar'].map((action) => (
            <div key={`bar-${action}`} className="activity-bar-row">
              <div className="activity-bar-head">
                <strong>{prettifyAction(action)}</strong>
                <span>
                  {reporting.activity.last_7d[action]} vs {reporting.activity.previous_7d[action]}
                </span>
              </div>
              <div className="activity-bar-track">
                <div
                  className="activity-bar activity-bar-current"
                  style={{ width: `${getRelativeBarWidth(reporting.activity.last_7d[action], reporting.activity.previous_7d[action])}%` }}
                />
                <div
                  className="activity-bar activity-bar-previous"
                  style={{ width: `${getRelativeBarWidth(reporting.activity.previous_7d[action], reporting.activity.last_7d[action])}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="comparison-grid">
          {['enviar', 'seguir', 'portal', 'descartar'].map((action) => (
            <article key={action} className="comparison-card">
              <div className="comparison-card-head">
                <strong>{prettifyAction(action)}</strong>
                <span className={`comparison-delta ${getDeltaClassName(reporting.activity.deltas_7d[action])}`}>
                  {formatDelta(reporting.activity.deltas_7d[action])}
                </span>
              </div>
              <div className="comparison-card-metrics">
                <div>
                  <span>Ultimos 7 dias</span>
                  <strong>{reporting.activity.last_7d[action]}</strong>
                </div>
                <div>
                  <span>7 previos</span>
                  <strong>{reporting.activity.previous_7d[action]}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Evolucion de snapshots</h3>
            <p>Serie corta de stock para seguir contactos, cola activa, vencidos y sin fecha.</p>
          </div>
          <span className="pill pill-soft">{filteredSnapshots.length} cortes visibles</span>
        </div>

        <div className="detail-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              window.open(`${API_BASE}/reporting/export.csv?type=overview`, '_blank', 'noopener,noreferrer');
            }}
          >
            Exportar resumen CSV
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              window.open(`${API_BASE}/reporting/export.csv?type=snapshots&limit=${activeRange}`, '_blank', 'noopener,noreferrer');
            }}
          >
            Exportar snapshots CSV
          </button>
        </div>

        <div className="filters trends-range-filters">
          {[7, 14, 30].map((range) => (
            <button
              key={range}
              type="button"
              className={`filter-chip ${activeRange === range ? 'is-active' : ''}`}
              onClick={() => setActiveRange(range)}
            >
              {range} dias
            </button>
          ))}
        </div>

        <article className="trend-combo-card">
          <div className="section-head">
            <div>
              <h3>Stock historico</h3>
              <p>Lectura conjunta de contactos, cola activa, vencidos y sin fecha en la ventana elegida.</p>
            </div>
          </div>

          <div className="sparkline-shell sparkline-shell-tall" aria-hidden="true">
            {buildMultiSparklineSeries(filteredSnapshots) ? (
              <svg viewBox="0 0 100 64" preserveAspectRatio="none" className="sparkline-chart sparkline-chart-tall">
                {Object.entries(buildMultiSparklineSeries(filteredSnapshots)).map(([key, points]) => (
                  <polyline
                    key={key}
                    points={points}
                    className={`sparkline-line sparkline-line-${key}`}
                  />
                ))}
              </svg>
            ) : (
              <div className="sparkline-empty">Sin serie suficiente</div>
            )}
          </div>

          <div className="trend-legend">
            <span className="trend-legend-item trend-legend-contacts">Contactos</span>
            <span className="trend-legend-item trend-legend-active">Cola activa</span>
            <span className="trend-legend-item trend-legend-overdue">Vencidos</span>
            <span className="trend-legend-item trend-legend-without-date">Sin fecha</span>
          </div>
        </article>

        <div className="snapshot-trends snapshot-trends-wide">
          <SparklineCard
            label="Contactos"
            value={reporting.stock_comparison.current.total_contacts}
            delta={reporting.stock_comparison.deltas.total_contacts}
            data={filteredSnapshots.map((snapshot) => snapshot.total_contacts).reverse()}
          />
          <SparklineCard
            label="Cola activa"
            value={reporting.stock_comparison.current.active_total}
            delta={reporting.stock_comparison.deltas.active_total}
            data={filteredSnapshots.map((snapshot) => snapshot.active_total).reverse()}
          />
          <SparklineCard
            label="Vencidos"
            value={reporting.stock_comparison.current.overdue_count}
            delta={reporting.stock_comparison.deltas.overdue_count}
            data={filteredSnapshots.map((snapshot) => snapshot.overdue_count).reverse()}
          />
          <SparklineCard
            label="Sin fecha"
            value={reporting.stock_comparison.current.without_date_count}
            delta={reporting.stock_comparison.deltas.without_date_count}
            data={filteredSnapshots.map((snapshot) => snapshot.without_date_count).reverse()}
          />
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Contactos</th>
                <th>Cola activa</th>
                <th>Vencidos</th>
                <th>Sin fecha</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnapshots.length ? (
                filteredSnapshots.map((snapshot) => (
                  <tr key={snapshot.snapshot_date}>
                    <td>{formatSnapshotDate(snapshot.snapshot_date)}</td>
                    <td>{snapshot.total_contacts}</td>
                    <td>{snapshot.active_total}</td>
                    <td>{snapshot.overdue_count}</td>
                    <td>{snapshot.without_date_count}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan="5">Todavia no hay snapshots suficientes para esta ventana.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function SparklineCard({ label, value, delta, data }) {
  const points = buildSparklinePoints(data);

  return (
    <article className="sparkline-card">
      <div className="sparkline-card-head">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <span className={`comparison-delta ${getDeltaClassName(delta)}`}>{formatDelta(delta)}</span>
      </div>

      <div className="sparkline-shell" aria-hidden="true">
        {points ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="sparkline-chart">
            <polyline points={points} className="sparkline-line" />
          </svg>
        ) : (
          <div className="sparkline-empty">Sin serie suficiente</div>
        )}
      </div>
    </article>
  );
}

function Worktray({
  contacts,
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
}) {
  return (
    <section className="page">
      <section className="worktray-hero">
        <div className="worktray-hero-copy">
          <span className="pill">Operacion directa</span>
          <h2>Bandeja operativa</h2>
          <p>Filtra por accion, escanea rapido y ejecuta el siguiente paso sin volver al preview.</p>
        </div>
        <div className="worktray-metrics">
          {worktrayActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`worktray-metric ${activeActionFilter === action ? 'is-active' : ''}`}
              onClick={() => onActionFilterChange(action)}
            >
              <strong>{counts[action] || 0}</strong>
              <span>{prettifyAction(action)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="report-strip">
        <article className="report-panel report-panel-primary">
          <span className="pill pill-soft">Seguimientos</span>
          <div className="report-kpis">
            <div>
              <strong>{reporting.queue.overdue}</strong>
              <span>Vencidos</span>
            </div>
            <div>
              <strong>{reporting.queue.due_today}</strong>
              <span>Para hoy</span>
            </div>
            <div>
              <strong>{reporting.queue.due_this_week}</strong>
              <span>Esta semana</span>
            </div>
            <div>
              <strong>{reporting.queue.without_date}</strong>
              <span>Sin fecha</span>
            </div>
          </div>
        </article>

        <article className="report-panel">
          <div className="section-head">
            <h3>Actividad</h3>
            <span>Real</span>
          </div>
          <div className="report-activity-grid">
            <div className="report-activity-card">
              <strong>24h</strong>
              <span>
                {reporting.activity.last_24h.enviar} enviados · {reporting.activity.last_24h.seguir} seguimientos
              </span>
            </div>
            <div className="report-activity-card">
              <strong>7 dias</strong>
              <span>
                {reporting.activity.last_7d.portal} portales · {reporting.activity.last_7d.descartar} descartes
              </span>
            </div>
          </div>
        </article>

        <article className="report-panel">
          <div className="section-head">
            <h3>Resultado</h3>
            <span>Cierre</span>
          </div>
          <div className="report-breakdown">
            <span className="provider-pill is-ready">Portales aplicados: {reporting.outcomes.portal.aplicado}</span>
            <span className="provider-pill">Pendientes portal: {reporting.outcomes.portal.pendiente}</span>
            <span className="provider-pill">Descartes: {reporting.outcomes.discard.total}</span>
          </div>
        </article>
      </section>

      <section className="worktray-layout">
        <div className="card worktray-card">
        <div className="section-head">
          <div>
            <h3>{prettifyAction(activeActionFilter)}</h3>
            <p>Contactos listos para resolver en esta pasada.</p>
          </div>
          <span className="pill pill-soft">{contacts.length} pendientes</span>
        </div>

        <div className="filters worktray-filters">
          {worktrayActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`filter-chip ${activeActionFilter === action ? 'is-active' : ''}`}
              onClick={() => onActionFilterChange(action)}
            >
              {prettifyAction(action)} ({counts[action] || 0})
            </button>
          ))}
        </div>

        <div className="filters worktray-filters worktray-filters-secondary">
          {timingFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${activeTimingFilter === filter ? 'is-active' : ''}`}
              onClick={() => onTimingFilterChange(filter)}
            >
              {prettifyTimingFilter(filter)} ({timingCounts[filter] || 0})
            </button>
          ))}
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Seguimiento</th>
                <th>Lectura operativa</th>
                <th>Ejecutar</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length ? (
                contacts.map((contact) => {
                  const action = String(contact.next_action || '').toLowerCase();
                  return (
                    <tr
                      key={contact.id}
                      className={`worktray-row ${selectedContactId === contact.id ? 'is-selected' : ''}`}
                      onClick={() => onSelectContact(contact.id)}
                    >
                      <td>
                        <div className="worktray-person">
                          <strong>{contact.name || 'Sin nombre'}</strong>
                          <span>{contact.email || '-'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="worktray-company">
                          <strong>{contact.company || '-'}</strong>
                          <span>{prettifyAction(action)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge status-${String(contact.status).toLowerCase()}`}>
                          {contact.status}
                        </span>
                      </td>
                      <td>
                        <div className="follow-up-editor">
                          <span className={`provider-pill ${isFollowUpDue(contact.follow_up_date) ? 'is-due' : ''}`}>
                            {formatFollowUpLabel(contact.follow_up_date)}
                          </span>
                          <input
                            type="date"
                            value={editingFollowUp[contact.id] ?? contact.follow_up_date ?? ''}
                            onChange={(event) =>
                              onFollowUpChange((current) => ({
                                ...current,
                                [contact.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="ghost-button follow-up-save"
                            onClick={() => onSaveFollowUp(contact)}
                            disabled={executingId === contact.id}
                          >
                            Guardar
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="worktray-reading">
                          <span className="provider-pill">{prettifyAction(action)}</span>
                          <p>{contact.suggested_message || 'Sin sugerencia disponible.'}</p>
                          {action === 'portal' && (
                            <div
                              className="action-detail-form"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="url"
                                placeholder="Link del portal"
                                value={actionDetails[contact.id]?.portal_url ?? contact.portal_url ?? ''}
                                onChange={(event) =>
                                  onActionDetailsChange((current) => ({
                                    ...current,
                                    [contact.id]: {
                                      ...current[contact.id],
                                      portal_url: event.target.value,
                                    },
                                  }))
                                }
                              />
                              <select
                                value={actionDetails[contact.id]?.portal_status ?? contact.portal_status ?? 'pendiente'}
                                onChange={(event) =>
                                  onActionDetailsChange((current) => ({
                                    ...current,
                                    [contact.id]: {
                                      ...current[contact.id],
                                      portal_status: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="pendiente">Pendiente</option>
                                <option value="aplicado">Aplicado</option>
                                <option value="revisar">Revisar</option>
                              </select>
                            </div>
                          )}
                          {action === 'descartar' && (
                            <div
                              className="action-detail-form"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <select
                                value={actionDetails[contact.id]?.discard_reason ?? contact.discard_reason ?? 'sin_respuesta'}
                                onChange={(event) =>
                                  onActionDetailsChange((current) => ({
                                    ...current,
                                    [contact.id]: {
                                      ...current[contact.id],
                                      discard_reason: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="sin_respuesta">Sin respuesta</option>
                                <option value="no_encaja">No encaja</option>
                                <option value="duplicado">Duplicado</option>
                                <option value="descartado_manual">Descartado manual</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="worktray-action-cell">
                        <button
                          type="button"
                          className="primary-button compact-button"
                          onClick={() => onExecuteAction(contact, action)}
                          disabled={executingId === contact.id}
                        >
                          {executingId === contact.id ? 'Ejecutando...' : prettifyAction(action)}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row">
                  <td colSpan="6">No hay contactos pendientes para esta accion.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>

        <aside className="detail-panel">
          <div className="detail-card">
            <div className="section-head">
              <div>
                <h3>Pipeline actual</h3>
                <p>Foto de estados y motivos para decidir la pasada.</p>
              </div>
            </div>

            <div className="pipeline-list">
              {reporting.pipeline.by_status.slice(0, 4).map((item) => (
                <div key={item.key} className="pipeline-row">
                  <strong>{capitalize(item.label)}</strong>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>

            {reporting.outcomes.discard.reasons.length ? (
              <div className="report-breakdown report-breakdown-compact">
                {reporting.outcomes.discard.reasons.slice(0, 3).map((reason) => (
                  <span key={reason.key} className="provider-pill">
                    {capitalize(reason.label)}: {reason.count}
                  </span>
                ))}
              </div>
            ) : (
              <div className="history-empty">Todavia no hay descartes agrupados por motivo.</div>
            )}
          </div>

          <div className="detail-card worktray-history">
            <div className="section-head">
              <div>
                <h3>{selectedContact?.name || 'Historial'}</h3>
                <p>{selectedContact ? 'Trazabilidad del contacto seleccionado.' : 'Selecciona un contacto para ver actividad.'}</p>
              </div>
            </div>

            {selectedContact ? (
              <>
                <div className="worktray-history-summary">
                  <span className="pill pill-soft">{selectedContact.company || 'Sin empresa'}</span>
                  <span className={`status-badge status-${String(selectedContact.status).toLowerCase()}`}>
                    {selectedContact.status}
                  </span>
                </div>

                <div className="history-list">
                  {loadingHistory ? (
                    <div className="history-empty">Cargando historial...</div>
                  ) : historyItems.length ? (
                    historyItems.map((item) => (
                      <article key={item.id} className="history-item">
                        <strong>{prettifyEvent(item.event_type)}</strong>
                        <p>{item.message}</p>
                        <span>{formatDate(item.created_at)}</span>
                      </article>
                    ))
                  ) : (
                    <div className="history-empty">Todavia no hay eventos registrados para este contacto.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="history-empty">No hay contacto seleccionado.</div>
            )}
          </div>
        </aside>
      </section>
    </section>
  );
}

function PipelineView({
  contacts,
  reporting,
  activeActionFilter,
  onActionFilterChange,
  actionDetails,
  onActionDetailsChange,
  executingId,
  onExecuteAction,
  onOpenInWorktray,
}) {
  const statusOrder = ['prioridad', 'mantener', 'revisar', 'seguimiento', 'portal', 'sacar'];
  const visibleContacts = contacts
    .filter((contact) =>
      activeActionFilter === 'todos'
        ? true
        : String(contact.next_action || '').toLowerCase() === activeActionFilter,
    )
    .sort((left, right) => {
      const leftFollowUp = left.follow_up_date ? new Date(`${left.follow_up_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const rightFollowUp = right.follow_up_date ? new Date(`${right.follow_up_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      return leftFollowUp - rightFollowUp || right.id - left.id;
    });

  const columns = statusOrder.map((status) => ({
    status,
    items: visibleContacts.filter((contact) => String(contact.status || '').toLowerCase() === status),
  }));
  const weeklyBuckets = buildWeeklyFollowUpBuckets(visibleContacts);

  return (
    <section className="page">
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
            <div>
              <strong>{reporting.queue.active_total}</strong>
              <span>En cola activa</span>
            </div>
            <div>
              <strong>{reporting.queue.overdue}</strong>
              <span>Vencidos</span>
            </div>
            <div>
              <strong>{reporting.outcomes.portal.total}</strong>
              <span>Portales</span>
            </div>
            <div>
              <strong>{reporting.outcomes.discard.total}</strong>
              <span>Descartes</span>
            </div>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Pipeline por estado</h2>
            <p>Filtra por siguiente accion para aislar el cuello operativo de la semana.</p>
          </div>
          <span className="pill pill-soft">{visibleContacts.length} contactos visibles</span>
        </div>

        <div className="filters">
          {['todos', ...actionOptions].map((action) => (
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

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Agenda semanal</h2>
            <p>Lectura por fecha de seguimiento para ordenar hoy, esta semana y lo que quedo sin fecha.</p>
          </div>
          <span className="pill pill-soft">{weeklyBuckets.totalScheduled} con fecha</span>
        </div>

        <div className="weekly-board">
          {weeklyBuckets.buckets.map((bucket) => (
            <article key={bucket.key} className={`weekly-column ${bucket.isToday ? 'is-today' : ''}`}>
              <div className="weekly-column-head">
                <strong>{bucket.label}</strong>
                <span>{bucket.items.length} contactos</span>
              </div>

              <div className="weekly-card-list">
                {bucket.items.length ? (
                  bucket.items.map((contact) => (
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
                weeklyBuckets.withoutDate.slice(0, 6).map((contact) => (
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

      <section className="pipeline-board">
        {columns.map((column) => (
          <article key={column.status} className="pipeline-column">
            <div className="pipeline-column-head">
              <div>
                <span className={`status-badge status-${column.status}`}>{capitalize(column.status)}</span>
                <strong>{column.items.length}</strong>
              </div>
              <span>{pipelineColumnNote(column.status)}</span>
            </div>

            <div className="pipeline-card-list">
              {column.items.length ? (
                column.items.map((contact) => (
                  <article key={contact.id} className="pipeline-contact-card">
                    <div className="pipeline-contact-head">
                      <strong>{contact.name || 'Sin nombre'}</strong>
                      <span>{contact.company || 'Sin empresa'}</span>
                    </div>

                    <div className="pipeline-contact-meta">
                      <span className="provider-pill">{prettifyAction(contact.next_action || 'revisar_manual')}</span>
                      <span className={`provider-pill ${isFollowUpDue(contact.follow_up_date) ? 'is-due' : ''}`}>
                        {formatFollowUpLabel(contact.follow_up_date)}
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
                          {executingId === contact.id
                            ? 'Ejecutando...'
                            : prettifyAction(String(contact.next_action || '').toLowerCase())}
                        </button>
                      )}

                      {String(contact.next_action || '').toLowerCase() === 'portal' && (
                        <div className="pipeline-inline-form">
                          <input
                            type="url"
                            placeholder="Link del portal"
                            value={actionDetails[contact.id]?.portal_url ?? contact.portal_url ?? ''}
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: {
                                  ...current[contact.id],
                                  portal_url: event.target.value,
                                },
                              }))
                            }
                          />
                          <select
                            value={actionDetails[contact.id]?.portal_status ?? contact.portal_status ?? 'pendiente'}
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: {
                                  ...current[contact.id],
                                  portal_status: event.target.value,
                                },
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
                            onChange={(event) =>
                              onActionDetailsChange((current) => ({
                                ...current,
                                [contact.id]: {
                                  ...current[contact.id],
                                  discard_reason: event.target.value,
                                },
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
                ))
              ) : (
                <div className="pipeline-empty">Sin contactos en este estado para el filtro actual.</div>
              )}
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function Contacts({ contacts, activeFilter, onFilterChange, form, onFormChange, onSubmit, saving }) {
  return (
    <section className="contacts-layout">
      <div className="contacts-main">
        <div className="section-head">
          <div>
            <h2>Contactos</h2>
            <p>Base central para mantener, revisar y priorizar contactos laborales.</p>
          </div>
          <span className="pill pill-soft">{contacts.length} visibles</span>
        </div>

        <div className="filters">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${activeFilter === filter ? 'is-active' : ''}`}
              onClick={() => onFilterChange(filter)}
            >
              {capitalize(filter)}
            </button>
          ))}
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Empresa</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Accion</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length ? (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>{contact.company || '-'}</td>
                    <td>{contact.email}</td>
                    <td>
                      <span className={`status-badge status-${String(contact.status).toLowerCase()}`}>
                        {contact.status}
                      </span>
                    </td>
                    <td>{prettifyAction(contact.next_action || 'revisar_manual')}</td>
                    <td>{contact.source}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan="6">No hay contactos para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="detail-panel">
        <div className="section-head">
          <div>
            <h3>Alta rapida</h3>
            <p>Crea contactos manualmente y defineles una accion inicial.</p>
          </div>
        </div>

        <form className="detail-card" onSubmit={onSubmit}>
          <FormField label="Nombre" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <FormField label="Email" value={form.email} onChange={(value) => onFormChange({ ...form, email: value })} />
          <FormField label="Empresa" value={form.company} onChange={(value) => onFormChange({ ...form, company: value })} />
          <FormField label="Cargo" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} />

          <label className="detail-field">
            <span>Estado</span>
            <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value })}>
              {filterOptions.filter((item) => item !== 'todos').map((item) => (
                <option key={item} value={item}>
                  {capitalize(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="detail-field">
            <span>Accion inicial</span>
            <select
              value={form.next_action}
              onChange={(event) => onFormChange({ ...form, next_action: event.target.value })}
            >
              {actionOptions.map((item) => (
                <option key={item} value={item}>
                  {prettifyAction(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="detail-field">
            <span>Notas</span>
            <textarea
              rows="5"
              value={form.notes}
              onChange={(event) => onFormChange({ ...form, notes: event.target.value })}
            />
          </label>

          <div className="detail-actions">
            <button type="button" className="ghost-button" onClick={() => onFormChange(defaultForm)}>
              Limpiar
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar contacto'}
            </button>
          </div>
        </form>
      </aside>
    </section>
  );
}

function Imports({
  imports,
  importPreview,
  selectedFile,
  importing,
  confirming,
  capabilities,
  onFileChange,
  onCandidateChange,
  onConfirm,
  onClearPreview,
}) {
  return (
    <section className="page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Importador inteligente</h2>
            <p>Subi un archivo, revisa la deteccion y confirma solo lo que te sirva.</p>
          </div>
          <span className="pill pill-soft">
            {selectedFile ? selectedFile.name : 'Sin archivo cargado'}
          </span>
        </div>

        <div className="provider-row">
          <span className={`provider-pill ${capabilities.tesseract_available ? 'is-ready' : ''}`}>
            OCR local: {capabilities.tesseract_available ? 'Tesseract detectado' : 'No detectado'}
          </span>
          <span className={`provider-pill ${capabilities.openai_enabled ? 'is-ready' : ''}`}>
            OCR por API: {capabilities.openai_enabled ? 'OpenAI activo' : 'OPENAI_API_KEY ausente'}
          </span>
          <span className={`provider-pill ${capabilities.openai_enabled ? 'is-ready' : ''}`}>
            Clasificacion: {capabilities.openai_enabled ? 'OpenAI + heuristica' : 'Heuristica local'}
          </span>
        </div>

        <div className="import-dropzone">
          <label className="upload-panel">
            <strong>{importing ? 'Analizando...' : 'Elegir archivo'}</strong>
            <span>Acepta txt, csv, xlsx, pdf con texto e imagenes para futura capa OCR.</span>
            <input
              type="file"
              accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              onChange={onFileChange}
              hidden
            />
          </label>
        </div>

        {importPreview && (
          <div className="preview-stack">
            <div className="mini-kpis">
              <div>
                <strong>{importPreview.stats.total_contacts}</strong>
                <span>detectados</span>
              </div>
              <div>
                <strong>{importPreview.stats.total_ready}</strong>
                <span>listos</span>
              </div>
              <div>
                <strong>{importPreview.stats.total_duplicates}</strong>
                <span>duplicados</span>
              </div>
              <div>
                <strong>{importPreview.stats.total_invalid}</strong>
                <span>invalidos</span>
              </div>
            </div>

            <div className="provider-row">
              <span className="provider-pill is-ready">Motor usado: {importPreview.provider}</span>
              <span className="provider-pill is-ready">
                Clasificacion: {importPreview.classification_provider}
              </span>
            </div>

            {importPreview.warnings?.length ? (
              <div className="warning-box">
                {importPreview.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>Contacto</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th>Accion</th>
                    <th>Sugerencia</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.candidates.map((candidate) => (
                    <tr key={candidate.id}>
                      <td>
                        <select
                          value={candidate.decision}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'decision', event.target.value)
                          }
                        >
                          <option value="approve">Aprobar</option>
                          <option value="skip">Omitir</option>
                          <option value="duplicate">Duplicado</option>
                          <option value="invalid">Invalido</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.name || ''}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'name', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.company || ''}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'company', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.email || ''}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'email', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={candidate.status}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'status', event.target.value)
                          }
                        >
                          {filterOptions.filter((item) => item !== 'todos').map((item) => (
                            <option key={item} value={item}>
                              {capitalize(item)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={candidate.next_action || 'revisar_manual'}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'next_action', event.target.value)
                          }
                        >
                          {actionOptions.map((item) => (
                            <option key={item} value={item}>
                              {prettifyAction(item)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <textarea
                          rows="3"
                          value={candidate.suggested_message || ''}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'suggested_message', event.target.value)
                          }
                        />
                      </td>
                      <td>{candidate.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="detail-actions">
              <button type="button" className="ghost-button" onClick={onClearPreview}>
                Descartar preview
              </button>
              <button type="button" className="primary-button" onClick={onConfirm} disabled={confirming}>
                {confirming ? 'Confirmando...' : 'Confirmar importacion'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Importaciones</h2>
            <p>Historial de previews y confirmaciones generadas desde la app.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Origen</th>
                <th>Total</th>
                <th>Listos</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {imports.length ? (
                imports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.filename}</td>
                    <td>{item.source}</td>
                    <td>{item.total_contacts}</td>
                    <td>{item.total_ready}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan="6">Todavia no hay importaciones registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function createEmptyReporting() {
  return {
    generated_at: null,
    queue: {
      overdue: 0,
      due_today: 0,
      due_this_week: 0,
      without_date: 0,
      active_total: 0,
    },
    outcomes: {
      portal: {
        aplicado: 0,
        pendiente: 0,
        revisar: 0,
        total: 0,
      },
      discard: {
        total: 0,
        reasons: [],
      },
    },
    pipeline: {
      by_status: [],
      by_action: [],
    },
    activity: {
      last_24h: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      last_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      previous_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      deltas_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
    },
    stock_comparison: {
      previous_snapshot_date: null,
      current: {
        total_contacts: 0,
        active_total: 0,
        overdue_count: 0,
        without_date_count: 0,
      },
      deltas: {
        total_contacts: 0,
        active_total: 0,
        overdue_count: 0,
        without_date_count: 0,
      },
    },
    recent_snapshots: [],
  };
}

function FormField({ label, value, onChange }) {
  return (
    <label className="detail-field">
      <span>{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function prettifyAction(value) {
  if (value === 'revisar_manual') return 'Revisar manual';
  return capitalize(value);
}

function prettifyTimingFilter(value) {
  if (value === 'esta_semana') return 'Esta semana';
  return capitalize(value);
}

function formatDelta(value) {
  if (!value) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function getDeltaClassName(value) {
  if (value > 0) return 'is-positive';
  if (value < 0) return 'is-negative';
  return 'is-neutral';
}

function pipelineColumnNote(status) {
  if (status === 'prioridad') return 'Empujar primero';
  if (status === 'mantener') return 'Base estable';
  if (status === 'revisar') return 'Pide criterio';
  if (status === 'seguimiento') return 'Recontacto activo';
  if (status === 'portal') return 'Fuera de cola';
  if (status === 'sacar') return 'Ya descartado';
  return 'Operacion';
}

function buildWeeklyFollowUpBuckets(contacts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const bucketDate = new Date(today);
    bucketDate.setDate(today.getDate() + index);
    return {
      key: bucketDate.toISOString().slice(0, 10),
      label: formatWeeklyBucketLabel(bucketDate, index === 0),
      isToday: index === 0,
      items: [],
    };
  });

  const bucketMap = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));
  const withoutDate = [];

  contacts.forEach((contact) => {
    if (!contact.follow_up_date) {
      withoutDate.push(contact);
      return;
    }
    const key = String(contact.follow_up_date);
    if (bucketMap[key]) {
      bucketMap[key].items.push(contact);
      return;
    }
    const followUpDate = new Date(`${key}T00:00:00`);
    if (followUpDate.getTime() < today.getTime()) {
      buckets[0].items.push(contact);
      return;
    }
    withoutDate.push(contact);
  });

  return {
    buckets,
    withoutDate,
    totalScheduled: contacts.filter((contact) => Boolean(contact.follow_up_date)).length,
  };
}

function formatWeeklyBucketLabel(dateValue, isToday) {
  const weekday = dateValue.toLocaleDateString('es-AR', { weekday: 'short' });
  const shortDate = dateValue.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return isToday ? `Hoy · ${shortDate}` : `${capitalize(weekday.replace('.', ''))} · ${shortDate}`;
}

function buildTodayInbox(contacts) {
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

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR');
}

function formatSnapshotDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-AR');
}

function buildSparklinePoints(values) {
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

function buildMultiSparklineSeries(snapshots) {
  const series = {
    contacts: snapshots.map((snapshot) => snapshot.total_contacts).reverse(),
    active: snapshots.map((snapshot) => snapshot.active_total).reverse(),
    overdue: snapshots.map((snapshot) => snapshot.overdue_count).reverse(),
    withoutDate: snapshots.map((snapshot) => snapshot.without_date_count).reverse(),
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

function getRelativeBarWidth(value, comparison) {
  const base = Math.max(value, comparison, 1);
  return (value / base) * 100;
}

function formatFollowUpLabel(value) {
  if (!value) return 'Sin fecha';
  const dateValue = new Date(`${value}T00:00:00`);
  return `Seguimiento ${dateValue.toLocaleDateString('es-AR')}`;
}

function isFollowUpDue(value) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  return dueDate.getTime() <= today.getTime();
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

function getTimingFilterCount(queue, filter) {
  if (filter === 'vencido') return queue.overdue || 0;
  if (filter === 'hoy') return queue.due_today || 0;
  if (filter === 'esta_semana') return queue.due_this_week || 0;
  return queue.active_total || 0;
}

function prettifyEvent(value) {
  const text = String(value || '').replaceAll('.', ' ');
  return capitalize(text);
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
