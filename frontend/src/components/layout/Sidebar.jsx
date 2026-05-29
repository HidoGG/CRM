// frontend/src/components/layout/Sidebar.jsx
import React from 'react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', note: 'Resumen general' },
  { id: 'bandeja', label: 'Bandeja', note: 'Accion directa' },
  { id: 'pipeline', label: 'Pipeline', note: 'Estados actuales' },
  { id: 'tendencias', label: 'Tendencias', note: 'Historico y ritmo' },
  { id: 'contactos', label: 'Contactos', note: 'Base y filtros' },
  { id: 'importaciones', label: 'Importaciones', note: 'Trazabilidad' },
  { id: 'plantillas', label: 'Plantillas', note: 'Cuerpos de mensaje' },
  { id: 'cronogramas', label: 'Cronogramas', note: 'Ventanas horarias ART' },
  { id: 'envios', label: 'Envíos', note: 'Gmail automatico' },
];

export function Sidebar({ activeView, setActiveView, statusMessage }) {
  return (
    <aside className="p-6 bg-[#0c1826]/96 text-[#eef5ff] flex flex-col gap-6 border-r border-white/10">
      <div className="flex gap-[14px] items-center">
        <div className="w-12 h-12 rounded-2xl grid place-items-center bg-gradient-to-br from-[#4bb3fd] to-[#5ce1e6] text-[#062033] font-extrabold text-xl">
          C
        </div>
        <div>
          <strong className="block leading-none m-0">CRM IA Local</strong>
          <p className="mt-1 m-0 text-[#eef5ff]/70 leading-relaxed text-sm">Operacion laboral con revision humana</p>
        </div>
      </div>

      <nav className="grid gap-[10px]">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`text-left px-4 py-[14px] flex flex-col gap-1 cursor-pointer transition-colors duration-200 rounded-2xl border ${
                isActive
                  ? 'bg-gradient-to-br from-[#4bb3fd]/20 to-[#5ce1e6]/12 border-[#5ce1e6]/35'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-inherit'
              }`}
              onClick={() => setActiveView(item.id)}
            >
              <span className="font-medium text-[15px]">{item.label}</span>
              <small className="text-[#eef5ff]/60 text-[13px]">{item.note}</small>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-[18px] rounded-[20px] bg-gradient-to-b from-white/10 to-white/5 border border-white/10">
        <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/20 text-[#eef5ff]/90 text-[13px] font-bold mb-3">
          Estado
        </span>
        <h2 className="m-0 text-[15px] font-semibold leading-snug">Importar una vez y operar despues desde la bandeja</h2>
        <p className="mt-2 text-[#eef5ff]/70 text-sm leading-relaxed">{statusMessage}</p>
      </div>
    </aside>
  );
}
