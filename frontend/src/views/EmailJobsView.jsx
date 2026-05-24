import { useRef, useState } from 'react';
import { API_BASE } from '../AppShell';
import { ConfirmModal } from '../components/ConfirmModal';

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
  const [uploadingCv, setUploadingCv] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingComment, setPendingComment] = useState('');
  const cvInputRef = useRef(null);
  const [confirmCv, setConfirmCv] = useState(null);    // cv id | null
  const [confirmJob, setConfirmJob] = useState(null);  // job id | null

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPendingComment('');
    e.target.value = '';
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setUploadingCv(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('comment', pendingComment.trim());
      await fetch(`${API_BASE}/cv-files`, { method: 'POST', body: fd });
      await onRefresh();
    } finally {
      setUploadingCv(false);
      setPendingFile(null);
      setPendingComment('');
    }
  }

  async function setDefaultCv(id) {
    await fetch(`${API_BASE}/cv-files/${id}/default`, { method: 'PUT' });
    await onRefresh();
  }

  function deleteCv(id) { setConfirmCv(id); }
  async function confirmDeleteCv() {
    const id = confirmCv;
    setConfirmCv(null);
    await fetch(`${API_BASE}/cv-files/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  function deleteJob(id) { setConfirmJob(id); }
  async function confirmDeleteJob() {
    const id = confirmJob;
    setConfirmJob(null);
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
      <ConfirmModal
        open={confirmCv !== null}
        title="Eliminar CV"
        message="¿Seguro que querés eliminar este archivo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteCv}
        onCancel={() => setConfirmCv(null)}
      />
      <ConfirmModal
        open={confirmJob !== null}
        title="Cancelar envío"
        message="¿Seguro que querés cancelar este envío programado?"
        confirmLabel="Cancelar envío"
        onConfirm={confirmDeleteJob}
        onCancel={() => setConfirmJob(null)}
      />

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
            <input ref={cvInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileSelected} />
            {!pendingFile && (
              <button
                type="button"
                onClick={() => cvInputRef.current?.click()}
                className="bg-[#184e77] text-white rounded-[12px] px-4 py-2 font-semibold text-sm hover:opacity-90 cursor-pointer border-0"
              >
                + Subir CV
              </button>
            )}
          </div>
        </div>

        {/* Formulario de comentario al subir */}
        {pendingFile && (
          <div className="bg-[#f4f8fc] rounded-[14px] p-4 mb-4 flex flex-col gap-3">
            <p className="m-0 text-sm font-semibold text-[#142433]">
              Archivo seleccionado: <span className="font-normal">{pendingFile.name}</span>
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#597189] uppercase tracking-wide">
                Comentario (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Oil & Gas, Instrumentación, Versión corta..."
                value={pendingComment}
                onChange={e => setPendingComment(e.target.value)}
                className="border border-[#142433]/15 rounded-[10px] px-3 py-2 text-sm"
                onKeyDown={e => e.key === 'Enter' && confirmUpload()}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmUpload}
                disabled={uploadingCv}
                className="bg-[#184e77] text-white rounded-[10px] px-4 py-2 font-semibold text-sm hover:opacity-90 disabled:opacity-50 cursor-pointer border-0"
              >
                {uploadingCv ? 'Subiendo...' : 'Subir'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingFile(null); setPendingComment(''); }}
                className="bg-white border border-[#142433]/15 text-[#142433] rounded-[10px] px-4 py-2 font-semibold text-sm hover:bg-[#f4f8fc] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cvFiles.length === 0 ? (
          <p className="text-[#597189] text-sm">Aún no subiste ningún CV. Subí uno para adjuntarlo en los envíos.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cvFiles.map(cv => (
              <CvRow key={cv.id} cv={cv} onSetDefault={setDefaultCv} onDelete={deleteCv} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>

      {/* Cola de envíos */}
      <div className="bg-white rounded-[24px] p-6 border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Envíos</span>
            <h3 className="m-0 mt-2 text-lg font-bold">Cola de envíos</h3>
            <p className="text-sm text-[#142433]/60 m-0 mt-1">
              Los envíos se crean automáticamente al confirmar contactos con acción <em>Enviar</em> o <em>Seguir</em>. El sistema revisa cada 10 minutos.
            </p>
          </div>
          <button type="button" onClick={runNow}
            className="border border-[#184e77]/30 text-[#184e77] rounded-[12px] px-4 py-2 font-semibold text-sm hover:bg-[#184e77]/5 cursor-pointer bg-white">
            Enviar ahora
          </button>
        </div>

        {emailJobs.length === 0 ? (
          <p className="text-[#597189] text-sm">No hay envíos en la cola aún.</p>
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

function CvRow({ cv, onSetDefault, onDelete, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(cv.comment || '');
  const [saving, setSaving] = useState(false);

  async function saveComment() {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/cv-files/${cv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      await onRefresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between bg-[#f4f8fc] rounded-[12px] px-4 py-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-sm font-medium text-[#142433] truncate">{cv.original_name}</span>
        {editing ? (
          <input
            autoFocus
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveComment(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Agregar comentario..."
            className="border border-[#184e77]/30 rounded-[8px] px-2 py-0.5 text-xs w-44"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setComment(cv.comment || ''); setEditing(true); }}
            className="text-xs text-[#597189] italic hover:text-[#184e77] cursor-pointer bg-transparent border-0 p-0"
            title="Editar comentario"
          >
            {cv.comment ? cv.comment : '+ comentario'}
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={saveComment}
            disabled={saving}
            className="text-xs bg-[#184e77] text-white rounded-[6px] px-2 py-0.5 border-0 cursor-pointer disabled:opacity-50"
          >
            {saving ? '...' : 'OK'}
          </button>
        )}
        {cv.is_default === 1 && (
          <span className="text-xs bg-[#4bb3fd]/15 text-[#184e77] px-2 py-0.5 rounded-full font-semibold">Por defecto</span>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {!cv.is_default && (
          <button type="button" onClick={() => onSetDefault(cv.id)}
            className="text-xs border border-[#184e77]/30 text-[#184e77] rounded-[8px] px-3 py-1 hover:bg-[#184e77]/5 cursor-pointer bg-white">
            Usar por defecto
          </button>
        )}
        <button type="button" onClick={() => onDelete(cv.id)}
          className="text-xs border border-red-200 text-red-500 rounded-[8px] px-3 py-1 hover:bg-red-50 cursor-pointer bg-white">
          Eliminar
        </button>
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
