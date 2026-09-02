import { useMemo, useState } from 'react';
import { capitalize, prettifyAction } from '../lib/utils';
import { ConfirmModal, PromptModal } from '../components/ConfirmModal';
import { ContactForm } from '../components/ContactForm';
import { SectorBadge, SECTORS, getSectorLabel } from '../components/SectorBadge';

const EDIT_FIELDS = [
  { key: 'name',    label: 'Nombre',  type: 'text'  },
  { key: 'email',   label: 'Email',   type: 'email' },
  { key: 'company', label: 'Empresa', type: 'text'  },
  { key: 'title',   label: 'Cargo',   type: 'text'  },
  { key: 'notes',   label: 'Notas',   type: 'textarea' },
];

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];

const STATUS_STYLE = {
  prioridad:    { background: 'var(--red-bg)',    color: 'var(--red-text)'   },
  mantener:     { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  seguimiento:  { background: 'var(--blue-subtle)', color: 'var(--blue)'    },
  revisar:      { background: 'var(--amber-bg)',  color: 'var(--amber-text)' },
  sacar:        { background: 'var(--gray-bg)',   color: 'var(--gray-text)'  },
  portal:       { background: 'var(--purple-bg)', color: 'var(--purple-text)'},
};

const SECTOR_FILTERS = [
  { key: 'oilgas',      emoji: '🛢️', label: 'Petróleo & Gas' },
  { key: 'industria',   emoji: '⚙️', label: 'Industria' },
  { key: 'generalista', emoji: '🏢', label: 'Generalista' },
  { key: 'tecnologia',  emoji: '💻', label: 'Tecnología' },
  { key: 'unset',       emoji: '❓', label: 'Sin rubro' },
];

// Set a nivel de módulo: no se recrea en cada render
const KNOWN_INDUSTRIES = new Set(['oilgas', 'industria', 'generalista', 'tecnologia']);

export function ContactsView({ contacts, allContacts, activeFilter, onFilterChange, form, onFormChange, onSubmit, onReset, saving, onDelete, onUpdate }) {
  const [activeTab, setActiveTab]     = useState('lista');
  const [confirmId, setConfirmId]     = useState(null);
  const [editContact, setEditContact] = useState(null);
  const [editForm, setEditForm]       = useState({});
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState('');
  const [sectorFilter, setSectorFilter] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [pauseContact, setPauseContact] = useState(null);
  const [pauseReason, setPauseReason]   = useState('');
  const [pauseSaving, setPauseSaving]   = useState(false);
  const [pauseError, setPauseError]     = useState('');
  const [resumingId, setResumingId]     = useState(null);
  const confirmContact  = contacts.find(c => c.id === confirmId);

  function openPause(contact) {
    setPauseContact(contact);
    setPauseReason('');
    setPauseError('');
  }

  async function submitPause() {
    if (!pauseReason.trim()) { setPauseError('Contá brevemente por qué lo pausás.'); return; }
    setPauseSaving(true);
    setPauseError('');
    try {
      await onUpdate(pauseContact.id, {
        status: 'sacar',
        next_action: 'revisar_manual',
        discard_reason: pauseReason.trim(),
      });
      setPauseContact(null);
    } catch (e) {
      setPauseError(e.message || 'No se pudo pausar el contacto.');
    } finally {
      setPauseSaving(false);
    }
  }

  async function handleResume(contact) {
    setResumingId(contact.id);
    try {
      await onUpdate(contact.id, {
        status: 'mantener',
        next_action: 'enviar',
        discard_reason: null,
      });
    } catch {
      /* el error queda visible en el mensaje de estado global */
    } finally {
      setResumingId(null);
    }
  }

  // Memoizado: solo recalcula cuando cambia la lista de contactos
  const statusCountMap = useMemo(() => {
    const all = allContacts || contacts;
    const map = { todos: all.length };
    for (const c of all) {
      const s = (c.status || '').toLowerCase();
      map[s] = (map[s] || 0) + 1;
    }
    return map;
  }, [allContacts, contacts]);

  // Memoizado: depende de filtros activos y datos del servidor
  const sectorCountMap = useMemo(() => {
    const all = allContacts || contacts;
    const map = {};
    for (const sf of SECTOR_FILTERS) {
      map[sf.key] = sf.key === 'unset'
        ? all.filter(c => !KNOWN_INDUSTRIES.has(c.industry)).length
        : all.filter(c => c.industry === sf.key).length;
    }
    return map;
  }, [allContacts, contacts]);

  const visibleContacts = useMemo(() => contacts.filter(c => {
    if (sectorFilter === 'unset') {
      if (KNOWN_INDUSTRIES.has(c.industry)) return false;
    } else if (sectorFilter) {
      if (c.industry !== sectorFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (
        !(c.name || '').toLowerCase().includes(q) &&
        !(c.company || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [contacts, sectorFilter, searchQuery]);

  function openEdit(contact) {
    setEditContact(contact);
    setEditForm({
      name: contact.name || '',
      email: contact.email || '',
      company: contact.company || '',
      title: contact.title || '',
      notes: contact.notes || '',
      status: contact.status || 'mantener',
      next_action: contact.next_action || 'revisar_manual',
      industry: contact.industry || 'generalista',
    });
    setEditError('');
  }

  async function saveEdit() {
    if (!editForm.email?.trim()) { setEditError('El email es obligatorio.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await onUpdate(editContact.id, editForm);
      setEditContact(null);
    } catch (e) {
      setEditError(e.message || 'Error al guardar.');
    } finally {
      setEditSaving(false);
    }
  }

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

      <PromptModal
        open={pauseContact !== null}
        title="Pausar contacto"
        message={pauseContact
          ? `${pauseContact.name || pauseContact.email} sale de la cola de envíos y se cancelan los emails que tenía programados. Contá por qué lo pausás para acordarte después.`
          : ''}
        placeholder="Ej: ya no trabaja en la empresa (me lo dijo por mail el 4/8)"
        confirmLabel="Pausar"
        value={pauseReason}
        onChange={setPauseReason}
        onConfirm={submitPause}
        onCancel={() => setPauseContact(null)}
        saving={pauseSaving}
        error={pauseError}
      />

      {/* ── Modal de edición de contacto ── */}
      {editContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-contact-heading"
          onClick={e => { if (e.target === e.currentTarget) setEditContact(null); }}
        >
          <div
            style={{ background: 'var(--surface-raised)', borderRadius: 24, padding: 28, width: '100%', maxWidth: 520, display: 'grid', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', border: '1px solid var(--border-faint)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="edit-contact-heading" style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              Editar contacto
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {EDIT_FIELDS.filter(f => f.type !== 'textarea').map(f => (
                <div key={f.key} className="detail-field">
                  <span>{f.label}</span>
                  <input
                    type={f.type}
                    value={editForm[f.key] || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    aria-label={f.label}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="detail-field">
                <span>Estado</span>
                <select
                  value={editForm.status || 'mantener'}
                  onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                  aria-label="Estado del contacto"
                >
                  {['mantener','revisar','seguimiento','prioridad','sacar','portal'].map(s => (
                    <option key={s} value={s}>{capitalize(s)}</option>
                  ))}
                </select>
              </div>
              <div className="detail-field">
                <span>Próxima acción</span>
                <select
                  value={editForm.next_action || 'revisar_manual'}
                  onChange={e => setEditForm(prev => ({ ...prev, next_action: e.target.value }))}
                  aria-label="Próxima acción"
                >
                  {['enviar','seguir','portal','descartar','revisar_manual'].map(a => (
                    <option key={a} value={a}>{prettifyAction(a)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="detail-field">
              <span>Rubro</span>
              <select
                value={editForm.industry || 'generalista'}
                onChange={e => setEditForm(prev => ({ ...prev, industry: e.target.value }))}
                aria-label="Rubro de la empresa"
              >
                {SECTORS.map(s => (
                  <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>
                ))}
              </select>
            </div>
            <div className="detail-field">
              <span>Notas</span>
              <textarea
                rows={3}
                value={editForm.notes || ''}
                onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                style={{ resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--surface-input)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', lineHeight: 1.6 }}
                aria-label="Notas del contacto"
              />
            </div>
            {editError && <p style={{ margin: 0, color: 'var(--red-text)', fontSize: '0.87rem' }}>{editError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="ghost-button" onClick={() => setEditContact(null)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          {/* Buscador */}
          <div style={{ position: 'relative' }}>
            <svg
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              placeholder="Buscar por nombre o empresa…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 36px 9px 38px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface-input)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              aria-label="Buscar contactos por nombre o empresa"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: 2 }}
                aria-label="Limpiar búsqueda"
              >×</button>
            )}
          </div>

          {/* Filtros de estado + contador */}
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
                  <span style={{
                    marginLeft: 6,
                    background: activeFilter === filter ? 'rgba(255,255,255,0.25)' : 'var(--surface-subtle)',
                    color: activeFilter === filter ? 'var(--accent-text)' : 'var(--text-muted)',
                    borderRadius: 999,
                    padding: '0px 7px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    lineHeight: '1.6',
                    display: 'inline-block',
                  }}>
                    {statusCountMap[filter] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.83rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
              aria-live="polite"
            >
              {visibleContacts.length} visibles
            </span>
          </div>

          {/* Filtros de rubro */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por rubro">
            <button
              type="button"
              onClick={() => setSectorFilter(null)}
              aria-pressed={sectorFilter === null}
              style={{
                borderRadius: 999,
                padding: '5px 14px',
                fontSize: '0.83rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: sectorFilter === null ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: sectorFilter === null ? 'var(--accent)' : 'transparent',
                color: sectorFilter === null ? 'var(--accent-text)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Todos los rubros
            </button>
            {SECTOR_FILTERS.map(sf => {
              const count = sectorCountMap[sf.key] ?? 0;
              const isActive = sectorFilter === sf.key;
              return (
                <button
                  key={sf.key}
                  type="button"
                  onClick={() => setSectorFilter(isActive ? null : sf.key)}
                  aria-pressed={isActive}
                  style={{
                    borderRadius: 999,
                    padding: '5px 14px',
                    fontSize: '0.83rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{sf.emoji}</span>
                  <span>{sf.label}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-subtle)',
                    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                    borderRadius: 999,
                    padding: '1px 6px',
                    marginLeft: 2,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tabla */}
          <div className="contacts-table-wrap"
            style={{ width: '100%', borderRadius: 20, border: '1px solid var(--border-faint)', background: 'var(--surface-raised)', overflow: 'auto' }}
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr>
                  {['Contacto', 'Empresa', 'Email', 'Estado', 'Acción', 'Origen', 'Respuestas', ''].map(col => (
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
                {visibleContacts.length ? (
                  visibleContacts.map(contact => {
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
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <SectorBadge
                              sector={contact.industry || 'generalista'}
                              size="sm"
                              onChange={async (newSector) => {
                                try { await onUpdate(contact.id, { industry: newSector }); }
                                catch { /* error silencioso en tabla */ }
                              }}
                            />
                            {contact.company || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{ ...statusStyle, fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, display: 'inline-flex', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          >
                            {contact.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{prettifyAction(contact.next_action || 'revisar_manual')}</span>
                            {contact.discard_reason && (
                              <span
                                title={contact.discard_reason === 'rebote_email' ? 'Rebote' : contact.discard_reason}
                                style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: 'var(--gray-bg)', color: 'var(--gray-text)', display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif" }}
                              >
                                {contact.discard_reason === 'rebote_email' ? 'Rebote' : contact.discard_reason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.source || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {contact.replied_at && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--green-bg)', color: 'var(--green-text)', whiteSpace: 'nowrap' }}
                                title={`Respondió: ${new Date(contact.replied_at).toLocaleString('es-AR')}`}
                              >
                                Respondió
                              </span>
                            )}
                            {contact.bounced_at && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--red-bg)', color: 'var(--red-text)', whiteSpace: 'nowrap' }}
                                title={`Rebote: ${new Date(contact.bounced_at).toLocaleString('es-AR')}`}
                              >
                                Rebotó
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => openEdit(contact)}
                              style={{ color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              aria-label={`Editar contacto ${contact.name || contact.email}`}
                            >
                              Editar
                            </button>
                            {statusKey === 'sacar' ? (
                              <button
                                type="button"
                                onClick={() => handleResume(contact)}
                                disabled={resumingId === contact.id}
                                style={{ color: 'var(--green-text)', fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                aria-label={`Reanudar contacto ${contact.name || contact.email}`}
                              >
                                {resumingId === contact.id ? 'Reanudando…' : 'Reanudar'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openPause(contact)}
                                style={{ color: 'var(--amber-text)', fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                aria-label={`Pausar contacto ${contact.name || contact.email}`}
                              >
                                Pausar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmId(contact.id)}
                              style={{ color: 'var(--red-text)', fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              aria-label={`Eliminar contacto ${contact.name || contact.email}`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '0.9rem' }}>
                      {searchQuery || sectorFilter
                        ? 'No hay contactos que coincidan con los filtros aplicados.'
                        : 'No hay contactos para este filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Nuevo contacto (mismo formulario que la ventana emergente) ── */}
      {activeTab === 'nuevo' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ContactForm
            form={form}
            onFormChange={onFormChange}
            saving={saving}
            onSubmit={e => { onSubmit(e); setActiveTab('lista'); }}
            onCancel={() => { onReset(); setActiveTab('lista'); }}
          />
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

