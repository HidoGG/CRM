import { useEffect, useState } from 'react';
import { capitalize, prettifyAction } from '../lib/utils';
import { useSchedules } from '../lib/queries';
import { SECTORS } from './SectorBadge';

const STATUS_OPTIONS = ['mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const ACTION_OPTIONS = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

function FormField({ label, value, onChange }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="new-password"
        aria-label={label}
      />
    </div>
  );
}

/** Formulario de alta de contacto — compartido entre la pestaña de Contactos
 *  y la ventana emergente del botón "Nuevo contacto". */
export function ContactForm({ form, onFormChange, onSubmit, onCancel, saving }) {
  const schedules = useSchedules().data || [];
  const defaultSchedule = schedules.find(s => s.is_default) ?? schedules[0];

  return (
    <form
      style={{ background: 'var(--surface-raised)', borderRadius: 24, border: '1px solid var(--border-faint)', padding: 32, display: 'grid', gap: 16, width: '100%', maxWidth: 560 }}
      onSubmit={onSubmit}
      autoComplete="off"
      aria-label="Formulario de nuevo contacto"
    >
      <div>
        <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Nuevo contacto</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
          Completá los datos y definile una acción inicial. El rubro se detecta solo por el nombre de la empresa.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Nombre"  value={form.name}    onChange={v => onFormChange({ ...form, name: v })}    />
        <FormField label="Email"   value={form.email}   onChange={v => onFormChange({ ...form, email: v })}   />
        <FormField label="Empresa" value={form.company} onChange={v => onFormChange({ ...form, company: v })} />
        <FormField label="Cargo"   value={form.title}   onChange={v => onFormChange({ ...form, title: v })}   />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="detail-field">
          <span>Estado</span>
          <select
            value={form.status}
            onChange={e => onFormChange({ ...form, status: e.target.value })}
            aria-label="Estado del contacto"
          >
            {STATUS_OPTIONS.map(f => (
              <option key={f} value={f}>{capitalize(f)}</option>
            ))}
          </select>
        </div>
        <div className="detail-field">
          <span>Acción inicial</span>
          <select
            value={form.next_action}
            onChange={e => onFormChange({ ...form, next_action: e.target.value })}
            aria-label="Acción inicial para el contacto"
          >
            {ACTION_OPTIONS.map(a => (
              <option key={a} value={a}>{prettifyAction(a)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="detail-field">
        <span>Rubro</span>
        <select
          value={form.industry || ''}
          onChange={e => onFormChange({ ...form, industry: e.target.value || null })}
          aria-label="Rubro de la empresa"
        >
          <option value="">Detectar automáticamente por empresa</option>
          {SECTORS.map(s => (
            <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>
          ))}
        </select>
      </div>

      <div className="detail-field">
        <span>Cronograma de envío</span>
        <select
          value={form.schedule_id ?? defaultSchedule?.id ?? ''}
          onChange={e => onFormChange({ ...form, schedule_id: e.target.value ? Number(e.target.value) : null })}
          aria-label="Cronograma de envío"
        >
          <option value="">Sin cronograma (inmediato)</option>
          {schedules.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.is_default ? ' (por defecto)' : ''} — {String(s.start_hour_art).padStart(2, '0')}:00–{String(s.end_hour_art).padStart(2, '0')}:00 ART
            </option>
          ))}
        </select>
      </div>

      <div className="detail-field">
        <span>Notas</span>
        <textarea
          rows="4"
          style={{ resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', background: 'var(--surface-input)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', lineHeight: 1.6 }}
          value={form.notes}
          onChange={e => onFormChange({ ...form, notes: e.target.value })}
          aria-label="Notas del contacto"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar contacto'}
        </button>
      </div>
    </form>
  );
}

/** Ventana emergente del botón "Nuevo contacto" de la barra superior.
 *
 *  Fases: formulario → cargando → resultado (éxito con "Aceptar" que cierra,
 *  o error con el motivo y "Volver al formulario" con los datos intactos). */
export function NewContactModal({ form, onFormChange, onSubmit, onClose, saving }) {
  const [phase, setPhase] = useState('form'); // 'form' | 'saving' | 'done'
  const [result, setResult] = useState(null); // { ok, error, company }

  // Cerrar con Escape (salvo mientras está guardando)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && phase !== 'saving') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  async function handleFormSubmit(e) {
    e.preventDefault();
    const company = (form.company || '').trim() || (form.email || '').trim() || 'el contacto';
    setResult({ company });
    setPhase('saving');
    const res = await onSubmit(e);
    setResult({ ok: Boolean(res?.ok), error: res?.error, company });
    setPhase('done');
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5vh 16px 16px',
        overflowY: 'auto',
      }}
      onClick={() => { if (phase !== 'saving') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo contacto"
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560 }}>

        {phase === 'form' && (
          <ContactForm
            form={form}
            onFormChange={onFormChange}
            onSubmit={handleFormSubmit}
            onCancel={onClose}
            saving={saving}
          />
        )}

        {phase === 'saving' && (
          <div style={{ background: 'var(--surface-raised)', borderRadius: 24, border: '1px solid var(--border-faint)', padding: '48px 32px', display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '2rem' }} aria-hidden="true">⏳</span>
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              Cargando contacto…
            </h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              {result?.company || 'Guardando los datos'}
            </p>
          </div>
        )}

        {phase === 'done' && result?.ok && (
          <div style={{ background: 'var(--surface-raised)', borderRadius: 24, border: '1px solid var(--green-text)', padding: '40px 32px', display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '2.2rem' }} aria-hidden="true">✅</span>
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--green-text)', fontSize: '1.1rem' }}>
              ¡Carga exitosa!
            </h3>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>
              {result.company}
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              El contacto quedó guardado y ya aparece en tu base.
            </p>
            <button type="button" className="primary-button" style={{ marginTop: 8, minWidth: 140 }} onClick={onClose}>
              Aceptar
            </button>
          </div>
        )}

        {phase === 'done' && !result?.ok && (
          <div style={{ background: 'var(--surface-raised)', borderRadius: 24, border: '1px solid var(--red-text)', padding: '40px 32px', display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: '2.2rem' }} aria-hidden="true">❌</span>
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--red-text)', fontSize: '1.1rem' }}>
              No se pudo cargar
            </h3>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>
              {result?.company}
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 380 }}>
              {result?.error || 'Ocurrió un error desconocido.'}
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 8, minWidth: 180 }}
              onClick={() => setPhase('form')}
            >
              Volver al formulario
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
