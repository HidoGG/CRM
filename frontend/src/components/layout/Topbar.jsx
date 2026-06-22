import React from 'react';

export function Topbar({
  pageTitle,
  refreshData,
  createMockImport,
  importing,
  handleFileSelection,
  setActiveView,
}) {
  return (
    <header className="topbar" role="banner">
      <div className="hidden md:block">
        <p className="eyebrow">CRM laboral</p>
        <h1 className="m-0 font-bold tracking-tight text-[var(--text-primary)]">
          {pageTitle}
        </h1>
      </div>

      <div className="topbar-actions" role="toolbar" aria-label="Acciones globales">
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
