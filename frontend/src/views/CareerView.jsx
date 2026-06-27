import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createCareerSession,
  deleteCareerSession,
  fetchCareerSession,
  sendCareerMessage,
  createCareerDraft,
  generateCareerCv,
  getCareerCvPdfUrl,
} from '../lib/api';
import { useCareerSessions, useCvFiles } from '../lib/queries';
import { formatDate } from '../lib/utils';

// ── Íconos ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const BriefcaseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

// ── Modal de previsualización del CV ───────────────────────────────────────────

function CvPreviewModal({ html, sessionId, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleDownload() {
    const url = getCareerCvPdfUrl(sessionId);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    // El backend agrega auth header... pero las descargas directas no pasan headers.
    // En dev local (sin auth) funciona directo. En prod con API key usamos window.open.
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="cv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv-modal">
        <div className="cv-modal-header">
          <span className="cv-modal-title">Vista previa del CV</span>
          <div className="cv-modal-actions">
            <button type="button" className="cv-modal-download-btn" onClick={handleDownload}>
              <DownloadIcon /> Descargar PDF
            </button>
            <button type="button" className="cv-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </div>
        <div className="cv-modal-body">
          <iframe
            title="Vista previa del CV"
            srcDoc={html}
            className="cv-modal-iframe"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <div className="career-copy-block">
      <pre className="career-copy-pre">{text}</pre>
      <button
        type="button"
        className="career-copy-btn"
        onClick={handleCopy}
        aria-label="Copiar al portapapeles"
      >
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

const GmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

function extractContactEmail(text) {
  const match = text.match(/📨\s*ENVIAR\s*A[\s\S]*?```([\s\S]*?)```/i);
  if (match) {
    const candidate = match[1].trim();
    if (candidate.includes('@') && !candidate.toLowerCase().includes('no visible')) {
      return candidate;
    }
  }
  return null;
}

function CvPreviewButton({ sessionId, onCvGenerated, cvHtml, onOpenModal }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const { html } = await generateCareerCv(sessionId);
      onCvGenerated(html);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (cvHtml) {
    return (
      <div className="cv-preview-bar">
        <span className="cv-preview-badge">✓ CV generado para este aviso</span>
        <button type="button" className="cv-preview-btn" onClick={onOpenModal}>
          <EyeIcon /> Vista previa
        </button>
      </div>
    );
  }

  return (
    <div className="cv-preview-bar">
      <button
        type="button"
        className="cv-generate-btn"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? 'Generando CV…' : '📄 Generar CV ATS'}
      </button>
      {error && <p className="career-draft-error">{error}</p>}
    </div>
  );
}

function GmailDraftButton({ sessionId, messageContent, hasCv }) {
  const cvFiles = useCvFiles();
  const cvs = cvFiles.data || [];
  const [selectedCvId, setSelectedCvId] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const detectedEmail = messageContent ? extractContactEmail(messageContent) : null;

  useEffect(() => {
    if (!hasCv && cvs.length > 0 && !selectedCvId) {
      setSelectedCvId(String(cvs[0].id));
    }
  }, [cvs, selectedCvId, hasCv]);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      // Si hay CV generado el backend lo usa automáticamente; cv_id solo si no hay
      const result = await createCareerDraft(
        sessionId,
        hasCv ? null : (selectedCvId ? Number(selectedCvId) : null),
        detectedEmail || null,
      );
      setDone(true);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="career-draft-box">
      <p className="career-draft-label">Crear borrador en Gmail</p>
      {detectedEmail && (
        <p className="career-draft-to">Para: <strong>{detectedEmail}</strong></p>
      )}
      <div className="career-draft-row">
        {hasCv ? (
          <span className="career-draft-cv-badge">📄 CV ATS adjunto automáticamente</span>
        ) : cvs.length > 0 ? (
          <select
            className="career-draft-select"
            value={selectedCvId}
            onChange={e => { setSelectedCvId(e.target.value); setDone(false); }}
            disabled={loading}
            aria-label="CV a adjuntar"
          >
            <option value="">Sin adjunto</option>
            {cvs.map(cv => (
              <option key={cv.id} value={String(cv.id)}>{cv.original_name || `CV #${cv.id}`}</option>
            ))}
          </select>
        ) : (
          <span className="career-draft-no-cvs">Generá el CV ATS o subí uno en Envíos</span>
        )}
        <button
          type="button"
          className={`career-draft-btn ${done ? 'is-done' : ''}`}
          onClick={handleCreate}
          disabled={loading || done}
        >
          <GmailIcon />
          {loading ? 'Creando…' : done ? '✓ Borrador creado' : 'Crear borrador'}
        </button>
      </div>
      {done && (
        <p className="career-draft-hint">Borrador creado{hasCv ? ' con CV ATS adjunto' : ''}. Abrió Gmail en una pestaña nueva.</p>
      )}
      {error && (
        <p className="career-draft-error">{error}</p>
      )}
    </div>
  );
}

function MessageBubble({ role, content, hasImage }) {
  const isUser = role === 'user';

  // Parsea bloques de código delimitados por ``` y los renderiza con botón copiar
  function renderContent(text) {
    const parts = text.split(/```/);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // bloque de código → CopyBlock
        const trimmed = part.replace(/^\n/, '').replace(/\n$/, '');
        return <CopyBlock key={i} text={trimmed} />;
      }
      // texto normal
      return (
        <span key={i}>
          {part.split('\n').map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    });
  }

  return (
    <div className={`career-bubble ${isUser ? 'career-bubble-user' : 'career-bubble-assistant'}`}>
      {hasImage && isUser && (
        <span className="career-bubble-img-badge">📎 imagen adjunta</span>
      )}
      <div className="career-bubble-text">
        {isUser ? (
          content.split('\n').map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))
        ) : (
          renderContent(content)
        )}
      </div>
    </div>
  );
}

function SessionItem({ session, isActive, onClick, onDelete }) {
  return (
    <div
      className={`career-session-item ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="career-session-item-body">
        <span className="career-session-title">{session.title}</span>
        {session.company && (
          <span className="career-session-meta">{session.company}</span>
        )}
        {session.summary && (
          <span className="career-session-summary">{session.summary.slice(0, 80)}{session.summary.length > 80 ? '…' : ''}</span>
        )}
        <span className="career-session-date">{formatDate(session.updated_at)}</span>
      </div>
      <button
        type="button"
        className="career-session-delete"
        onClick={e => { e.stopPropagation(); onDelete(session.id); }}
        aria-label="Eliminar"
        title="Eliminar sesión"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function EmptyState({ onNew, loading }) {
  return (
    <div className="career-empty">
      <BriefcaseIcon />
      <p>Todavía no analizaste ninguna búsqueda.</p>
      <button
        type="button"
        className="primary-button"
        onClick={onNew}
        disabled={loading}
      >
        {loading ? 'Creando…' : 'Empezar nueva búsqueda'}
      </button>
    </div>
  );
}

// ── Vista principal ────────────────────────────────────────────────────────────

export function CareerView() {
  const qc = useQueryClient();
  const sessionsQuery = useCareerSessions();
  const sessions = sessionsQuery.data || [];

  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showHistory, setShowHistory] = useState(true); // mobile: alternar panel

  // Estado del CV generado para esta sesión
  const [cvHtml, setCvHtml] = useState(null);
  const [showCvModal, setShowCvModal] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Resetea CV al cambiar de sesión
  useEffect(() => {
    setCvHtml(null);
    setShowCvModal(false);
  }, [activeSessionId]);

  // Al seleccionar una sesión, carga sus mensajes
  async function openSession(sessionId) {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setLoadingSession(true);
    setMessages([]);
    setShowHistory(false);
    try {
      const data = await fetchCareerSession(sessionId);
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingSession(false);
    }
  }

  async function handleNewSession() {
    setCreatingNew(true);
    try {
      const { id } = await createCareerSession();
      await qc.invalidateQueries({ queryKey: ['careerSessions'] });
      setActiveSessionId(id);
      setMessages([]);
      setShowHistory(false);
    } finally {
      setCreatingNew(false);
    }
  }

  async function handleDelete(sessionId) {
    await deleteCareerSession(sessionId);
    await qc.invalidateQueries({ queryKey: ['careerSessions'] });
    if (sessionId === activeSessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setShowHistory(true);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    if ((!text.trim() && !imageFile) || sending || !activeSessionId) return;

    const userText = text.trim();
    const userImg = imageFile;

    // Optimistic UI
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: userImg ? (userText ? `[imagen] ${userText}` : '[imagen adjunta]') : userText,
      has_image: !!userImg,
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setText('');
    clearImage();
    setSending(true);

    try {
      const { reply } = await sendCareerMessage(activeSessionId, userText, userImg || null);
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: reply, has_image: false };
      setMessages(prev => [...prev, assistantMsg]);
      await qc.invalidateQueries({ queryKey: ['careerSessions'] });
    } catch (err) {
      const errMsg = { id: Date.now() + 2, role: 'assistant', content: `Error: ${err.message}`, has_image: false };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasActiveSession = activeSessionId !== null;

  return (
    <section className="page career-page">

      {/* ── Panel de historial ── */}
      <aside className={`career-history ${showHistory || !hasActiveSession ? 'is-visible' : 'is-hidden-mobile'}`}>
        <div className="career-history-head">
          <div>
            <h2>Asistente de búsqueda</h2>
            <p>Historial de búsquedas analizadas</p>
          </div>
          <button
            type="button"
            className="primary-button career-new-btn"
            onClick={handleNewSession}
            disabled={creatingNew}
            aria-label="Nueva búsqueda"
          >
            <PlusIcon />
            <span>Nueva</span>
          </button>
        </div>

        <div className="career-session-list">
          {sessionsQuery.isLoading && (
            <p className="career-loading-text">Cargando historial…</p>
          )}
          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <EmptyState onNew={handleNewSession} loading={creatingNew} />
          )}
          {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onClick={() => openSession(s.id)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </aside>

      {/* ── Panel de chat ── */}
      <div className={`career-chat ${hasActiveSession ? 'is-active' : ''} ${!showHistory && hasActiveSession ? 'is-visible-mobile' : ''}`}>

        {!hasActiveSession ? (
          <div className="career-chat-placeholder">
            <BriefcaseIcon />
            <p>Seleccioná una búsqueda del historial<br />o creá una nueva para empezar.</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleNewSession}
              disabled={creatingNew}
            >
              <PlusIcon /> Nueva búsqueda
            </button>
          </div>
        ) : (
          <>
            {/* Header del chat con botón back en mobile */}
            <div className="career-chat-header">
              <button
                type="button"
                className="career-back-btn"
                onClick={() => setShowHistory(true)}
                aria-label="Volver al historial"
              >
                <BackIcon />
              </button>
              <div>
                <strong>
                  {sessions.find(s => s.id === activeSessionId)?.title || 'Nueva búsqueda'}
                </strong>
                {sessions.find(s => s.id === activeSessionId)?.company && (
                  <span className="career-chat-subtitle">
                    {sessions.find(s => s.id === activeSessionId).company}
                  </span>
                )}
              </div>
            </div>

            {/* Mensajes */}
            <div className="career-messages">
              {loadingSession && (
                <p className="career-loading-text">Cargando mensajes…</p>
              )}

              {!loadingSession && messages.length === 0 && (
                <div className="career-chat-welcome">
                  <p><strong>Pegá o subí un aviso de trabajo</strong> y automáticamente te genero:</p>
                  <ul>
                    <li>🎯 Análisis de encaje (Alto / Medio / Bajo)</li>
                    <li>📋 Cuál CV usar y qué destacar</li>
                    <li>🔑 Keywords ATS del aviso para pasar los filtros</li>
                    <li>📧 Asunto del email listo para copiar</li>
                    <li>✉️ Cuerpo del email personalizado listo para copiar</li>
                  </ul>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    📎 Adjuntá una imagen/captura · 🔗 Pegá un enlace de portal de empleo · ✍️ O escribí el texto del aviso
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isLastAssistant =
                  msg.role === 'assistant' &&
                  msg.content.includes('```') &&
                  messages.slice(idx + 1).every(m => m.role !== 'assistant' || !m.content.includes('```'));
                return (
                  <div key={msg.id}>
                    <MessageBubble
                      role={msg.role}
                      content={msg.content}
                      hasImage={msg.has_image}
                    />
                    {isLastAssistant && activeSessionId && (
                      <>
                        <CvPreviewButton
                          sessionId={activeSessionId}
                          cvHtml={cvHtml}
                          onCvGenerated={(html) => { setCvHtml(html); setShowCvModal(true); }}
                          onOpenModal={() => setShowCvModal(true)}
                        />
                        <GmailDraftButton
                          sessionId={activeSessionId}
                          messageContent={msg.content}
                          hasCv={!!cvHtml}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {sending && (
                <div className="career-bubble career-bubble-assistant career-typing">
                  <span /><span /><span />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="career-input-area">
              {imagePreview && (
                <div className="career-image-preview">
                  <img src={imagePreview} alt="imagen adjunta" />
                  <button type="button" onClick={clearImage} aria-label="Quitar imagen">×</button>
                </div>
              )}
              <div className="career-input-row">
                <button
                  type="button"
                  className="career-img-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Adjuntar imagen"
                  aria-label="Adjuntar imagen"
                >
                  <ImageIcon />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,.pdf"
                  onChange={handleImageChange}
                  hidden
                />
                <textarea
                  ref={textareaRef}
                  className="career-textarea"
                  placeholder="Escribí tu mensaje o pegá el aviso de trabajo…"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={sending}
                />
                <button
                  type="button"
                  className={`career-send-btn ${(!text.trim() && !imageFile) || sending ? 'is-disabled' : ''}`}
                  onClick={handleSend}
                  disabled={(!text.trim() && !imageFile) || sending}
                  aria-label="Enviar"
                >
                  <SendIcon />
                </button>
              </div>
              <p className="career-input-hint">Enter para enviar · Shift+Enter para nueva línea</p>
            </div>
          </>
        )}
      </div>

      {showCvModal && cvHtml && (
        <CvPreviewModal
          html={cvHtml}
          sessionId={activeSessionId}
          onClose={() => setShowCvModal(false)}
        />
      )}
    </section>
  );
}
