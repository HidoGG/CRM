import { useState } from 'react';
import { capitalize, formatDate, prettifyAction } from '../lib/utils';
import { useCapabilities, useCvFiles, useSchedules, useTemplates } from '../lib/queries';

const filterOptions = ['todos', 'mantener', 'revisar', 'seguimiento', 'prioridad', 'sacar', 'portal'];
const actionOptions = ['enviar', 'seguir', 'portal', 'descartar', 'revisar_manual'];

export function ImportsView({
  imports,
  importPreview,
  selectedFile,
  importing,
  confirming,
  onFileChange,
  onCandidateChange,
  onConfirm,
  onClearPreview,
}) {
  const capabilities = useCapabilities().data ?? { openai_enabled: false };
  const templates = useTemplates().data || [];
  const cvFiles = useCvFiles().data || [];
  const schedules = useSchedules().data || [];
  const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0];
  const defaultCv = cvFiles.find((c) => c.is_default) ?? cvFiles[0];
  const defaultSchedule = schedules.find((s) => s.is_default) ?? schedules[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedCvId, setSelectedCvId] = useState(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('todos');

  function handleConfirm() {
    const scheduleId = selectedScheduleId === ''
      ? null
      : (selectedScheduleId != null ? Number(selectedScheduleId) : (defaultSchedule?.id ?? null));
    onConfirm({
      templateId: selectedTemplateId ?? defaultTemplate?.id ?? null,
      cvFileId: selectedCvId ?? defaultCv?.id ?? null,
      scheduleId,
    });
  }
  return (
    <section className="page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Importador inteligente</h2>
            <p>Subi un archivo, revisa la deteccion y confirma solo lo que te sirva.</p>
          </div>
          <span className="pill pill-soft">{selectedFile ? selectedFile.name : 'Sin archivo cargado'}</span>
        </div>

        <div className="provider-row">
          <span className={`provider-pill ${capabilities.openai_enabled ? 'is-ready' : ''}`}>
            OCR: {capabilities.openai_enabled ? 'OpenAI activo' : 'OPENAI_API_KEY ausente'}
          </span>
          <span className={`provider-pill ${capabilities.openai_enabled ? 'is-ready' : ''}`}>
            Clasificacion: {capabilities.openai_enabled ? 'OpenAI + heuristica' : 'Heuristica local'}
          </span>
        </div>

        <div className="import-dropzone">
          <label className="upload-panel">
            <strong>{importing ? 'Analizando...' : 'Elegir archivo'}</strong>
            <span>Acepta txt, csv, xlsx, pdf con texto e imagenes para futura capa OCR.</span>
            <input
              type="file"
              accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              onChange={onFileChange}
              hidden
            />
          </label>
        </div>

        {importPreview && (
          <div className="preview-stack">
            {/* KPIs — el de duplicados se resalta si hay alguno */}
            <div className="mini-kpis">
              <div>
                <strong>{importPreview.stats.total_contacts}</strong>
                <span>detectados</span>
              </div>
              <div>
                <strong style={{ color: 'var(--green)' }}>{importPreview.stats.total_ready}</strong>
                <span>listos</span>
              </div>
              <div>
                <strong style={{ color: importPreview.stats.total_duplicates > 0 ? 'var(--amber-text)' : undefined }}>
                  {importPreview.stats.total_duplicates}
                </strong>
                <span>duplicados</span>
              </div>
              <div>
                <strong style={{ color: importPreview.stats.total_invalid > 0 ? 'var(--red-text)' : undefined }}>
                  {importPreview.stats.total_invalid}
                </strong>
                <span>invalidos</span>
              </div>
            </div>

            <div className="provider-row">
              <span className="provider-pill is-ready">Motor usado: {importPreview.provider}</span>
              <span className="provider-pill is-ready">
                Clasificacion: {importPreview.classification_provider}
              </span>
            </div>

            {/* Banner de aviso cuando hay duplicados */}
            {importPreview.stats.total_duplicates > 0 && (
              <div style={{
                background: 'var(--amber-bg)',
                border: '1px solid var(--amber-text)',
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.88rem',
                color: 'var(--amber-text)',
                fontWeight: 500,
              }}>
                <span style={{ fontSize: '1.1rem' }}>⚠</span>
                <span>
                  Se detectaron <strong>{importPreview.stats.total_duplicates}</strong> contacto
                  {importPreview.stats.total_duplicates !== 1 ? 's' : ''} duplicado
                  {importPreview.stats.total_duplicates !== 1 ? 's' : ''} — ya están en tu base de datos y no se importarán.
                </span>
              </div>
            )}

            {importPreview.warnings?.length ? (
              <div className="warning-box">
                {importPreview.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            {/* Filtro de candidatos */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { key: 'todos',     label: `Todos (${importPreview.candidates.length})` },
                { key: 'approve',   label: `Listos (${importPreview.stats.total_ready})` },
                { key: 'duplicate', label: `Duplicados (${importPreview.stats.total_duplicates})` },
                { key: 'invalid',   label: `Inválidos (${importPreview.stats.total_invalid})` },
                { key: 'skip',      label: 'Omitidos' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreviewFilter(key)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 7,
                    border: '1px solid var(--border-faint)',
                    background: previewFilter === key ? 'var(--accent)' : 'var(--surface-subtle)',
                    color: previewFilter === key ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    fontWeight: previewFilter === key ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>Contacto</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th>Accion</th>
                    <th>Sugerencia</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.candidates
                    .filter(c => previewFilter === 'todos' || c.decision === previewFilter)
                    .map((candidate) => (
                    <tr
                      key={candidate.id}
                      style={
                        candidate.decision === 'duplicate'
                          ? { background: 'var(--amber-bg)' }
                          : candidate.decision === 'invalid'
                          ? { background: 'var(--red-bg)' }
                          : candidate.decision === 'skip'
                          ? { background: 'var(--surface-subtle)', opacity: 0.7 }
                          : undefined
                      }
                    >
                      <td>
                        <select
                          value={candidate.decision}
                          onChange={(event) => onCandidateChange(candidate.id, 'decision', event.target.value)}
                        >
                          <option value="approve">Aprobar</option>
                          <option value="skip">Omitir</option>
                          <option value="duplicate">Duplicado</option>
                          <option value="invalid">Invalido</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.name || ''}
                          onChange={(event) => onCandidateChange(candidate.id, 'name', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.company || ''}
                          onChange={(event) => onCandidateChange(candidate.id, 'company', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={candidate.email || ''}
                          onChange={(event) => onCandidateChange(candidate.id, 'email', event.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={candidate.status}
                          onChange={(event) => onCandidateChange(candidate.id, 'status', event.target.value)}
                        >
                          {filterOptions
                            .filter((item) => item !== 'todos')
                            .map((item) => (
                              <option key={item} value={item}>
                                {capitalize(item)}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={candidate.next_action || 'revisar_manual'}
                          onChange={(event) => onCandidateChange(candidate.id, 'next_action', event.target.value)}
                        >
                          {actionOptions.map((item) => (
                            <option key={item} value={item}>
                              {prettifyAction(item)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <textarea
                          rows="3"
                          value={candidate.suggested_message || ''}
                          onChange={(event) =>
                            onCandidateChange(candidate.id, 'suggested_message', event.target.value)
                          }
                        />
                      </td>
                      <td>{candidate.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="confirm-options">
              <label>
                Plantilla
                <select
                  value={selectedTemplateId ?? defaultTemplate?.id ?? ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                >
                  {templates.length === 0 && <option value="">Sin plantillas</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.is_default ? ' (por defecto)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CV adjunto
                <select
                  value={selectedCvId ?? defaultCv?.id ?? ''}
                  onChange={(e) => setSelectedCvId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Sin CV</option>
                  {cvFiles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.original_name}{c.is_default ? ' (por defecto)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cronograma de envío
                <select
                  value={selectedScheduleId ?? defaultSchedule?.id ?? ''}
                  onChange={(e) => setSelectedScheduleId(e.target.value === '' ? '' : e.target.value)}
                >
                  <option value="">Sin cronograma (inmediato)</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.is_default ? ' (por defecto)' : ''} — {String(s.start_hour_art).padStart(2,'0')}:00–{String(s.end_hour_art).padStart(2,'0')}:00 ART, c/{s.interval_minutes}min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="detail-actions">
              <button type="button" className="ghost-button" onClick={onClearPreview}>
                Descartar preview
              </button>
              <button type="button" className="primary-button" onClick={handleConfirm} disabled={confirming}>
                {confirming ? 'Confirmando...' : 'Confirmar importacion'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Importaciones</h2>
            <p>Historial de previews y confirmaciones generadas desde la app.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Origen</th>
                <th>Total</th>
                <th>Listos</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {imports.length ? (
                imports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.filename}</td>
                    <td>{item.source}</td>
                    <td>{item.total_contacts}</td>
                    <td>{item.total_ready}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan="6">Todavia no hay importaciones registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
