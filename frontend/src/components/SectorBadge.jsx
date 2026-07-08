import { useState, useRef, useEffect } from 'react';

export const SECTORS = [
  { key: 'oilgas',      emoji: '🛢️', label: 'Petróleo & Gas' },
  { key: 'industria',   emoji: '⚙️', label: 'Industria & Servicios Técnicos' },
  { key: 'generalista', emoji: '🏢', label: 'Generalista / Polivalente' },
  { key: 'tecnologia',  emoji: '💻', label: 'Tecnología / Perfil Digital' },
];

export function getSectorEmoji(key) {
  return SECTORS.find(s => s.key === key)?.emoji ?? '🏢';
}

export function getSectorLabel(key) {
  return SECTORS.find(s => s.key === key)?.label ?? 'Sin clasificar';
}

/**
 * Badge editable que muestra el emoji del rubro.
 * Al hacer clic abre un dropdown con los 4 rubros.
 * onChange(newSectorKey) se llama al seleccionar.
 */
export function SectorBadge({ sector, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const emoji = getSectorEmoji(sector);
  const label = getSectorLabel(sector);
  const fontSize = size === 'sm' ? '0.85rem' : '1rem';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={label}
        aria-label={`Rubro: ${label}. Hacer clic para cambiar.`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize,
          lineHeight: 1,
          borderRadius: 4,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-subtle)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
      >
        {emoji}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 300,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 220,
            overflow: 'hidden',
          }}
        >
          <p style={{ margin: 0, padding: '8px 14px 4px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Cambiar rubro
          </p>
          {SECTORS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => { onChange(s.key); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                background: s.key === sector ? 'var(--accent-subtle, var(--surface-subtle))' : 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '9px 14px',
                fontSize: '0.88rem',
                color: s.key === sector ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: s.key === sector ? 700 : 400,
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (s.key !== sector) e.currentTarget.style.background = 'var(--surface-subtle)'; }}
              onMouseLeave={e => { if (s.key !== sector) e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ fontSize: '1rem' }}>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
