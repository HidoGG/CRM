import React from 'react';

const navItems = [
  { id: 'dashboard',     label: 'Hoy',          note: 'Centro de control'            },
  { id: 'operaciones',   label: 'Operaciones',   note: 'Bandeja · Pipeline · Agenda', badge: true },
  { id: 'contactos',     label: 'Contactos',     note: 'Base y filtros'               },
  { id: 'importaciones', label: 'Importaciones', note: 'Cargar empresas'              },
  { id: 'envios',        label: 'Envíos',        note: 'Correos automáticos'          },
  { id: 'estadisticas',  label: 'Estadísticas',  note: 'Análisis e historial'         },
];

export function Sidebar({ activeView, setActiveView, statusMessage, overdueCount = 0 }) {
  return (
    <aside className="sidebar" role="navigation" aria-label="Navegación principal">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div>
          <strong className="block leading-none text-[var(--text-primary)]">CRM Laboral</strong>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
            Oil &amp; Gas · Búsqueda activa
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="nav" aria-label="Secciones">
        {navItems.map((item) => {
          const isActive =
            activeView === item.id ||
            (item.id === 'operaciones' && (activeView === 'bandeja' || activeView === 'pipeline')) ||
            (item.id === 'estadisticas' && activeView === 'tendencias') ||
            (item.id === 'envios' && (activeView === 'plantillas' || activeView === 'cronogramas'));

          const showBadge = item.badge && overdueCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={showBadge ? `${item.label} — ${overdueCount} vencidos` : item.label}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-[15px] leading-tight">{item.label}</span>
                  <small>{item.note}</small>
                </div>
                {showBadge && (
                  <span
                    className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-[var(--red-text)] text-[var(--accent-text)] text-[11px] font-bold flex items-center justify-center px-1"
                    aria-hidden="true"
                  >
                    {overdueCount > 99 ? '99+' : overdueCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Status card */}
      <div className="sidebar-card" role="status" aria-live="polite">
        <span className="eyebrow mb-2 block">Estado del sistema</span>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{statusMessage}</p>
      </div>
    </aside>
  );
}
