import { useRef, useState } from 'react';
import { API_BASE, apiFetch } from '../lib/api';
import { ConfirmModal, InfoModal } from '../components/ConfirmModal';

export function EmailJobsView({ cvFiles, gmailStatus, onRefresh }) {
  const [uploadingCv, setUploadingCv]   = useState(false);
  const [uploadError, setUploadError]   = useState('');
  const [pendingFile, setPendingFile]   = useState(null);
  const [pendingComment, setPendingComment] = useState('');
  const cvInputRef = useRef(null);
  const [confirmCv, setConfirmCv]   = useState(null);
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

  function deleteCv(id) { setConfirmCv(id); }
  async function confirmDeleteCv() {
    const id = confirmCv;
    setConfirmCv(null);
    await apiFetch(`${API_BASE}/cv-files/${id}`, { method: 'DELETE' });
    await onRefresh('cvs');
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

  return (
    <div className="flex flex-col gap-5">
      {/* Modales */}
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
              <CvRow key={cv.id} cv={cv} onDelete={deleteCv} onRefresh={() => onRefresh('cvs')} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function CvRow({ cv, onDelete, onRefresh }) {
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

      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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

