import { useState } from 'react';
import { API_BASE } from '../AppShell';

export function TemplatesView({ templates, onRefresh }) {
  const [editing, setEditing] = useState(null); // null | 'new' | template object
  const [form, setForm] = useState({ name: '', subject: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  function cancel() {
    setEditing(null);
    setError('');
  }

  async function save() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError('Completá todos los campos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await fetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await fetch(`${API_BASE}/templates/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      await onRefresh();
      setEditing(null);
    } catch {
      setError('Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id) {
    await fetch(`${API_BASE}/templates/${id}/default`, { method: 'PUT' });
    await onRefresh();
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    const res = await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.detail || 'No se pudo eliminar.');
      return;
    }
    await onRefresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-[24px] p-6 border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">
              Plantillas de mensaje
            </span>
            <h2 className="m-0 mt-2 text-2xl font-bold">Cuerpos de email</h2>
            <p className="mt-1 text-[#142433]/60 text-sm">
              Creá y administrá los textos que usás al contactar empresas. La plantilla por defecto se usa automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="bg-[#184e77] text-white rounded-[14px] px-5 py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer border-0"
          >
            + Nueva plantilla
          </button>
        </div>

        {editing && (
          <div className="bg-[#f4f8fc] rounded-[18px] p-5 mb-5 flex flex-col gap-3">
            <h3 className="m-0 font-bold text-[#142433]">
              {editing === 'new' ? 'Nueva plantilla' : `Editar: ${editing.name}`}
            </h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">Nombre (etiqueta)</label>
              <input
                className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm"
                placeholder="Ej: Presentación Oil & Gas"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                Asunto — usá {'{company}'} y {'{name}'} como variables
              </label>
              <input
                className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm"
                placeholder="Ej: Postulacion y CV - {company}"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                Cuerpo — usá {'{name}'} y {'{company}'}
              </label>
              <textarea
                className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm resize-y"
                rows={6}
                placeholder="Escribí el cuerpo del email..."
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
            </div>
            {error && <p className="text-red-600 text-sm m-0">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="bg-[#184e77] text-white rounded-[10px] px-5 py-2 font-semibold text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer border-0"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="bg-white border border-[#142433]/15 text-[#142433] rounded-[10px] px-5 py-2 font-semibold text-sm hover:bg-[#f4f8fc] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {templates.map(t => (
            <div
              key={t.id}
              className="border border-[#142433]/10 rounded-[18px] p-5 flex flex-col gap-2 bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <strong className="text-[#142433]">{t.name}</strong>
                  {t.is_default === 1 && (
                    <span className="text-xs bg-[#4bb3fd]/15 text-[#184e77] px-2 py-0.5 rounded-full font-semibold">
                      Por defecto
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(t.id)}
                      className="text-xs border border-[#184e77]/30 text-[#184e77] rounded-[8px] px-3 py-1.5 hover:bg-[#184e77]/5 cursor-pointer bg-white"
                    >
                      Usar por defecto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="text-xs border border-[#142433]/15 text-[#142433] rounded-[8px] px-3 py-1.5 hover:bg-[#f4f8fc] cursor-pointer bg-white"
                  >
                    Editar
                  </button>
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="text-xs border border-red-200 text-red-500 rounded-[8px] px-3 py-1.5 hover:bg-red-50 cursor-pointer bg-white"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-[#597189] m-0">
                <span className="font-semibold">Asunto:</span> {t.subject}
              </p>
              <pre className="text-xs text-[#142433]/70 m-0 whitespace-pre-wrap font-sans bg-[#f4f8fc] rounded-[10px] px-4 py-3 leading-relaxed">
                {t.body}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
