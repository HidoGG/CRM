import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSectorDefaults, useTemplates, useCvFiles } from '../lib/queries';
import { patchSectorDefault } from '../lib/api';
import { SECTORS } from './SectorBadge';

export function SectorDefaultsPanel() {
  const queryClient = useQueryClient();
  const sectorDefaults = useSectorDefaults().data || [];
  const templates = useTemplates().data || [];
  const cvFiles = useCvFiles().data || [];

  const [saving, setSaving] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});

  function getVal(sector, field) {
    if (localOverrides[sector]?.[field] !== undefined) return localOverrides[sector][field];
    const sd = sectorDefaults.find(d => d.sector === sector);
    return sd?.[field] ?? '';
  }

  function setVal(sector, field, value) {
    setLocalOverrides(prev => ({
      ...prev,
      [sector]: { ...(prev[sector] || {}), [field]: value === '' ? null : Number(value) },
    }));
  }

  async function save(sectorKey) {
    setSaving(sectorKey);
    try {
      const templateId = getVal(sectorKey, 'template_id') || null;
      const cvFileId = getVal(sectorKey, 'cv_file_id') || null;
      await patchSectorDefault(sectorKey, templateId, cvFileId);
      await queryClient.invalidateQueries({ queryKey: ['sectorDefaults'] });
      setLocalOverrides(prev => { const n = { ...prev }; delete n[sectorKey]; return n; });
    } catch {
      // error visible via disabled state
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Configuración de rubros</h2>
          <p>Asigná la plantilla y el CV que se usarán automáticamente según el rubro de la empresa.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {SECTORS.map(s => {
          const templateId = getVal(s.key, 'template_id');
          const cvFileId = getVal(s.key, 'cv_file_id');
          const sd = sectorDefaults.find(d => d.sector === s.key);
          const isDirty =
            localOverrides[s.key]?.template_id !== undefined ||
            localOverrides[s.key]?.cv_file_id !== undefined;

          return (
            <div
              key={s.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: 'var(--surface-subtle)',
                borderRadius: 12,
                border: '1px solid var(--border-faint)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.3rem' }}>{s.emoji}</span>
                <div>
                  <strong style={{ fontSize: '0.87rem', color: 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>
                    {s.key === 'oilgas' ? 'Petróleo & Gas' :
                     s.key === 'industria' ? 'Industria' :
                     s.key === 'generalista' ? 'Generalista' : 'Tecnología'}
                  </strong>
                  {sd?.template_name && !isDirty && (
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {sd.template_name}
                    </small>
                  )}
                </div>
              </div>

              <div className="detail-field" style={{ margin: 0 }}>
                <span>Plantilla</span>
                <select
                  value={templateId ?? ''}
                  onChange={e => setVal(s.key, 'template_id', e.target.value)}
                >
                  <option value="">Sin plantilla</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="detail-field" style={{ margin: 0 }}>
                <span>CV adjunto</span>
                <select
                  value={cvFileId ?? ''}
                  onChange={e => setVal(s.key, 'cv_file_id', e.target.value)}
                >
                  <option value="">Sin CV</option>
                  {cvFiles.map(c => (
                    <option key={c.id} value={c.id}>{c.original_name}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() => save(s.key)}
                disabled={saving === s.key || !isDirty}
                style={{ whiteSpace: 'nowrap', opacity: isDirty ? 1 : 0.45 }}
              >
                {saving === s.key ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
