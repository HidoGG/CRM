import React from 'react';

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export function Topbar({
  pageTitle,
  refreshData,
  createMockImport,
  importing,
  handleFileSelection,
  setActiveView,
  theme,
  toggleTheme,
}) {
  const isDark = theme === 'dark';
  return (
    <header className="topbar" role="banner">
      <div>
        <p className="eyebrow">CRM laboral</p>
        <h1 className="m-0 font-bold tracking-tight text-[var(--text-primary)]">
          {pageTitle}
        </h1>
      </div>

      <div className="topbar-actions" role="toolbar" aria-label="Acciones globales">
        <button
          type="button"
          onClick={toggleTheme}
          className="ghost-button"
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? 'Claro' : 'Oscuro'}
        </button>

        <button
          type="button"
          onClick={refreshData}
          className="ghost-button"
          aria-label="Refrescar datos"
        >
          Refrescar
        </button>

        <button
          type="button"
          onClick={createMockImport}
          className="ghost-button"
          aria-label="Registrar importación manual"
        >
          Registrar importación
        </button>

        <label
          className="ghost-button upload-button inline-flex items-center cursor-pointer"
          aria-label={importing ? 'Analizando archivo…' : 'Subir archivo para importar'}
        >
          {importing ? 'Analizando…' : 'Subir archivo'}
          <input
            type="file"
            accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
            onChange={handleFileSelection}
            hidden
            aria-hidden="true"
          />
        </label>

        <button
          type="button"
          onClick={() => setActiveView('contactos')}
          className="primary-button"
          aria-label="Crear nuevo contacto"
        >
          Nuevo contacto
        </button>
      </div>
    </header>
  );
}
