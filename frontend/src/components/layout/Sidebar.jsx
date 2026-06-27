import React from 'react';

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const navItems = [
  { id: 'dashboard',     label: 'Hoy',          note: 'Centro de control'            },
  { id: 'operaciones',   label: 'Operaciones',   note: 'Bandeja · Pipeline · Agenda', badge: true },
  { id: 'contactos',     label: 'Contactos',     note: 'Base y filtros'               },
  { id: 'importaciones', label: 'Importaciones', note: 'Cargar empresas'              },
  { id: 'envios',        label: 'Envíos',        note: 'Correos automáticos'          },
  { id: 'asistente',     label: 'Asistente IA',  note: 'Búsqueda laboral'             },
];

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export function Sidebar({ activeView, setActiveView, statusMessage, overdueCount = 0, theme, toggleTheme, isOpen, onClose }) {
  const isDark = theme === 'dark';

  function handleNavClick(id) {
    setActiveView(id);
    onClose?.();
  }

  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`} role="navigation" aria-label="Navegación principal">
      {/* Botón cerrar — solo visible en mobile */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar menú"
        className="sidebar-close-btn"
      >
        <CloseIcon />
      </button>

      {/* Brand */}
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '0.92rem', lineHeight: 1, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CRM Laboral</strong>
          <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Oil &amp; Gas
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="nav" aria-label="Secciones">
        {navItems.map((item) => {
          const isActive =
            activeView === item.id ||
            (item.id === 'operaciones' && (activeView === 'bandeja' || activeView === 'pipeline')) ||
            (item.id === 'envios' && (activeView === 'plantillas' || activeView === 'cronogramas'));

          const showBadge = item.badge && overdueCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => handleNavClick(item.id)}
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
                    className="flex-shrink-0 min-w-[22px] h-[22px] rounded-full bg-[var(--red-text)] text-white text-[12px] font-bold flex items-center justify-center px-1"
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

      {/* Theme toggle */}
      {toggleTheme && (
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            borderRadius: 8,
            padding: '9px 12px',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid var(--border-faint)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>
      )}
    </aside>
  );
}
