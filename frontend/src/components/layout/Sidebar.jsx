import React from 'react';

const navItems = [
  { id: 'dashboard',     label: 'Hoy',          note: 'Centro de control'       },
  { id: 'operaciones',   label: 'Operaciones',   note: 'Bandeja · Pipeline · Agenda', badge: true },
  { id: 'contactos',     label: 'Contactos',     note: 'Base y filtros'          },
  { id: 'importaciones', label: 'Importaciones', note: 'Cargar empresas'         },
  { id: 'envios',        label: 'Envíos',        note: 'Correos automáticos'     },
  { id: 'estadisticas',  label: 'Estadísticas',  note: 'Análisis e historial'    },
];

export function Sidebar({ activeView, setActiveView, statusMessage, overdueCount = 0 }) {
  return (
    <aside className="p-6 bg-[#0c1826]/96 text-[#eef5ff] flex flex-col gap-6 border-r border-white/10">
      <div className="flex gap-[14px] items-center">
        <div className="w-12 h-12 rounded-2xl grid place-items-center bg-gradient-to-br from-[#4bb3fd] to-[#5ce1e6] text-[#062033] font-extrabold text-xl">
          C
        </div>
        <div>
          <strong className="block leading-none m-0">CRM Laboral</strong>
          <p className="mt-1 m-0 text-[#eef5ff]/70 leading-relaxed text-sm">Gestión operativa de búsqueda</p>
        </div>
      </div>

      <nav className="grid gap-[10px]">
        {navItems.map((item) => {
          const isActive = activeView === item.id
            || (item.id === 'operaciones' && (activeView === 'bandeja' || activeView === 'pipeline'))
            || (item.id === 'estadisticas' && activeView === 'tendencias')
            || (item.id === 'envios' && (activeView === 'plantillas' || activeView === 'cronogramas'));

          const showBadge = item.badge && overdueCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              className={`text-left px-4 py-[14px] flex items-center justify-between gap-2 cursor-pointer transition-colors duration-200 rounded-2xl border ${
                isActive
                  ? 'bg-gradient-to-br from-[#4bb3fd]/20 to-[#5ce1e6]/12 border-[#5ce1e6]/35'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-inherit'
              }`}
              onClick={() => setActiveView(item.id)}
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-[15px]">{item.label}</span>
                <small className="text-[#eef5ff]/60 text-[13px]">{item.note}</small>
              </div>
              {showBadge && (
                <span className="flex-shrink-0 min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center px-1">
                  {overdueCount > 99 ? '99+' : overdueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-[18px] rounded-[20px] bg-gradient-to-b from-white/10 to-white/5 border border-white/10">
        <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/20 text-[#eef5ff]/90 text-[13px] font-bold mb-3">
          Estado
        </span>
        <p className="mt-2 text-[#eef5ff]/70 text-sm leading-relaxed">{statusMessage}</p>
      </div>
    </aside>
  );
}
