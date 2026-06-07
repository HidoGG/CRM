import { useEffect } from 'react';

const modalStyle = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
  padding: 32,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  width: '100%',
  maxWidth: 384,
  margin: '0 16px',
  animation: 'modalIn 0.18s cubic-bezier(.4,0,.2,1)',
};

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.60)',
  backdropFilter: 'blur(3px)',
};

const MODAL_KEYFRAMES = `
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.94) translateY(8px); }
    to   { opacity: 1; transform: scale(1)   translateY(0);    }
  }
`;

export function InfoModal({ open, title, message, onClose }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {title && (
          <h2 id="info-modal-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h2>
        )}
        {message && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {message}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            className="primary-button"
            aria-label="Cerrar"
          >
            Entendido
          </button>
        </div>
      </div>
      <style>{MODAL_KEYFRAMES}</style>
    </div>
  );
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Eliminar', confirmDanger = true, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onCancel} role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {title && (
          <h2 id="confirm-modal-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h2>
        )}
        {message && (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            className="ghost-button"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmDanger ? 'ghost-button' : 'primary-button'}
            style={confirmDanger ? { color: 'var(--red-text)', borderColor: 'var(--red-text)' } : {}}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{MODAL_KEYFRAMES}</style>
    </div>
  );
}
