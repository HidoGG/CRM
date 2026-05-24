import { useEffect } from 'react';

export function InfoModal({ open, title, message, onClose }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,22,33,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl p-8 flex flex-col gap-5 w-full max-w-sm mx-4"
        style={{ animation: 'modalIn 0.18s cubic-bezier(.4,0,.2,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {title && <h2 className="m-0 text-lg font-bold text-[#142433]">{title}</h2>}
        {message && <div className="text-[#597189] text-sm leading-relaxed">{message}</div>}
        <div className="flex justify-end mt-1">
          <button
            type="button"
            onClick={onClose}
            className="bg-[#184e77] text-white rounded-[12px] px-6 py-2.5 font-semibold text-sm hover:opacity-90 cursor-pointer border-0"
          >
            Entendido
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
      `}</style>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,22,33,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl p-8 flex flex-col gap-5 w-full max-w-sm mx-4"
        style={{ animation: 'modalIn 0.18s cubic-bezier(.4,0,.2,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {title && <h2 className="m-0 text-lg font-bold text-[#142433]">{title}</h2>}
        {message && <p className="m-0 text-[#597189] text-sm leading-relaxed">{message}</p>}
        <div className="flex gap-3 justify-end mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[#142433]/15 text-[#142433] bg-white rounded-[12px] px-5 py-2.5 font-semibold text-sm hover:bg-[#f4f8fc] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-[12px] px-5 py-2.5 font-semibold text-sm cursor-pointer border-0 ${
              confirmDanger
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-[#184e77] text-white hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
      `}</style>
    </div>
  );
}
