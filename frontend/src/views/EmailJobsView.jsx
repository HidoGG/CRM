import { useRef, useState } from 'react';
import { API_BASE, apiFetch } from '../lib/api';
import { ConfirmModal, InfoModal } from '../components/ConfirmModal';

const STATUS_LABEL = { pending: 'Pendiente', sent: 'Enviado', failed: 'Fallido', processing: 'Procesando' };

const STATUS_STYLE = {
  pending:    { background: 'var(--amber-bg)',  color: 'var(--amber-text)' },
  sent:       { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  failed:     { background: 'var(--red-bg)',    color: 'var(--red-text)'   },
  processing: { background: 'var(--blue-subtle)', color: 'var(--blue)'    },
};

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

export function EmailJobsView({ contacts, templates, emailJobs, cvFiles, gmailStatus, onRefresh }) {
  const [uploadingCv, setUploadingCv]   = useState(false);
  const [uploadError, setUploadError]   = useState('');
  const [pendingFile, setPendingFile]   = useState(null);
  const [pendingComment, setPendingComment] = useState('');
  const cvInputRef = useRef(null);
  const [confirmCv, setConfirmCv]   = useState(null);
  const [confirmJob, setConfirmJob] = useState(null);
  const [runResult, setRunResult]   = useState(null);
  const [authError, setAuthError]   = useState('');

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
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('comment', pendingComment.trim());
      const res = await apiFetch(`${API_BASE}/cv-files`, { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadError(body.detail || `Error ${res.status} al subir el CV`);
        return;
      }
      await onRefresh('cvs');
      setPendingFile(null);
      setPendingComment('');
    } catch (e) {
      setUploadError(`No se pudo conectar con el servidor: ${e.message}`);
    } finally {
      setUploadingCv(false);
    }
  }

  async function setDefaultCv(id) {
    await apiFetch(`${API_BASE}/cv-files/${id}/default`, { method: 'PUT' });
    await onRefresh('cvs');
  }

  function deleteCv(id) { setConfirmCv(id); }
  async function confirmDeleteCv() {
    const id = confirmCv;
    setConfirmCv(null);
    await apiFetch(`${API_BASE}/cv-files/${id}`, { method: 'DELETE' });
    await onRefresh('cvs');
  }

  function deleteJob(id) { setConfirmJob(id); }
  async function confirmDeleteJob() {
    const id = confirmJob;
    setConfirmJob(null);
    await apiFetch(`${API_BASE}/email-jobs/${id}`, { method: 'DELETE' });
    await onRefresh('jobs');
  }

  async function runNow() {
    const res  = await apiFetch(`${API_BASE}/email-jobs/run-now`, { method: 'POST' });
    const data = res.ok ? await res.json() : { sent: 0, failed: 0 };
    await onRefresh('jobs');
    setRunResult(data);
  }

  async function retryFailed() {
    const res  = await apiFetch(`${API_BASE}/email-jobs/retry-failed`, { method: 'POST' });
    const data = res.ok ? await res.json() : { retried: 0 };
    await onRefresh('jobs');
    setRunResult({ sent: 0, failed: 0, retried: data.retried });
  }

  async function assignDefaultCv() {
    const res  = await apiFetch(`${API_BASE}/email-jobs/assign-default-cv`, { method: 'POST' });
    const data = res.ok ? await res.json() : { updated: 0 };
    await onRefresh('jobs');
    setRunResult({ sent: 0, failed: 0, assigned: data.updated });
  }

  async function authorize() {
    try {
      const res = await apiFetch(`${API_BASE}/gmail/auth-url`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAuthError(`Error al obtener URL de autorización: ${body.detail || res.status}`);
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      setAuthError(`No se pudo conectar con el servidor: ${e.message}`);
    }
  }

  const pendingJobs = emailJobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const doneJobs    = emailJobs.filter(j => j.status !== 'pending' && j.status !== 'processing');
  const failedCount = emailJobs.filter(j => j.status === 'failed').length;
  const hasPendingOrFailed = emailJobs.some(j => j.status === 'pending' || j.status === 'failed');

  /* ─── Textos de resultado ─── */
  function resultTitle() {
    if (runResult?.assigned != null) return runResult.assigned > 0 ? 'CV asignado' : 'Sin jobs para actualizar';
    if (runResult?.retried > 0)      return 'Jobs reactivados';
    if (runResult?.retried === 0 && runResult?.sent === 0 && runResult?.failed === 0) return 'Sin fallidos';
    if (runResult?.sent > 0 && runResult?.failed === 0) return 'Correos enviados';
    if (runResult?.sent === 0 && runResult?.failed === 0) return 'Sin envíos pendientes';
    if (runResult?.sent > 0) return 'Envíos con errores';
    return 'Fallo en el envío';
  }

  function resultMessage() {
    if (runResult?.assigned != null)
      return runResult.assigned > 0
        ? `CV por defecto asignado a ${runResult.assigned} job(s). Ahora presioná "Reintentar fallidos" o "Enviar ahora".`
        : 'Todos los jobs ya tienen un CV válido asignado.';
    if (runResult?.retried > 0)
      return `${runResult.retried} job(s) reseteados a pendiente. El scheduler los procesa en el próximo ciclo. También podés presionar "Enviar ahora".`;
    if (runResult?.retried === 0 && runResult?.sent === 0 && runResult?.failed === 0)
      return 'No hay jobs fallidos para reintentar.';
    if (runResult?.sent > 0 && runResult?.failed === 0)
      return `Se enviaron correctamente ${runResult.sent} correo(s). Revisá tu bandeja de entrada.`;
    if (runResult?.sent === 0 && runResult?.failed === 0)
      return 'No había correos pendientes de envío ahora.';
    if (runResult?.sent > 0)
      return `Se enviaron ${runResult.sent} correos, pero ${runResult.failed} fallaron. Revisá los detalles en la cola.`;
    return 'No se pudo enviar. Revisá el estado de Gmail o los detalles del error en la cola.';
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Modales */}
      <InfoModal
        open={runResult !== null}
        title={resultTitle()}
        message={<p className="m-0">{resultMessage()}</p>}
        onClose={() => setRunResult(null)}
      />
      <InfoModal
        open={Boolean(authError)}
        title="Error de autorización"
        message={<p className="m-0">{authError}</p>}
        onClose={() => setAuthError('')}
      />
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

      {/* ── Estado Gmail ── */}
      <section
        aria-label="Estado de Gmail"
        style={{
          background: gmailStatus?.authorized ? 'var(--green-bg)' : 'var(--amber-bg)',
          border: `1px solid ${gmailStatus?.authorized ? 'var(--green-text)' : 'var(--amber-text)'}`,
          borderRadius: 16,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          opacity: 0.95,
        }}
      >
        <div>
          <strong style={{ color: gmailStatus?.authorized ? 'var(--green-text)' : 'var(--amber-text)', fontSize: '0.95rem' }}>
            {gmailStatus?.authorized ? '✓ Gmail autorizado — listo para enviar' : '⚠ Gmail no autorizado'}
          </strong>
          {!gmailStatus?.authorized && (
            <p style={{ color: 'var(--amber-text)', fontSize: '0.87rem', margin: '4px 0 0', opacity: 0.85 }}>
              Necesitás autorizar tu cuenta de Gmail para enviar emails automáticamente.
            </p>
          )}
        </div>
        {!gmailStatus?.authorized && (
          <button
            type="button"
            onClick={authorize}
            className="primary-button flex-shrink-0"
            aria-label="Autorizar cuenta de Gmail"
          >
            Autorizar Gmail
          </button>
        )}
      </section>

      {/* ── CVs ── */}
      <section aria-labelledby="cvs-heading" className="card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Archivos</span>
            <h3 id="cvs-heading" className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              CVs subidos
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              ref={cvInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileSelected}
              aria-label="Seleccionar archivo de CV"
            />
            {!pendingFile && (
              <button
                type="button"
                onClick={() => cvInputRef.current?.click()}
                className="primary-button"
                aria-label="Seleccionar CV para subir"
              >
                + Subir CV
              </button>
            )}
          </div>
        </div>

        {/* Formulario de confirmación de CV */}
        {pendingFile && (
          <div
            style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            role="form"
            aria-label="Confirmar subida de CV"
          >
            <p className="m-0 text-sm" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              Seleccionado: <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{pendingFile.name}</span>
            </p>
            <div className="detail-field">
              <span>Comentario (opcional)</span>
              <input
                type="text"
                placeholder="Ej: Oil & Gas, Instrumentación, Versión corta..."
                value={pendingComment}
                onChange={e => setPendingComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmUpload()}
                aria-label="Comentario del CV"
              />
            </div>
            {uploadError && (
              <p style={{ margin: 0, color: 'var(--red-text)', fontSize: '0.85rem', fontWeight: 500 }}>
                {uploadError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmUpload}
                disabled={uploadingCv}
                className="primary-button"
              >
                {uploadingCv ? 'Subiendo…' : 'Confirmar subida'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingFile(null); setPendingComment(''); setUploadError(''); }}
                className="ghost-button"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cvFiles.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No subiste ningún CV aún. Subí uno para adjuntarlo en los envíos.
          </p>
        ) : (
          <div className="flex flex-col gap-2" role="list" aria-label="Lista de CVs">
            {cvFiles.map(cv => (
              <CvRow key={cv.id} cv={cv} onSetDefault={setDefaultCv} onDelete={deleteCv} onRefresh={() => onRefresh('cvs')} />
            ))}
          </div>
        )}
      </section>

      {/* ── Cola de envíos ── */}
      <section aria-labelledby="jobs-heading" className="card">
        <div className="section-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="eyebrow">Automático · cada 10 min · Lun–Sáb</span>
            <h3 id="jobs-heading" className="m-0 font-bold" style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginTop: 4 }}>
              Cola de envíos
            </h3>
          </div>
          <div className="flex gap-2 flex-wrap" role="toolbar" aria-label="Acciones de envío">
            <button
              type="button"
              onClick={runNow}
              className="ghost-button"
              aria-label="Procesar envíos pendientes ahora"
            >
              Enviar ahora
            </button>
            {failedCount > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                className="ghost-button"
                style={{ color: 'var(--red-text)', borderColor: 'var(--red-text)' }}
                aria-label={`Reintentar los ${failedCount} envíos fallidos`}
              >
                Reintentar fallidos ({failedCount})
              </button>
            )}
            {hasPendingOrFailed && (
              <button
                type="button"
                onClick={assignDefaultCv}
                className="ghost-button"
                aria-label="Asignar CV por defecto a todos los jobs pendientes y fallidos"
              >
                Adjuntar CV por defecto
              </button>
            )}
          </div>
        </div>

        {emailJobs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No hay envíos en la cola. Se crean al confirmar contactos con acción <em>Enviar</em>.
          </p>
        ) : (
          <div className="flex flex-col gap-4" role="list" aria-label="Cola de envíos">
            {pendingJobs.length > 0 && (
              <div>
                <p className="eyebrow mb-2">Pendientes ({pendingJobs.length})</p>
                <div className="flex flex-col gap-2">
                  {pendingJobs.map(j => <JobRow key={j.id} job={j} onDelete={deleteJob} />)}
                </div>
              </div>
            )}
            {doneJobs.length > 0 && (
              <div>
                <p className="eyebrow mb-2">Historial</p>
                <div className="flex flex-col gap-2">
                  {doneJobs.map(j => <JobRow key={j.id} job={j} onDelete={deleteJob} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CvRow({ cv, onSetDefault, onDelete, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(cv.comment || '');
  const [saving, setSaving]   = useState(false);

  async function saveComment() {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/cv-files/${cv.id}`, {
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
    <div
      role="listitem"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface-subtle)',
        border: '1px solid var(--border-faint)',
        borderRadius: 10,
        padding: '10px 14px',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cv.original_name}
        </span>

        {editing ? (
          <input
            autoFocus
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveComment(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Agregar comentario..."
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: '0.82rem', background: 'var(--surface-input)', color: 'var(--text-primary)', width: 180 }}
            aria-label="Comentario del CV"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setComment(cv.comment || ''); setEditing(true); }}
            style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontStyle: 'italic' }}
            aria-label={cv.comment ? `Editar comentario: ${cv.comment}` : 'Agregar comentario'}
          >
            {cv.comment || '+ comentario'}
          </button>
        )}

        {editing && (
          <button
            type="button"
            onClick={saveComment}
            disabled={saving}
            className="primary-button"
            style={{ padding: '3px 10px', fontSize: '0.82rem' }}
          >
            {saving ? '…' : 'OK'}
          </button>
        )}

        {cv.is_default === 1 && (
          <span
            style={{ fontSize: '0.78rem', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}
            aria-label="CV por defecto"
          >
            Por defecto
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!cv.is_default && (
          <button
            type="button"
            onClick={() => onSetDefault(cv.id)}
            className="ghost-button"
            style={{ fontSize: '0.82rem', padding: '5px 12px' }}
            aria-label={`Usar ${cv.original_name} como CV por defecto`}
          >
            Usar por defecto
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(cv.id)}
          className="ghost-button"
          style={{ fontSize: '0.82rem', padding: '5px 12px', color: 'var(--red-text)', borderColor: 'var(--red-text)' }}
          aria-label={`Eliminar CV ${cv.original_name}`}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function JobRow({ job, onDelete }) {
  const statusStyle = STATUS_STYLE[job.status] || STATUS_STYLE.pending;

  return (
    <div
      role="listitem"
      style={{
        border: '1px solid var(--border-faint)',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.contact_name || '—'}{' '}
          <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>— {job.contact_email}</span>
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Plantilla: {job.template_name || 'por defecto'} · CV: {job.cv_name || 'sin adjunto'} ·{' '}
          {job.frequency_days > 0 ? `Cada ${job.frequency_days} días` : 'Una vez'}
        </span>
        {job.status === 'failed' && job.error_message && (
          <span
            style={{ fontSize: '0.8rem', color: 'var(--red-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}
            title={job.error_message}
          >
            {job.error_message}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {job.status === 'sent' ? `Enviado ${formatDate(job.sent_at)}` : `Programado ${formatDate(job.scheduled_at)}`}
        </span>
        <span
          style={{ ...statusStyle, fontSize: '0.78rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
          aria-label={`Estado: ${STATUS_LABEL[job.status] || job.status}`}
        >
          {STATUS_LABEL[job.status] || job.status}
        </span>
        {(job.status === 'pending' || job.status === 'processing') && (
          <button
            type="button"
            onClick={() => onDelete(job.id)}
            className="ghost-button"
            style={{ fontSize: '0.8rem', padding: '4px 10px', color: 'var(--red-text)', borderColor: 'var(--red-text)' }}
            aria-label={`Cancelar envío a ${job.contact_email}`}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
