import { useState } from 'react';
import { API_BASE, apiFetch } from '../lib/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { SectorDefaultsPanel } from '../components/SectorDefaultsPanel';

export function TemplatesView({ templates, onRefresh }) {
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState({ name: '', subject: '', body: '' });
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openNew() {
    setForm({ name: '', subject: '', body: '' });
    setEditing('new');
    setError('');
  }

  function openEdit(t) {
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setEditing(t);
    setError('');
  }

  function cancel() { setEditing(null); setError(''); }

  async function save() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError('Completá todos los campos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await apiFetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch(`${API_BASE}/templates/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      await onRefresh('templates');
      setEditing(null);
    } catch {
      setError('Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id) {
    try {
      const res = await apiFetch(`${API_BASE}/templates/${id}/default`, { method: 'PUT' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'No se pudo establecer la plantilla por defecto.');
        return;
      }
      await onRefresh('templates');
    } catch {
      setError('Error de conexión al cambiar la plantilla por defecto.');
    }
  }

  async function confirmRemove() {
    const id = confirmDelete;
    setConfirmDelete(null);
    const res = await apiFetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || 'No se pudo eliminar.');
      return;
    }
    await onRefresh('templates');
  }

  return (
    <div className="flex flex-col gap-5">
      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar plantilla"
        message="¿Seguro que querés eliminar esta plantilla? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDelete(null)}
      />

      <section aria-labelledby="templates-heading" className="card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Plantillas de mensaje</span>
            <h3 id="templates-heading" className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginTop: 4 }}>
              Cuerpos de email
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              Cada envío usa la plantilla del <strong>rubro</strong> del contacto (configuración de abajo).
              La marcada "por defecto" solo se usa si el rubro no tiene una asignada.
            </p>
          </div>
          <button type="button" onClick={openNew} className="primary-button" aria-label="Crear nueva plantilla">
            + Nueva plantilla
          </button>
        </div>

        {/* Formulario inline */}
        {editing && (
          <div
            style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
            role="form"
            aria-label={editing === 'new' ? 'Nueva plantilla' : `Editar plantilla: ${editing.name}`}
          >
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.97rem' }}>
              {editing === 'new' ? 'Nueva plantilla' : `Editar: ${editing.name}`}
            </h3>
            <div className="detail-field">
              <span>Nombre (etiqueta)</span>
              <input
                placeholder="Ej: Presentación Oil & Gas"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                aria-label="Nombre de la plantilla"
              />
            </div>
            <div className="detail-field">
              <span>Asunto — usá {'{company}'} y {'{name}'} como variables</span>
              <input
                placeholder="Ej: Postulacion y CV - {company}"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                aria-label="Asunto del email"
              />
            </div>
            <div className="detail-field">
              <span>Cuerpo — usá {'{name}'} y {'{company}'}</span>
              <textarea
                rows={6}
                placeholder="Escribí el cuerpo del email..."
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                style={{ resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--surface-input)', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6, fontFamily: 'inherit' }}
                aria-label="Cuerpo del email"
              />
            </div>
            {error && <p style={{ margin: 0, color: 'var(--red-text)', fontSize: '0.87rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={save} disabled={saving} className="primary-button">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={cancel} className="ghost-button">Cancelar</button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} role="list" aria-label="Lista de plantillas">
          {templates.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No hay plantillas creadas. Creá una para personalizar tus emails.
            </p>
          )}
          {templates.map(t => (
            <div
              key={t.id}
              role="listitem"
              style={{ border: '1px solid var(--border-faint)', borderRadius: 16, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-raised)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{t.name}</strong>
                  {t.is_default === 1 && (
                    <span
                      style={{ fontSize: '0.78rem', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 10px', borderRadius: 999, fontWeight: 700 }}
                      aria-label="Plantilla por defecto"
                    >
                      Por defecto
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(t.id)}
                      className="ghost-button"
                      style={{ fontSize: '0.82rem', padding: '5px 12px' }}
                      aria-label={`Usar ${t.name} como plantilla por defecto`}
                    >
                      Usar por defecto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="ghost-button"
                    style={{ fontSize: '0.82rem', padding: '5px 12px' }}
                    aria-label={`Editar plantilla ${t.name}`}
                  >
                    Editar
                  </button>
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(t.id)}
                      className="ghost-button"
                      style={{ fontSize: '0.82rem', padding: '5px 12px', color: 'var(--red-text)', borderColor: 'var(--red-text)' }}
                      aria-label={`Eliminar plantilla ${t.name}`}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Asunto:</span>{' '}{t.subject}
              </p>

              <pre
                style={{
                  margin: 0,
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  background: 'var(--surface-subtle)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  lineHeight: 1.65,
                  maxHeight: 160,
                  overflow: 'auto',
                }}
              >
                {t.body}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <SectorDefaultsPanel />
    </div>
  );
}
