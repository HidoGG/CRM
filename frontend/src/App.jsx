import { useMemo, useState } from 'react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', note: 'Resumen general' },
  { id: 'contactos', label: 'Contactos', note: 'Base y filtros' },
];

const activityFeed = [
  { label: 'Importacion', value: '12 nuevos' },
  { label: 'Seguimiento', value: '8 pendientes' },
  { label: 'Revisar', value: '4 casos' },
];

const contactFilters = [
  'Todos',
  'Activos',
  'Pendientes',
  'Prioridad',
  'Portal',
  'Revisar',
];

const emptyStats = [
  { label: 'Contactos', value: '0' },
  { label: 'Empresas', value: '0' },
  { label: 'Prioridad', value: '0' },
  { label: 'Seguimiento hoy', value: '0' },
];

const detailBlocks = [
  { label: 'Empresa', value: 'Halliburton' },
  { label: 'Contacto', value: 'Ana Paula Colasante' },
  { label: 'Email', value: 'ana.paula@example.com' },
  { label: 'Estado', value: 'Pendiente' },
];

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [activeFilter, setActiveFilter] = useState('Todos');

  const pageTitle = useMemo(
    () => (activeView === 'dashboard' ? 'Dashboard' : 'Contactos'),
    [activeView],
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CRM Local</strong>
            <p>Gestión laboral con foco operativo</p>
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
          <span className="pill pill-soft">Modo local</span>
          <h2>Importar y revisar sin tocar codigo</h2>
          <p>
            El flujo inicial prioriza carga, depuracion, clasificacion y revision
            humana antes de cualquier envio.
          </p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">CRM laboral</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <button type="button" className="ghost-button">
              Importar archivo
            </button>
            <button type="button" className="primary-button">
              Nuevo contacto
            </button>
          </div>
        </header>

        {activeView === 'dashboard' ? <Dashboard /> : <Contacts activeFilter={activeFilter} onFilterChange={setActiveFilter} />}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <section className="page">
      <div className="hero-grid">
        <article className="hero-panel hero-panel-main">
          <span className="pill">Resumen operativo</span>
          <h2>Todo listo para importar, revisar y priorizar contactos laborales.</h2>
          <p>
            Este tablero inicial muestra el estado de la base, los proximos pasos
            y el ritmo de trabajo diario para que el CRM no dependa de Excel.
          </p>

          <div className="hero-stats">
            {emptyStats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="hero-panel">
          <span className="pill pill-warm">Proxima accion</span>
          <h3>Subir base y revisar coincidencias</h3>
          <p>
            La primera version del flujo esta pensada para cargar archivos, extraer
            correos y dejar una revision visual antes de guardar.
          </p>
        </article>
      </div>

      <div className="secondary-grid">
        <section className="card">
          <div className="section-head">
            <h3>Estado de trabajo</h3>
            <span>Hoy</span>
          </div>
          <div className="feed">
            {activityFeed.map((item) => (
              <div key={item.label} className="feed-row">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <h3>Flujo recomendado</h3>
            <span>Revision humana</span>
          </div>
          <ol className="steps">
            <li>Importar archivo.</li>
            <li>Detectar correos y clasificar.</li>
            <li>Corregir empresa, estado y prioridad.</li>
            <li>Guardar en base y registrar historial.</li>
          </ol>
        </section>
      </div>
    </section>
  );
}

function Contacts({ activeFilter, onFilterChange }) {
  return (
    <section className="contacts-layout">
      <div className="contacts-main">
        <div className="section-head">
          <div>
            <h2>Contactos</h2>
            <p>Tabla vacia preparada para el alta y la revision manual.</p>
          </div>
          <span className="pill pill-soft">0 registros</span>
        </div>

        <div className="filters">
          {contactFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${activeFilter === filter ? 'is-active' : ''}`}
              onClick={() => onFilterChange(filter)}
            >
              {filter}
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
              </tr>
            </thead>
            <tbody>
              <tr className="empty-row">
                <td colSpan="5">
                  No hay contactos cargados todavia. Usa el importador para empezar.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside className="detail-panel">
        <div className="section-head">
          <div>
            <h3>Detalle lateral</h3>
            <p>Mock de edicion para revisar un contacto seleccionado.</p>
          </div>
        </div>

        <div className="detail-card">
          {detailBlocks.map((field) => (
            <label key={field.label} className="detail-field">
              <span>{field.label}</span>
              <input type="text" defaultValue={field.value} />
            </label>
          ))}

          <label className="detail-field">
            <span>Notas</span>
            <textarea rows="5" defaultValue="Pendiente de validar dominio, cargo y prioridad." />
          </label>

          <div className="detail-actions">
            <button type="button" className="ghost-button">
              Marcar revisar
            </button>
            <button type="button" className="primary-button">
              Guardar mock
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default App;
