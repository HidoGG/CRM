import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { searchJobOffers, updateJobOffer } from '../lib/api';
import { useJobOffers } from '../lib/queries';
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABEL,
  SCORE_STYLE,
  daysSinceContact,
  googleSearchUrl,
  prepareAssistantSession,
  splitLines,
} from '../lib/jobOffers';

const TABS = [
  { id: 'result', label: 'Resultados' },
  { id: 'saved',  label: 'Mis postulaciones' },
];

const SCORE_FILTERS = ['Todas', 'A', 'B', 'C'];

const SAVED_FILTERS = [
  { id: 'todas',      label: 'Todas',      match: () => true },
  { id: 'seguir',     label: 'Para seguir', match: (o) => o.follow_up_due },
  { id: 'pendiente',  label: 'Pendientes', match: (o) => o.application_status === 'pendiente' },
  { id: 'activas',    label: 'Postulado / En proceso', match: (o) => ['postulado', 'en_proceso', 'entrevista'].includes(o.application_status) },
  { id: 'cerradas',   label: 'Cerradas',   match: (o) => ['rechazado', 'cerrado'].includes(o.application_status) },
];

// ── Íconos ────────────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const ExternalIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Vista principal ───────────────────────────────────────────────────────────

export function BusquedasView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState('result');
  const results = useJobOffers('result').data || [];
  const saved = useJobOffers('saved').data || [];
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const followUpCount = saved.filter((o) => o.follow_up_due).length;

  async function refreshOffers() {
    await qc.invalidateQueries({ queryKey: ['jobOffers'] });
  }

  async function patchOffer(offer, patch) {
    setBusyId(offer.id);
    setActionError('');
    try {
      await updateJobOffer(offer.id, patch);
      await refreshOffers();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function openInAssistant(offer) {
    setBusyId(offer.id);
    setActionError('');
    try {
      const state = await prepareAssistantSession(offer);
      await refreshOffers();
      navigate('/asistente', { state });
    } catch (err) {
      setActionError(err.message);
      setBusyId(null);
    }
  }

  const tabCounts = { result: results.length, saved: saved.length };

  return (
    <div className="flex flex-col gap-5">
      {/* Selector de sub-pestaña */}
      <div
        role="tablist"
        aria-label="Secciones de búsquedas"
        style={{
          display: 'flex', gap: 4, background: 'var(--surface-subtle)', borderRadius: 14,
          padding: 6, width: 'fit-content', maxWidth: '100%', border: '1px solid var(--border-faint)', flexWrap: 'wrap',
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                borderRadius: 10, padding: '7px 18px', fontSize: '0.87rem', fontWeight: 600, cursor: 'pointer',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                background: active ? 'var(--surface-raised)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {t.label}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {tabCounts[t.id]}
              </span>
              {t.id === 'saved' && followUpCount > 0 && (
                <span
                  title={`${followUpCount} para hacer seguimiento`}
                  style={{
                    minWidth: 20, height: 20, borderRadius: 999, padding: '0 6px', fontSize: '0.72rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--red-text)', color: '#fff',
                  }}
                >
                  {followUpCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {actionError && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: '0.86rem' }}>
          {actionError}
        </div>
      )}

      {tab === 'result' ? (
        <ResultsTab
          offers={results}
          busyId={busyId}
          onSave={(o) => patchOffer(o, { status: 'saved' })}
          onDismiss={(o) => patchOffer(o, { status: 'dismissed' })}
          onAnalyze={openInAssistant}
          onSearched={refreshOffers}
        />
      ) : (
        <SavedTab
          offers={saved}
          busyId={busyId}
          onPatch={patchOffer}
          onAnalyze={openInAssistant}
        />
      )}
    </div>
  );
}

// ── Resultados ────────────────────────────────────────────────────────────────

function ResultsTab({ offers, busyId, onSave, onDismiss, onAnalyze, onSearched }) {
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [scoreFilter, setScoreFilter] = useState('Todas');
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const lastRunAt = useMemo(() => {
    const times = offers.map((o) => o.search_run_at).filter(Boolean).sort();
    return times.length ? times[times.length - 1] : null;
  }, [offers]);

  const visible = scoreFilter === 'Todas' ? offers : offers.filter((o) => o.score === scoreFilter);
  const scoreCounts = useMemo(() => {
    const c = { Todas: offers.length };
    for (const o of offers) c[o.score] = (c[o.score] || 0) + 1;
    return c;
  }, [offers]);

  async function handleSearch() {
    if (searching) return;
    setSearching(true);
    setError('');
    setSummary(null);
    setElapsed(0);
    const started = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    try {
      const res = await searchJobOffers();
      setSummary(res);
      await onSearched();
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timerRef.current);
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de búsqueda */}
      <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary-button"
          onClick={handleSearch}
          disabled={searching}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: '0.95rem' }}
        >
          <SearchIcon />
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
        <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
          {searching ? (
            <>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }} aria-live="polite">
                Buscando ofertas en Google… {elapsed} s
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Suele tardar entre 1 y 2 minutos. Podés quedarte en esta pantalla.
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                Ofertas para tu perfil en Neuquén y Río Negro
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {lastRunAt ? `Última búsqueda: ${fmtDateTime(lastRunAt)}` : 'Todavía no buscaste. Tocá "Buscar".'}
                {' · '}Solo muestra notas A, B y C. Las que ya guardaste o descartaste no se repiten.
              </span>
            </>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--amber-bg)', color: 'var(--amber-text)', fontSize: '0.88rem', lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {summary && <SearchSummary summary={summary} />}

      {/* Filtro por nota */}
      {offers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filtrar por nota">
          {SCORE_FILTERS.map((f) => (
            <FilterChip
              key={f}
              label={f === 'Todas' ? 'Todas' : `Nota ${f}`}
              count={scoreCounts[f] || 0}
              active={scoreFilter === f}
              onClick={() => setScoreFilter(f)}
            />
          ))}
        </div>
      )}

      {visible.length === 0 && !searching && (
        <EmptyState
          text={offers.length === 0
            ? 'No hay resultados pendientes. Tocá "Buscar" para traer ofertas nuevas.'
            : 'No hay ofertas con esa nota.'}
        />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((offer) => (
          <OfferCard key={offer.id} offer={offer} isNew={offer.search_run_at === lastRunAt && Boolean(summary)}>
            <ActionLinkButtons offer={offer} />
            <SmallButton onClick={() => onAnalyze(offer)} disabled={busyId === offer.id}>
              Analizar en Asistente
            </SmallButton>
            <SmallButton variant="primary" onClick={() => onSave(offer)} disabled={busyId === offer.id}>
              Guardar
            </SmallButton>
            <SmallButton variant="danger" onClick={() => onDismiss(offer)} disabled={busyId === offer.id}>
              Descartar
            </SmallButton>
          </OfferCard>
        ))}
      </div>
    </div>
  );
}

function SearchSummary({ summary }) {
  const parts = [];
  if (summary.already_known) parts.push(`${summary.already_known} ya las conocías`);
  if (summary.low_score) parts.push(`${summary.low_score} descartadas por nota baja (D/F)`);
  if (summary.other_zone) parts.push(`${summary.other_zone} de otra zona`);
  const good = summary.new > 0;
  return (
    <div
      role="status"
      style={{
        padding: '12px 16px', borderRadius: 10, fontSize: '0.88rem', lineHeight: 1.5,
        background: good ? 'var(--green-bg)' : 'var(--surface-subtle)',
        color: good ? 'var(--green-text)' : 'var(--text-secondary)',
        border: '1px solid var(--border-faint)',
      }}
    >
      <strong>
        {good ? `${summary.new} ${summary.new === 1 ? 'oferta nueva' : 'ofertas nuevas'}` : 'No aparecieron ofertas nuevas'}
      </strong>
      {` — se revisaron ${summary.found}.`}
      {parts.length > 0 && ` (${parts.join(' · ')})`}
    </div>
  );
}

// ── Mis postulaciones ─────────────────────────────────────────────────────────

function SavedTab({ offers, busyId, onPatch, onAnalyze }) {
  const [filter, setFilter] = useState('todas');
  const active = SAVED_FILTERS.find((f) => f.id === filter) || SAVED_FILTERS[0];
  const visible = offers.filter(active.match);

  return (
    <div className="flex flex-col gap-4">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filtrar postulaciones">
        {SAVED_FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            count={offers.filter(f.match).length}
            active={filter === f.id}
            alert={f.id === 'seguir'}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <EmptyState
          text={offers.length === 0
            ? 'Todavía no guardaste ofertas. En "Resultados" tocá "Guardar" en las que te interesen.'
            : 'No hay postulaciones en este filtro.'}
        />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((offer) => (
          <SavedOfferCard
            key={offer.id}
            offer={offer}
            busy={busyId === offer.id}
            onPatch={(patch) => onPatch(offer, patch)}
            onAnalyze={() => onAnalyze(offer)}
          />
        ))}
      </div>
    </div>
  );
}

function SavedOfferCard({ offer, busy, onPatch, onAnalyze }) {
  const [notes, setNotes] = useState(offer.notes || '');
  useEffect(() => { setNotes(offer.notes || ''); }, [offer.notes]);
  const days = daysSinceContact(offer);
  const closed = ['rechazado', 'cerrado'].includes(offer.application_status);

  return (
    <OfferCard offer={offer} compact>
      <div style={{ display: 'grid', gap: 10, width: '100%' }}>
        {/* Estado + fechas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Estado
            <select
              value={offer.application_status || 'pendiente'}
              disabled={busy}
              onChange={(e) => onPatch({ application_status: e.target.value })}
              style={{
                padding: '5px 8px', borderRadius: 7, fontSize: '0.84rem', fontWeight: 600,
                background: 'var(--surface-input)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              }}
            >
              {APPLICATION_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {offer.applied_at && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Postulado: {fmtDate(offer.applied_at)}</span>
          )}
          {offer.last_contact_at && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Último seguimiento: {fmtDate(offer.last_contact_at)}</span>
          )}
        </div>

        {/* Aviso de seguimiento */}
        {offer.follow_up_due && !closed && (
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 9,
              background: 'var(--amber-bg)', color: 'var(--amber-text)', fontSize: '0.85rem',
            }}
          >
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>Pasaron {days} días sin respuesta</strong> — mandá un mensaje o email de seguimiento.
            </span>
            <SmallButton onClick={() => onPatch({ follow_up_done: true })} disabled={busy}>
              Ya hice seguimiento
            </SmallButton>
            <SmallButton onClick={() => onPatch({ application_status: 'cerrado' })} disabled={busy}>
              Cerrar
            </SmallButton>
          </div>
        )}

        {/* Notas */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (offer.notes || '')) onPatch({ notes }); }}
          placeholder="Notas (con quién hablaste, qué te dijeron, etc.) — se guardan solas"
          rows={2}
          aria-label={`Notas de ${offer.title}`}
          style={{
            width: '100%', resize: 'vertical', padding: '8px 10px', borderRadius: 8, fontSize: '0.85rem',
            fontFamily: 'inherit', background: 'var(--surface-input)', color: 'var(--text-primary)', border: '1px solid var(--border-faint)',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ActionLinkButtons offer={offer} />
          <SmallButton onClick={onAnalyze} disabled={busy}>
            {offer.career_session_id ? 'Abrir en Asistente' : 'Analizar en Asistente'}
          </SmallButton>
          <SmallButton variant="danger" onClick={() => onPatch({ status: 'dismissed' })} disabled={busy}>
            Quitar
          </SmallButton>
        </div>
      </div>
    </OfferCard>
  );
}

// ── Piezas comunes ────────────────────────────────────────────────────────────

function OfferCard({ offer, isNew = false, compact = false, children }) {
  const score = SCORE_STYLE[offer.score] || SCORE_STYLE.C;
  const meets = splitLines(offer.meets);
  const gaps = splitLines(offer.gaps);
  const meta = [offer.location, offer.source, offer.posted_text].filter(Boolean).join(' · ');

  return (
    <article
      className="card"
      style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 14, alignItems: 'start', padding: '14px 16px' }}
    >
      <span
        aria-label={`Nota ${offer.score || '—'}`}
        style={{
          width: 44, height: 44, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.35rem', fontWeight: 800, background: score.bg, color: score.color,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {offer.score || '—'}
      </span>

      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{offer.title}</h3>
            {isNew && <Tag bg="var(--accent-subtle)" color="var(--accent)">Nueva</Tag>}
            {compact && offer.application_status && (
              <Tag bg="var(--surface-subtle)" color="var(--text-secondary)">
                {APPLICATION_STATUS_LABEL[offer.application_status]}
              </Tag>
            )}
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{offer.company}</span>
          {meta && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📍 {meta}</span>}
        </div>

        {!compact && (meets.length > 0 || gaps.length > 0) && (
          <div style={{ display: 'grid', gap: 3, fontSize: '0.85rem', lineHeight: 1.45 }}>
            {meets.map((m, i) => (
              <span key={`m${i}`} style={{ color: 'var(--text-primary)' }}>✅ {m}</span>
            ))}
            {gaps.map((g, i) => (
              <span key={`g${i}`} style={{ color: 'var(--text-secondary)' }}>❌ {g}</span>
            ))}
          </div>
        )}

        {(offer.reason || offer.cv_recommended) && (
          <div style={{ display: 'grid', gap: 2, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {offer.reason && <span>📌 {offer.reason}</span>}
            {offer.cv_recommended && <span>📋 CV sugerido: <strong>{offer.cv_recommended}</strong></span>}
          </div>
        )}

        {compact && offer.aviso_summary && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{offer.aviso_summary}</span>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {children}
        </div>
      </div>
    </article>
  );
}

/** "Ver aviso" (+ aviso si el link no se pudo confirmar) o "Buscar en Google" si no hay link. */
function ActionLinkButtons({ offer }) {
  if (!offer.url) {
    return (
      <LinkButton href={googleSearchUrl(offer)} title="No tenemos el link del aviso: lo buscamos en Google">
        Buscar en Google
      </LinkButton>
    );
  }
  return (
    <>
      <LinkButton href={offer.url}>Ver aviso</LinkButton>
      {!offer.url_verified && (
        <>
          <span
            title="Google no confirmó este link: puede estar vencido o mal copiado. Si no abre, usá Buscar en Google."
            style={{ fontSize: '0.74rem', color: 'var(--amber-text)', fontWeight: 600 }}
          >
            ⚠ link sin confirmar
          </span>
          <LinkButton href={googleSearchUrl(offer)}>Buscar en Google</LinkButton>
        </>
      )}
    </>
  );
}

function LinkButton({ href, title, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600,
        padding: '5px 10px', borderRadius: 7, textDecoration: 'none',
        background: 'var(--surface-raised)', color: 'var(--text-primary)', border: '1px solid var(--border)',
      }}
    >
      {children} <ExternalIcon />
    </a>
  );
}

function SmallButton({ variant = 'neutral', disabled, onClick, children }) {
  const styles = {
    neutral: { background: 'var(--surface-raised)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    primary: { background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)' },
    danger:  { background: 'transparent', color: 'var(--red-text)', border: '1px solid var(--border)' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant], fontSize: '0.8rem', fontWeight: 600, padding: '5px 11px', borderRadius: 7,
        cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function FilterChip({ label, count, active, alert = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600,
        padding: '5px 12px', borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s',
        background: active ? 'var(--accent)' : 'var(--surface-subtle)',
        color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border-faint)',
      }}
    >
      {label}
      <span style={{ fontVariantNumeric: 'tabular-nums', color: alert && count > 0 && !active ? 'var(--red-text)' : 'inherit' }}>
        {count}
      </span>
    </button>
  );
}

function Tag({ bg, color, children }) {
  return (
    <span
      style={{
        fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color,
        textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {children}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="card" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '28px 18px', textAlign: 'center' }}>
      {text}
    </div>
  );
}

