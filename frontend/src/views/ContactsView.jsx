import { useState } from 'react';
import { capitalize, prettifyAction } from '../AppShell';
import { ConfirmModal } from '../components/ConfirmModal';

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

export function ContactsView({ contacts, activeFilter, onFilterChange, form, onFormChange, onSubmit, onReset, saving, onDelete, schedules = [] }) {
  const defaultSchedule = schedules.find((s) => s.is_default) ?? schedules[0];
  const [confirmId, setConfirmId] = useState(null);
  const confirmContact = contacts.find(c => c.id === confirmId);
  return (
    <section className="contacts-layout">
      <ConfirmModal
        open={confirmId !== null}
        title="Eliminar contacto"
        message={confirmContact ? `¿Seguro que querés eliminar a ${confirmContact.name || confirmContact.email}? Se van a borrar también sus envíos programados.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => { onDelete(confirmId); setConfirmId(null); }}
        onCancel={() => setConfirmId(null)}
      />
      <div className="contacts-main">
        <div className="section-head">
          <div>
            <h2>Contactos</h2>
            <p>Base central para mantener, revisar y priorizar contactos laborales.</p>
          </div>
          <span className="pill pill-soft">{contacts.length} visibles</span>
        </div>

        <div className="filters">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${activeFilter === filter ? 'is-active' : ''}`}
              onClick={() => onFilterChange(filter)}
            >
              {capitalize(filter)}
            </button>
          ))}
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Empresa</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Accion</th>
                <th>Origen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.length ? (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>{contact.company || '-'}</td>
                    <td>{contact.email}</td>
                    <td>
                      <span className={`status-badge status-${String(contact.status).toLowerCase()}`}>
                        {contact.status}
                      </span>
                    </td>
                    <td>{prettifyAction(contact.next_action || 'revisar_manual')}</td>
                    <td>{contact.source}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setConfirmId(contact.id)}
                        title="Eliminar contacto"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 6px', borderRadius: '6px', fontSize: '0.8rem' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan="6">No hay contactos para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="detail-panel">
        <div className="section-head">
          <div>
            <h3>Alta rapida</h3>
            <p>Crea contactos manualmente y defineles una accion inicial.</p>
          </div>
        </div>

        <form className="detail-card" onSubmit={onSubmit} autoComplete="off">
          <FormField label="Nombre" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <FormField label="Email" value={form.email} onChange={(value) => onFormChange({ ...form, email: value })} />
          <FormField
            label="Empresa"
            value={form.company}
            onChange={(value) => onFormChange({ ...form, company: value })}
          />
          <FormField label="Cargo" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} />

          <label className="detail-field">
            <span>Estado</span>
            <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value })}>
              {filterOptions
                .filter((item) => item !== 'todos')
                .map((item) => (
                  <option key={item} value={item}>
                    {capitalize(item)}
                  </option>
                ))}
            </select>
          </label>

          <label className="detail-field">
            <span>Accion inicial</span>
            <select
              value={form.next_action}
              onChange={(event) => onFormChange({ ...form, next_action: event.target.value })}
            >
              {actionOptions.map((item) => (
                <option key={item} value={item}>
                  {prettifyAction(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="detail-field">
            <span>Cronograma de envío</span>
            <select
              value={form.schedule_id ?? defaultSchedule?.id ?? ''}
              onChange={(e) => onFormChange({ ...form, schedule_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Sin cronograma (inmediato)</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.is_default ? ' (por defecto)' : ''} — {String(s.start_hour_art).padStart(2,'0')}:00–{String(s.end_hour_art).padStart(2,'0')}:00 ART
                </option>
              ))}
            </select>
          </label>

          <label className="detail-field">
            <span>Notas</span>
            <textarea
              rows="3"
              value={form.notes}
              onChange={(event) => onFormChange({ ...form, notes: event.target.value })}
            />
          </label>

          <div className="detail-actions">
            <button type="button" className="ghost-button" onClick={onReset}>
              Limpiar
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar contacto'}
            </button>
          </div>
        </form>
      </aside>
    </section>
  );
}

function FormField({ label, value, onChange }) {
  return (
    <label className="detail-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
      />
    </label>
  );
}
