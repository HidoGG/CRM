import { useState } from 'react';
import { capitalize, prettifyAction } from '../AppShell';
import { ConfirmModal } from '../components/ConfirmModal';

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

export function ContactsView({ contacts, activeFilter, onFilterChange, form, onFormChange, onSubmit, onReset, saving, onDelete, schedules = [] }) {
  const [activeTab, setActiveTab] = useState('lista');
  const [confirmId, setConfirmId] = useState(null);
  const defaultSchedule = schedules.find((s) => s.is_default) ?? schedules[0];
  const confirmContact = contacts.find((c) => c.id === confirmId);

  return (
    <section className="grid gap-5">
      <ConfirmModal
        open={confirmId !== null}
        title="Eliminar contacto"
        message={confirmContact ? `¿Seguro que querés eliminar a ${confirmContact.name || confirmContact.email}? Se van a borrar también sus envíos programados.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => { onDelete(confirmId); setConfirmId(null); }}
        onCancel={() => setConfirmId(null)}
      />

      {/* ── Header + tabs ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="m-0 text-2xl font-bold text-[#102538]">Contactos</h2>
          <p className="m-0 mt-1 text-[#597189] text-[0.9rem]">Base central para mantener, revisar y priorizar contactos laborales.</p>
        </div>
        <div className="flex items-center gap-1 bg-[#f4f8fc] rounded-[16px] p-1">
          <TabButton active={activeTab === 'lista'} onClick={() => setActiveTab('lista')}>
            Lista de contactos
          </TabButton>
          <TabButton active={activeTab === 'nuevo'} onClick={() => setActiveTab('nuevo')}>
            Nuevo contacto
          </TabButton>
        </div>
      </div>

      {/* ── Tab: Lista ── */}
      {activeTab === 'lista' && (
        <div className="grid gap-4">
          {/* Filtros + contador */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onFilterChange(filter)}
                  className={`rounded-full px-[14px] py-[8px] text-[0.9rem] font-medium border cursor-pointer transition-colors ${
                    activeFilter === filter
                      ? 'bg-[#184e77] text-white border-[#184e77]'
                      : 'bg-white/84 text-[#173047] border-[#142433]/12 hover:bg-white'
                  }`}
                >
                  {capitalize(filter)}
                </button>
              ))}
            </div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">
              {contacts.length} visibles
            </span>
          </div>

          {/* Tabla full-width */}
          <div className="w-full overflow-x-auto rounded-[24px] border border-[#142433]/8 bg-white/90 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Contacto', 'Empresa', 'Email', 'Estado', 'Acción', 'Origen', ''].map((col) => (
                    <th
                      key={col}
                      className="bg-[#f4f8fc] text-[#597189] text-[0.84rem] uppercase tracking-[0.07em] px-[18px] py-[14px] text-left border-b border-[#142433]/8 font-semibold whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.length ? (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-[#142433]/6 hover:bg-[#f9fbfd] transition-colors">
                      <td className="px-[18px] py-[14px]">
                        <strong className="text-[#102538] text-[0.95rem]">{contact.name || '—'}</strong>
                      </td>
                      <td className="px-[18px] py-[14px] text-[#597189]">{contact.company || '—'}</td>
                      <td className="px-[18px] py-[14px] text-[#597189]">{contact.email}</td>
                      <td className="px-[18px] py-[14px]">
                        <span className={`status-badge status-${String(contact.status || '').toLowerCase()}`}>
                          {contact.status}
                        </span>
                      </td>
                      <td className="px-[18px] py-[14px] text-[#597189]">
                        {prettifyAction(contact.next_action || 'revisar_manual')}
                      </td>
                      <td className="px-[18px] py-[14px] text-[#597189] text-[0.9rem]">{contact.source || '—'}</td>
                      <td className="px-[18px] py-[14px]">
                        <button
                          type="button"
                          onClick={() => setConfirmId(contact.id)}
                          className="text-[#ef4444] text-[0.82rem] font-medium bg-transparent border-0 cursor-pointer hover:text-[#c53030] transition-colors"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center text-[#597189] py-[36px]">
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
        <div className="flex justify-center">
          <form
            className="bg-white/86 rounded-[24px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] p-[32px] grid gap-[16px] w-full max-w-[560px]"
            onSubmit={(e) => { onSubmit(e); setActiveTab('lista'); }}
            autoComplete="off"
          >
            <div className="mb-[4px]">
              <h3 className="m-0 text-xl font-bold text-[#102538]">Nuevo contacto</h3>
              <p className="m-0 mt-1 text-[#597189] text-[0.9rem]">Completá los datos y definile una acción inicial.</p>
            </div>

            <div className="grid grid-cols-2 gap-[14px]">
              <FormField label="Nombre" value={form.name} onChange={(v) => onFormChange({ ...form, name: v })} />
              <FormField label="Email" value={form.email} onChange={(v) => onFormChange({ ...form, email: v })} />
              <FormField label="Empresa" value={form.company} onChange={(v) => onFormChange({ ...form, company: v })} />
              <FormField label="Cargo" value={form.title} onChange={(v) => onFormChange({ ...form, title: v })} />
            </div>

            <div className="grid grid-cols-2 gap-[14px]">
              <div className="grid gap-[6px]">
                <span className="text-[#597189] text-[0.84rem] font-semibold">Estado</span>
                <select
                  className="rounded-[12px] border border-[#142433]/12 bg-white px-[12px] py-[9px] text-[#173047] text-[0.9rem]"
                  value={form.status}
                  onChange={(e) => onFormChange({ ...form, status: e.target.value })}
                >
                  {filterOptions.filter((f) => f !== 'todos').map((f) => (
                    <option key={f} value={f}>{capitalize(f)}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-[6px]">
                <span className="text-[#597189] text-[0.84rem] font-semibold">Acción inicial</span>
                <select
                  className="rounded-[12px] border border-[#142433]/12 bg-white px-[12px] py-[9px] text-[#173047] text-[0.9rem]"
                  value={form.next_action}
                  onChange={(e) => onFormChange({ ...form, next_action: e.target.value })}
                >
                  {actionOptions.map((a) => (
                    <option key={a} value={a}>{prettifyAction(a)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-[6px]">
              <span className="text-[#597189] text-[0.84rem] font-semibold">Cronograma de envío</span>
              <select
                className="rounded-[12px] border border-[#142433]/12 bg-white px-[12px] py-[9px] text-[#173047] text-[0.9rem]"
                value={form.schedule_id ?? defaultSchedule?.id ?? ''}
                onChange={(e) => onFormChange({ ...form, schedule_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Sin cronograma (inmediato)</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.is_default ? ' (por defecto)' : ''} — {String(s.start_hour_art).padStart(2, '0')}:00–{String(s.end_hour_art).padStart(2, '0')}:00 ART
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-[6px]">
              <span className="text-[#597189] text-[0.84rem] font-semibold">Notas</span>
              <textarea
                rows="4"
                className="rounded-[12px] border border-[#142433]/12 bg-white px-[12px] py-[9px] text-[#173047] text-[0.9rem] resize-vertical"
                value={form.notes}
                onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 mt-[4px]">
              <button type="button" className="ghost-button" onClick={() => { onReset(); setActiveTab('lista'); }}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar contacto'}
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
      onClick={onClick}
      className={`rounded-[12px] px-5 py-2 text-sm font-semibold transition-all cursor-pointer border-0 ${
        active ? 'bg-white text-[#184e77] shadow-sm' : 'text-[#597189] bg-transparent hover:text-[#142433]'
      }`}
    >
      {children}
    </button>
  );
}

function FormField({ label, value, onChange }) {
  return (
    <div className="grid gap-[6px]">
      <span className="text-[#597189] text-[0.84rem] font-semibold">{label}</span>
      <input
        type="text"
        className="rounded-[12px] border border-[#142433]/12 bg-white px-[12px] py-[9px] text-[#173047] text-[0.9rem]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
    </div>
  );
}
