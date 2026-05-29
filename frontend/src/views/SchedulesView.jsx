import { useState } from 'react';
import { API_BASE, apiFetch } from '../AppShell';
import { ConfirmModal } from '../components/ConfirmModal';

function formatWindow(startH, endH) {
  const pad = (h) => String(h).padStart(2, '0');
  return `${pad(startH)}:00 – ${pad(endH)}:00 ART`;
}

function slotsPerDay(startH, endH, interval) {
  const windowMins = Math.max(0, (endH - startH) * 60);
  return interval > 0 ? Math.floor(windowMins / interval) : 0;
}

const emptyForm = { name: '', interval_minutes: 30, start_hour_art: 8, end_hour_art: 18 };

export function SchedulesView({ schedules, onRefresh }) {
  const [editing, setEditing] = useState(null); // null | 'new' | schedule object
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openNew() {
    setForm(emptyForm);
    setEditing('new');
    setError('');
  }

  function openEdit(s) {
    setForm({
      name: s.name,
      interval_minutes: s.interval_minutes,
      start_hour_art: s.start_hour_art,
      end_hour_art: s.end_hour_art,
    });
    setEditing(s);
    setError('');
  }

  function cancel() {
    setEditing(null);
    setError('');
  }

  function field(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function save() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (Number(form.start_hour_art) >= Number(form.end_hour_art)) {
      setError('La hora de inicio debe ser menor a la hora de fin.');
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
      const url = editing === 'new'
        ? `${API_BASE}/schedules`
        : `${API_BASE}/schedules/${editing.id}`;
      const method = editing === 'new' ? 'POST' : 'PUT';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.detail || 'Error al guardar.');
        return;
      }
      await onRefresh();
      setEditing(null);
    } catch {
      setError('Error de conexión al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id) {
    await apiFetch(`${API_BASE}/schedules/${id}/default`, { method: 'PUT' });
    await onRefresh();
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
    await onRefresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <ConfirmModal
        open={confirmDelete !== null}
        title="Eliminar cronograma"
        message="¿Seguro que querés eliminar este cronograma? Los jobs pendientes vinculados quedarán sin ventana horaria asignada."
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDelete(null)}
      />

      <div className="bg-white rounded-[24px] p-6 border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">
              Cronogramas de envío
            </span>
            <h2 className="m-0 mt-2 text-2xl font-bold text-[#142433]">Gestión de cronogramas</h2>
            <p className="mt-1 text-[#142433]/60 text-sm max-w-lg">
              Creá perfiles de envío con ventana horaria en hora argentina (ART / UTC−3).
              Al importar contactos, asignales un cronograma para controlar cuándo y cada cuánto se mandan los correos.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="bg-[#184e77] text-white rounded-[14px] px-5 py-2.5 font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer border-0 flex-shrink-0"
          >
            + Nuevo cronograma
          </button>
        </div>

        {/* Formulario inline */}
        {editing && (
          <div className="bg-[#f4f8fc] rounded-[18px] p-5 mb-5 flex flex-col gap-4 border border-[#184e77]/10">
            <h3 className="m-0 font-bold text-[#142433] text-base">
              {editing === 'new' ? 'Nuevo cronograma' : `Editando: ${editing.name}`}
            </h3>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                Nombre del cronograma
              </label>
              <input
                className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#184e77]/30"
                placeholder="Ej: Envío Comercial Mañana"
                value={form.name}
                onChange={field('name')}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                  Intervalo (min)
                </label>
                <input
                  type="number" min="1" max="1440"
                  className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#184e77]/30"
                  value={form.interval_minutes}
                  onChange={field('interval_minutes')}
                />
                <span className="text-[11px] text-[#597189]">Pausa entre envíos</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                  Hora inicio ART
                </label>
                <input
                  type="number" min="0" max="22"
                  className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#184e77]/30"
                  value={form.start_hour_art}
                  onChange={field('start_hour_art')}
                />
                <span className="text-[11px] text-[#597189]">0 = medianoche</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                  Hora fin ART
                </label>
                <input
                  type="number" min="1" max="23"
                  className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#184e77]/30"
                  value={form.end_hour_art}
                  onChange={field('end_hour_art')}
                />
                <span className="text-[11px] text-[#597189]">23 = 23:00 hs</span>
              </div>
            </div>

            {/* Preview en tiempo real */}
            {Number(form.start_hour_art) < Number(form.end_hour_art) && Number(form.interval_minutes) > 0 && (
              <div className="bg-white rounded-[10px] px-4 py-3 border border-[#184e77]/15 text-sm text-[#142433]">
                <span className="font-semibold text-[#184e77]">Vista previa:</span>{' '}
                Ventana {formatWindow(Number(form.start_hour_art), Number(form.end_hour_art))},
                cada <strong>{form.interval_minutes} min</strong> →{' '}
                máximo{' '}
                <strong>
                  {slotsPerDay(Number(form.start_hour_art), Number(form.end_hour_art), Number(form.interval_minutes))} envíos/día
                </strong>
              </div>
            )}

            {error && <p className="text-red-600 text-sm m-0">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="bg-[#184e77] text-white rounded-[10px] px-5 py-2 font-semibold text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer border-0"
              >
                {saving ? 'Guardando...' : 'Guardar cronograma'}
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

        {error && !editing && <p className="text-red-600 text-sm mb-3">{error}</p>}

        {/* Lista de cronogramas */}
        {schedules.length === 0 ? (
          <div className="text-center py-12 text-[#142433]/40 text-sm flex flex-col items-center gap-2">
            <span className="text-3xl">🕐</span>
            <p className="m-0">No hay cronogramas creados aún.</p>
            <p className="m-0">Creá uno para asignarlo al importar contactos.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="border border-[#142433]/10 rounded-[18px] p-4 flex items-center justify-between gap-4 bg-white hover:border-[#184e77]/20 transition-colors"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-[#142433] text-[15px]">{s.name}</strong>
                    {s.is_default === 1 && (
                      <span className="text-xs bg-[#4bb3fd]/15 text-[#184e77] px-2 py-0.5 rounded-full font-semibold">
                        Por defecto
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#597189]">
                    <span>
                      🕐 <strong className="text-[#142433]">{formatWindow(s.start_hour_art, s.end_hour_art)}</strong>
                    </span>
                    <span>
                      ⏱ cada <strong className="text-[#142433]">{s.interval_minutes} min</strong>
                    </span>
                    <span className="text-[#142433]/40 text-xs">
                      ≤ {slotsPerDay(s.start_hour_art, s.end_hour_art, s.interval_minutes)} envíos/día
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!s.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(s.id)}
                      className="text-xs border border-[#184e77]/30 text-[#184e77] rounded-[8px] px-3 py-1.5 hover:bg-[#184e77]/5 cursor-pointer bg-white"
                    >
                      Usar por defecto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="text-xs border border-[#142433]/15 text-[#142433] rounded-[8px] px-3 py-1.5 hover:bg-[#f4f8fc] cursor-pointer bg-white"
                  >
                    Editar
                  </button>
                  {!s.is_default && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(s.id)}
                      className="text-xs border border-red-200 text-red-500 rounded-[8px] px-3 py-1.5 hover:bg-red-50 cursor-pointer bg-white"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
