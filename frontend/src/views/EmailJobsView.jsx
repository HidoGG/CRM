import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../AppShell';

const STATUS_LABEL = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
};
const STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

export function EmailJobsView({ contacts, templates, emailJobs, cvFiles, gmailStatus, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    contact_id: '',
    template_id: '',
    cv_file_id: '',
    frequency_days: '0',
    scheduled_at: new Date().toISOString().slice(0, 16),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingCv, setUploadingCv] = useState(false);
  const cvInputRef = useRef(null);

  const defaultTemplate = templates.find(t => t.is_default) || templates[0];
  const defaultCv = cvFiles.find(c => c.is_default) || cvFiles[0];

  useEffect(() => {
    if (showForm) {
      setForm(f => ({
        ...f,
        template_id: f.template_id || String(defaultTemplate?.id || ''),
        cv_file_id: f.cv_file_id || String(defaultCv?.id || ''),
      }));
    }
  }, [showForm, defaultTemplate, defaultCv]);

  async function uploadCv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCv(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/cv-files`, { method: 'POST', body: fd });
      const cv = await res.json();
      await onRefresh();
      setForm(f => ({ ...f, cv_file_id: String(cv.id) }));
    } finally {
      setUploadingCv(false);
      e.target.value = '';
    }
  }

  async function setDefaultCv(id) {
    await fetch(`${API_BASE}/cv-files/${id}/default`, { method: 'PUT' });
    await onRefresh();
  }

  async function deleteCv(id) {
    if (!confirm('¿Eliminar este CV?')) return;
    await fetch(`${API_BASE}/cv-files/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  async function createJob() {
    if (!form.contact_id) { setError('Seleccioná un contacto.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        contact_id: Number(form.contact_id),
        template_id: form.template_id ? Number(form.template_id) : null,
        cv_file_id: form.cv_file_id ? Number(form.cv_file_id) : null,
        frequency_days: Number(form.frequency_days),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      };
      const res = await fetch(`${API_BASE}/email-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.detail); }
      await onRefresh();
      setShowForm(false);
      setForm({ contact_id: '', template_id: '', cv_file_id: '', frequency_days: '0', scheduled_at: new Date().toISOString().slice(0, 16) });
    } catch (e) {
      setError(e.message || 'Error al crear el envío.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteJob(id) {
    if (!confirm('¿Cancelar este envío?')) return;
    await fetch(`${API_BASE}/email-jobs/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  async function runNow() {
    await fetch(`${API_BASE}/email-jobs/run-now`, { method: 'POST' });
    await onRefresh();
  }

  async function authorize() {
    const res = await fetch(`${API_BASE}/gmail/auth-url`);
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  const pendingJobs = emailJobs.filter(j => j.status === 'pending');
  const doneJobs = emailJobs.filter(j => j.status !== 'pending');

  return (
    <div className="flex flex-col gap-6">

      {/* Estado Gmail */}
      <div className={`rounded-[20px] p-5 flex items-center justify-between gap-4 ${gmailStatus?.authorized ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div>
          <strong className={gmailStatus?.authorized ? 'text-green-800' : 'text-amber-800'}>
            {gmailStatus?.authorized ? '✓ Gmail autorizado — listo para enviar' : '⚠ Gmail no autorizado'}
          </strong>
          {!gmailStatus?.authorized && (
            <p className="text-amber-700 text-sm m-0 mt-1">
              Necesitás autorizar tu cuenta de Gmail para enviar emails automáticamente.
            </p>
          )}
        </div>
        {!gmailStatus?.authorized && (
          <button
            type="button"
            onClick={authorize}
            className="bg-[#184e77] text-white rounded-[12px] px-5 py-2.5 font-semibold text-sm hover:opacity-90 cursor-pointer border-0 flex-shrink-0"
          >
            Autorizar Gmail
          </button>
        )}
      </div>

      {/* CVs */}
      <div className="bg-white rounded-[24px] p-6 border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">CV</span>
            <h3 className="m-0 mt-2 text-lg font-bold">Archivos de CV</h3>
          </div>
          <div className="flex gap-2">
            <input ref={cvInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={uploadCv} />
            <button
              type="button"
              onClick={() => cvInputRef.current?.click()}
              disabled={uploadingCv}
              className="bg-[#184e77] text-white rounded-[12px] px-4 py-2 font-semibold text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer border-0"
            >
              {uploadingCv ? 'Subiendo...' : '+ Subir CV'}
            </button>
          </div>
        </div>
        {cvFiles.length === 0 ? (
          <p className="text-[#597189] text-sm">Aún no subiste ningún CV. Subí uno para adjuntarlo en los envíos.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cvFiles.map(cv => (
              <div key={cv.id} className="flex items-center justify-between bg-[#f4f8fc] rounded-[12px] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#142433]">{cv.original_name}</span>
                  {cv.is_default === 1 && (
                    <span className="text-xs bg-[#4bb3fd]/15 text-[#184e77] px-2 py-0.5 rounded-full font-semibold">Por defecto</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!cv.is_default && (
                    <button type="button" onClick={() => setDefaultCv(cv.id)}
                      className="text-xs border border-[#184e77]/30 text-[#184e77] rounded-[8px] px-3 py-1 hover:bg-[#184e77]/5 cursor-pointer bg-white">
                      Usar por defecto
                    </button>
                  )}
                  <button type="button" onClick={() => deleteCv(cv.id)}
                    className="text-xs border border-red-200 text-red-500 rounded-[8px] px-3 py-1 hover:bg-red-50 cursor-pointer bg-white">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Envíos programados */}
      <div className="bg-white rounded-[24px] p-6 border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Envíos</span>
            <h3 className="m-0 mt-2 text-lg font-bold">Envíos programados</h3>
            <p className="text-sm text-[#142433]/60 m-0 mt-1">El sistema revisa y envía automáticamente cada 10 minutos.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={runNow}
              className="border border-[#184e77]/30 text-[#184e77] rounded-[12px] px-4 py-2 font-semibold text-sm hover:bg-[#184e77]/5 cursor-pointer bg-white">
              Enviar ahora
            </button>
            <button type="button" onClick={() => { setShowForm(true); setError(''); }}
              className="bg-[#184e77] text-white rounded-[12px] px-4 py-2 font-semibold text-sm hover:opacity-90 cursor-pointer border-0">
              + Programar envío
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-[#f4f8fc] rounded-[18px] p-5 mb-5 flex flex-col gap-3">
            <h4 className="m-0 font-bold text-[#142433]">Nuevo envío programado</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">Contacto *</label>
                <select className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white"
                  value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
                  <option value="">— Seleccioná —</option>
                  {contacts.filter(c => c.email).map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">Plantilla</label>
                <select className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white"
                  value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (por defecto)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">CV a adjuntar</label>
                <select className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white"
                  value={form.cv_file_id} onChange={e => setForm(f => ({ ...f, cv_file_id: e.target.value }))}>
                  <option value="">Sin adjunto</option>
                  {cvFiles.map(cv => (
                    <option key={cv.id} value={cv.id}>{cv.original_name}{cv.is_default ? ' (por defecto)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">Frecuencia de repetición</label>
                <select className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm bg-white"
                  value={form.frequency_days} onChange={e => setForm(f => ({ ...f, frequency_days: e.target.value }))}>
                  <option value="0">Solo una vez</option>
                  <option value="3">Cada 3 días</option>
                  <option value="7">Cada 7 días</option>
                  <option value="14">Cada 14 días</option>
                  <option value="30">Cada 30 días</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">Enviar el</label>
                <input type="datetime-local" className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm"
                  value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
            </div>
            {error && <p className="text-red-600 text-sm m-0">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={createJob} disabled={saving}
                className="bg-[#184e77] text-white rounded-[10px] px-5 py-2 font-semibold text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer border-0">
                {saving ? 'Guardando...' : 'Programar envío'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="bg-white border border-[#142433]/15 text-[#142433] rounded-[10px] px-5 py-2 font-semibold text-sm hover:bg-[#f4f8fc] cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {emailJobs.length === 0 ? (
          <p className="text-[#597189] text-sm">No hay envíos programados aún.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingJobs.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#597189] uppercase tracking-wide m-0">Pendientes ({pendingJobs.length})</p>
                {pendingJobs.map(j => <JobRow key={j.id} job={j} onDelete={deleteJob} />)}
              </>
            )}
            {doneJobs.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#597189] uppercase tracking-wide m-0 mt-2">Historial</p>
                {doneJobs.map(j => <JobRow key={j.id} job={j} onDelete={deleteJob} />)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JobRow({ job, onDelete }) {
  return (
    <div className="border border-[#142433]/10 rounded-[14px] px-4 py-3 flex items-center justify-between gap-3 bg-white">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-sm text-[#142433] truncate">
          {job.contact_name || '—'} <span className="text-[#597189] font-normal">— {job.contact_email}</span>
        </span>
        <span className="text-xs text-[#597189]">
          Plantilla: {job.template_name || 'por defecto'} · CV: {job.cv_name || 'sin adjunto'} ·{' '}
          {job.frequency_days > 0 ? `Cada ${job.frequency_days} días` : 'Una vez'}
        </span>
        {job.status === 'failed' && job.error_message && (
          <span className="text-xs text-red-600 truncate">{job.error_message}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-[#597189]">
          {job.status === 'sent' ? `Enviado ${formatDate(job.sent_at)}` : `Programado ${formatDate(job.scheduled_at)}`}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[job.status] || 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[job.status] || job.status}
        </span>
        {job.status === 'pending' && (
          <button type="button" onClick={() => onDelete(job.id)}
            className="text-xs border border-red-200 text-red-500 rounded-[8px] px-2 py-1 hover:bg-red-50 cursor-pointer bg-white">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}
