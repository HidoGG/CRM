import { useState } from 'react';
import { capitalize, prettifyAction } from '../AppShell';
import { ConfirmModal } from '../components/ConfirmModal';

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

const STATUS_STYLE = {
  prioridad:    { background: 'var(--red-bg)',    color: 'var(--red-text)'   },
  mantener:     { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  seguimiento:  { background: 'var(--blue-subtle)', color: 'var(--blue)'    },
  revisar:      { background: 'var(--amber-bg)',  color: 'var(--amber-text)' },
  sacar:        { background: 'var(--gray-bg)',   color: 'var(--gray-text)'  },
  portal:       { background: 'var(--purple-bg)', color: 'var(--purple-text)'},
};

export function ContactsView({ contacts, activeFilter, onFilterChange, form, onFormChange, onSubmit, onReset, saving, onDelete, schedules = [] }) {
  const [activeTab, setActiveTab] = useState('lista');
  const [confirmId, setConfirmId] = useState(null);
  const defaultSchedule = schedules.find(s => s.is_default) ?? schedules[0];
  const confirmContact  = contacts.find(c => c.id === confirmId);

  return (
    <section className="grid gap-5">
      <ConfirmModal
        open={confirmId !== null}
        title="Eliminar contacto"
        message={confirmContact
          ? `¿Seguro que querés eliminar a ${confirmContact.name || confirmContact.email}? Se van a borrar también sus envíos programados.`
          : ''}
        confirmLabel="Eliminar"
        onConfirm={() => { onDelete(confirmId); setConfirmId(null); }}
        onCancel={() => setConfirmId(null)}
      />

      {/* ── Header + tabs ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="eyebrow">Base de contactos</span>
          <h2 className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.15rem', marginTop: 4 }}>Contactos</h2>
          <p className="m-0" style={{ color: 'var(--text-secondary)', fontSize: '0.87rem', marginTop: 2 }}>
            Mantené, revisá y priorizá tu red laboral.
          </p>
        </div>
        <div
          style={{ display: 'flex', gap: 4, background: 'var(--surface-subtle)', borderRadius: 14, padding: 6, border: '1px solid var(--border-faint)' }}
          role="tablist"
          aria-label="Secciones de contactos"
        >
          <TabButton active={activeTab === 'lista'}  onClick={() => setActiveTab('lista')}>Lista</TabButton>
          <TabButton active={activeTab === 'nuevo'}  onClick={() => setActiveTab('nuevo')}>Nuevo contacto</TabButton>
        </div>
      </div>

      {/* ── Tab: Lista ── */}
      {activeTab === 'lista' && (
        <div className="grid gap-4">
          {/* Filtros + contador */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              {filterOptions.map(filter => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onFilterChange(filter)}
                  aria-pressed={activeFilter === filter}
                  style={{
                    borderRadius: 999,
                    padding: '6px 16px',
                    fontSize: '0.87rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: activeFilter === filter ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: activeFilter === filter ? 'var(--accent)' : 'transparent',
                    color: activeFilter === filter ? 'var(--accent-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {capitalize(filter)}
                </button>
              ))}
            </div>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
              aria-live="polite"
            >
              {contacts.length} visibles
            </span>
          </div>

          {/* Tabla */}
          <div
            style={{ width: '100%', borderRadius: 20, border: '1px solid var(--border-faint)', background: 'var(--surface-raised)', overflow: 'hidden' }}
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '7%'  }} />
              </colgroup>
              <thead>
                <tr>
                  {['Contacto', 'Empresa', 'Email', 'Estado', 'Acción', 'Origen', ''].map(col => (
                    <th
                      key={col}
                      scope="col"
                      style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-faint)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.length ? (
                  contacts.map(contact => {
                    const statusKey = String(contact.status || '').toLowerCase();
                    const statusStyle = STATUS_STYLE[statusKey] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
                    return (
                      <tr
                        key={contact.id}
                        style={{ borderBottom: '1px solid var(--border-faint)' }}
                      >
                        <td style={{ padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{contact.name || '—'}</strong>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{ ...statusStyle, fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, display: 'inline-flex', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          >
                            {contact.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {prettifyAction(contact.next_action || 'revisar_manual')}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.source || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            onClick={() => setConfirmId(contact.id)}
                            style={{ color: 'var(--red-text)', fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            aria-label={`Eliminar contacto ${contact.name || contact.email}`}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '0.9rem' }}>
                      No hay contactos para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Nuevo contacto ── */}
      {activeTab === 'nuevo' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <form
            style={{ background: 'var(--surface-raised)', borderRadius: 24, border: '1px solid var(--border-faint)', padding: 32, display: 'grid', gap: 16, width: '100%', maxWidth: 560 }}
            onSubmit={e => { onSubmit(e); setActiveTab('lista'); }}
            autoComplete="off"
            aria-label="Formulario de nuevo contacto"
          >
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Nuevo contacto</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
                Completá los datos y definile una acción inicial.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Nombre"  value={form.name}    onChange={v => onFormChange({ ...form, name: v })}    />
              <FormField label="Email"   value={form.email}   onChange={v => onFormChange({ ...form, email: v })}   />
              <FormField label="Empresa" value={form.company} onChange={v => onFormChange({ ...form, company: v })} />
              <FormField label="Cargo"   value={form.title}   onChange={v => onFormChange({ ...form, title: v })}   />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="detail-field">
                <span>Estado</span>
                <select
                  value={form.status}
                  onChange={e => onFormChange({ ...form, status: e.target.value })}
                  aria-label="Estado del contacto"
                >
                  {filterOptions.filter(f => f !== 'todos').map(f => (
                    <option key={f} value={f}>{capitalize(f)}</option>
                  ))}
                </select>
              </div>
              <div className="detail-field">
                <span>Acción inicial</span>
                <select
                  value={form.next_action}
                  onChange={e => onFormChange({ ...form, next_action: e.target.value })}
                  aria-label="Acción inicial para el contacto"
                >
                  {actionOptions.map(a => (
                    <option key={a} value={a}>{prettifyAction(a)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="detail-field">
              <span>Cronograma de envío</span>
              <select
                value={form.schedule_id ?? defaultSchedule?.id ?? ''}
                onChange={e => onFormChange({ ...form, schedule_id: e.target.value ? Number(e.target.value) : null })}
                aria-label="Cronograma de envío"
              >
                <option value="">Sin cronograma (inmediato)</option>
                {schedules.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.is_default ? ' (por defecto)' : ''} — {String(s.start_hour_art).padStart(2, '0')}:00–{String(s.end_hour_art).padStart(2, '0')}:00 ART
                  </option>
                ))}
              </select>
            </div>

            <div className="detail-field">
              <span>Notas</span>
              <textarea
                rows="4"
                style={{ resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', background: 'var(--surface-input)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', lineHeight: 1.6 }}
                value={form.notes}
                onChange={e => onFormChange({ ...form, notes: e.target.value })}
                aria-label="Notas del contacto"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <button type="button" className="ghost-button" onClick={() => { onReset(); setActiveTab('lista'); }}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar contacto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        borderRadius: 10,
        padding: '7px 18px',
        fontSize: '0.87rem',
        fontWeight: 600,
        cursor: 'pointer',
        border: active ? '1px solid var(--border)' : '1px solid transparent',
        background: active ? 'var(--surface-raised)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: active ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function FormField({ label, value, onChange }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="new-password"
        aria-label={label}
      />
    </div>
  );
}
