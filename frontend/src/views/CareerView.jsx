import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createCareerSession,
  deleteCareerSession,
  fetchCareerSession,
  sendCareerMessage,
} from '../lib/api';
import { useCareerSessions } from '../lib/queries';
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

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function MessageBubble({ role, content, hasImage }) {
  const isUser = role === 'user';
  return (
    <div className={`career-bubble ${isUser ? 'career-bubble-user' : 'career-bubble-assistant'}`}>
      {hasImage && !isUser && null}
      {hasImage && isUser && (
        <span className="career-bubble-img-badge">📎 imagen adjunta</span>
      )}
      <div className="career-bubble-text">
        {content.split('\n').map((line, i) => (
          <span key={i}>
            {line}
            {i < content.split('\n').length - 1 && <br />}
          </span>
        ))}
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

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
                  <p>Hola, soy tu asistente de RRHH. Podés:</p>
                  <ul>
                    <li>📋 Pegarme el texto de un aviso de trabajo</li>
                    <li>📸 Subir una foto o captura del aviso</li>
                    <li>✉️ Pedirme que genere el email para aplicar</li>
                    <li>❓ Consultarme cualquier duda sobre la búsqueda</li>
                  </ul>
                </div>
              )}

              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  hasImage={msg.has_image}
                />
              ))}

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
    </section>
  );
}
