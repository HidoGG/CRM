// frontend/src/components/layout/Topbar.jsx
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
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className="m-0 mb-[6px] uppercase tracking-[0.16em] text-[0.78rem] text-[#587189] font-medium">
          CRM laboral
        </p>
        <h1 className="m-0 text-[clamp(2rem,2vw+1rem,3rem)] font-bold tracking-tight text-[#142433]">
          {pageTitle}
        </h1>
      </div>

      <div className="flex gap-[12px] flex-wrap items-center">
        <button
          type="button"
          onClick={refreshData}
          className="cursor-pointer border border-[#142433]/12 rounded-[14px] px-4 py-3 font-bold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors"
        >
          Refrescar
        </button>

        <button
          type="button"
          onClick={createMockImport}
          className="cursor-pointer border border-[#142433]/12 rounded-[14px] px-4 py-3 font-bold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors"
        >
          Registrar importacion
        </button>

        <label className="cursor-pointer border border-[#142433]/12 rounded-[14px] px-4 py-3 font-bold bg-white/75 text-[#173047] hover:bg-white/90 transition-colors relative overflow-hidden inline-flex items-center">
          {importing ? 'Analizando archivo...' : 'Subir archivo'}
          <input
            type="file"
            accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
            onChange={handleFileSelection}
            hidden
          />
        </label>

        <button
          type="button"
          onClick={() => setActiveView('contactos')}
          className="cursor-pointer border-0 rounded-[14px] px-4 py-3 font-bold bg-gradient-to-br from-[#184e77] to-[#1d70a2] text-white hover:opacity-90 transition-opacity shadow-sm"
        >
          Nuevo contacto
        </button>
      </div>
    </header>
  );
}
