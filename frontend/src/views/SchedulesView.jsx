import { useState } from 'react';
import { API_BASE, apiFetch } from '../lib/api';
import { ConfirmModal } from '../components/ConfirmModal';

function formatWindow(startH, endH) {
  const pad = h => String(h).padStart(2, '0');
  return `${pad(startH)}:00 – ${pad(endH)}:00 ART`;
}

function slotsPerDay(startH, endH, interval) {
  const windowMins = Math.max(0, (endH - startH) * 60);
  return interval > 0 ? Math.floor(windowMins / interval) : 0;
}

const emptyForm = { name: '', interval_minutes: 30, start_hour_art: 8, end_hour_art: 18 };

export function SchedulesView({ schedules, onRefresh }) {
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openNew() { setForm(emptyForm); setEditing('new'); setError(''); }

  function openEdit(s) {
    setForm({ name: s.name, interval_minutes: s.interval_minutes, start_hour_art: s.start_hour_art, end_hour_art: s.end_hour_art });
    setEditing(s);
    setError('');
  }

  function cancel() { setEditing(null); setError(''); }

  function field(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })); }

  async function save() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (Number(form.start_hour_art) >= Number(form.end_hour_art)) {
      setError('La hora de inicio debe ser menor a la de fin.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        interval_minutes: Number(form.interval_minutes),
        start_hour_art: Number(form.start_hour_art),
        end_hour_art: Number(form.end_hour_art),
      });
      const url    = editing === 'new' ? `${API_BASE}/schedules` : `${API_BASE}/schedules/${editing.id}`;
      const method = editing === 'new' ? 'POST' : 'PUT';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.detail || 'Error al guardar.');
        return;
      }
      await onRefresh('schedules');
      setEditing(null);
    } catch {
      setError('Error de conexión al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id) {
    try {
      const res = await apiFetch(`${API_BASE}/schedules/${id}/default`, { method: 'PUT' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'No se pudo establecer el cronograma por defecto.');
        return;
      }
      await onRefresh('schedules');
    } catch {
      setError('Error de conexión al cambiar el cronograma por defecto.');
    }
  }

  async function confirmRemove() {
    const id = confirmDelete;
    setConfirmDelete(null);
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.detail || 'No se pudo eliminar.');
      return;
    }
    await onRefresh('schedules');
  }

  const previewReady = Number(form.start_hour_art) < Number(form.end_hour_art) && Number(form.interval_minutes) > 0;

  return (
    <div className="flex flex-col gap-5">
      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar cronograma"
        message="¿Seguro que querés eliminar este cronograma? Los jobs pendientes vinculados quedarán sin ventana horaria."
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDelete(null)}
      />

      <section aria-labelledby="schedules-heading" className="card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Cronogramas de envío · ART / UTC−3</span>
            <h3 id="schedules-heading" className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginTop: 4 }}>
              Ventanas horarias
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              Controlá cuándo y cada cuánto se envían los correos al importar contactos.
            </p>
          </div>
          <button type="button" onClick={openNew} className="primary-button" aria-label="Crear nuevo cronograma">
            + Nuevo cronograma
          </button>
        </div>

        {/* Formulario inline */}
        {editing && (
          <div
            style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
            role="form"
            aria-label={editing === 'new' ? 'Nuevo cronograma' : `Editar cronograma: ${editing.name}`}
          >
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.97rem' }}>
              {editing === 'new' ? 'Nuevo cronograma' : `Editando: ${editing.name}`}
            </h3>

            <div className="detail-field">
              <span>Nombre del cronograma</span>
              <input
                placeholder="Ej: Envío Comercial Mañana"
                value={form.name}
                onChange={field('name')}
                aria-label="Nombre del cronograma"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="detail-field">
                <span>Intervalo (min)</span>
                <input
                  type="number" min="1" max="1440"
                  value={form.interval_minutes}
                  onChange={field('interval_minutes')}
                  aria-label="Intervalo en minutos entre envíos"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Pausa entre envíos</small>
              </div>
              <div className="detail-field">
                <span>Hora inicio ART</span>
                <input
                  type="number" min="0" max="22"
                  value={form.start_hour_art}
                  onChange={field('start_hour_art')}
                  aria-label="Hora de inicio en ART"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>0 = medianoche</small>
              </div>
              <div className="detail-field">
                <span>Hora fin ART</span>
                <input
                  type="number" min="1" max="23"
                  value={form.end_hour_art}
                  onChange={field('end_hour_art')}
                  aria-label="Hora de fin en ART"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>23 = 23:00 hs</small>
              </div>
            </div>

            {/* Vista previa en tiempo real */}
            {previewReady && (
              <div
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', fontSize: '0.87rem', color: 'var(--text-secondary)' }}
                aria-live="polite"
              >
                <span style={{ fontWeight: 700, color: 'var(--accent)', marginRight: 6 }}>Vista previa:</span>
                Ventana {formatWindow(Number(form.start_hour_art), Number(form.end_hour_art))},
                cada <strong style={{ color: 'var(--text-primary)' }}>{form.interval_minutes} min</strong>{' '}→{' '}
                máximo{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {slotsPerDay(Number(form.start_hour_art), Number(form.end_hour_art), Number(form.interval_minutes))} envíos/día
                </strong>
              </div>
            )}

            {error && <p style={{ margin: 0, color: 'var(--red-text)', fontSize: '0.87rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={save} disabled={saving} className="primary-button">
                {saving ? 'Guardando…' : 'Guardar cronograma'}
              </button>
              <button type="button" onClick={cancel} className="ghost-button">Cancelar</button>
            </div>
          </div>
        )}

        {error && !editing && (
          <p style={{ margin: '0 0 16px', color: 'var(--red-text)', fontSize: '0.87rem' }}>{error}</p>
        )}

        {/* Lista */}
        {schedules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <p style={{ margin: '0 0 6px' }}>No hay cronogramas creados aún.</p>
            <p style={{ margin: 0 }}>Creá uno para asignarlo al importar contactos.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="list" aria-label="Lista de cronogramas">
            {schedules.map(s => (
              <div
                key={s.id}
                role="listitem"
                style={{
                  border: '1px solid var(--border-faint)',
                  borderRadius: 14,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  background: 'var(--surface-raised)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.93rem' }}>{s.name}</strong>
                    {s.is_default === 1 && (
                      <span
                        style={{ fontSize: '0.77rem', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 10px', borderRadius: 999, fontWeight: 700 }}
                        aria-label="Cronograma por defecto"
                      >
                        Por defecto
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    <span>
                      Ventana{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>{formatWindow(s.start_hour_art, s.end_hour_art)}</strong>
                    </span>
                    <span>
                      Cada{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>{s.interval_minutes} min</strong>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      ≤ {slotsPerDay(s.start_hour_art, s.end_hour_art, s.interval_minutes)} envíos/día
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {!s.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(s.id)}
                      className="ghost-button"
                      style={{ fontSize: '0.82rem', padding: '5px 12px' }}
                      aria-label={`Usar ${s.name} como cronograma por defecto`}
                    >
                      Usar por defecto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="ghost-button"
                    style={{ fontSize: '0.82rem', padding: '5px 12px' }}
                    aria-label={`Editar cronograma ${s.name}`}
                  >
                    Editar
                  </button>
                  {!s.is_default && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(s.id)}
                      className="ghost-button"
                      style={{ fontSize: '0.82rem', padding: '5px 12px', color: 'var(--red-text)', borderColor: 'var(--red-text)' }}
                      aria-label={`Eliminar cronograma ${s.name}`}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
