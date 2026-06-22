import { useMemo } from 'react';

// ── Iconos inline (sin dependencias externas) ──────────────────────────────────
const IconSend    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconCheck   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconX       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconReply   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>;
const IconClock   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconWarning = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

// ── Clasificación de motivos de rebote ────────────────────────────────────────
// Espeja los valores del backend (engagement_service.py → _parse_bounce_reason)
const BOUNCE_REASON_LABEL = {
  usuario_inexistente: 'Usuario inexistente',
  casilla_llena:       'Casilla llena',
  dominio_invalido:    'Dominio inválido',
  casilla_desactivada: 'Casilla desactivada',
  rechazado_politica:  'Rechazado por spam',
  persona_no_trabaja:  'Persona no trabaja',
  rebote_temporario:   'Rebote temporario',
  direccion_invalida:  'Dirección inválida',
  tamano_excedido:     'Tamaño excedido',
  rebote_email:        'Permanente',
};

function bounceLabel(contact) {
  return BOUNCE_REASON_LABEL[contact.bounce_reason] || 'Permanente';
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function buildStats(contacts, emailJobs) {
  const sent    = emailJobs.filter(j => j.status === 'sent' || j.status === 'completed').length;
  const failed  = emailJobs.filter(j => j.status === 'failed' || j.status === 'error').length;
  const pending = emailJobs.filter(j => j.status === 'pending').length;
  const total   = sent + failed; // total alguna vez procesados (sin pendientes)

  const bounced = contacts.filter(c => c.bounced_at).length;
  const replied = contacts.filter(c => c.replied_at).length;
  const delivered = Math.max(0, total - bounced);

  const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : null;
  const bounceRate   = total > 0 ? Math.round((bounced   / total) * 100) : null;
  const replyRate    = delivered > 0 ? Math.round((replied / delivered) * 100) : null;

  return { sent, failed, pending, total, bounced, replied, delivered, deliveryRate, bounceRate, replyRate };
}

// ── Componente principal ───────────────────────────────────────────────────────
export function HoyView({ summary, contacts, emailJobs }) {
  const stats = useMemo(() => buildStats(contacts, emailJobs), [contacts, emailJobs]);

  const recentBounced = useMemo(() =>
    contacts
      .filter(c => c.bounced_at)
      .sort((a, b) => new Date(b.bounced_at) - new Date(a.bounced_at))
      .slice(0, 10),
    [contacts]
  );

  const recentReplied = useMemo(() =>
    contacts
      .filter(c => c.replied_at)
      .sort((a, b) => new Date(b.replied_at) - new Date(a.replied_at))
      .slice(0, 8),
    [contacts]
  );

  const upcomingJobs = useMemo(() =>
    emailJobs
      .filter(j => j.status === 'pending')
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 8),
    [emailJobs]
  );

  return (
    <section className="page">

      {/* ── KPIs — fila de 5 números (patrón Instantly/Lemlist) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <KpiCard
          icon={<IconSend />}
          label="Enviados"
          value={stats.total}
          sub={stats.pending > 0 ? `+ ${stats.pending} en cola` : 'Total histórico'}
          iconBg="var(--blue-subtle)"
          iconColor="var(--blue)"
        />
        <KpiCard
          icon={<IconCheck />}
          label="Entregados"
          value={stats.delivered}
          sub={stats.deliveryRate !== null ? `${stats.deliveryRate}% del total` : '—'}
          subColor={stats.deliveryRate >= 80 ? 'green' : stats.deliveryRate >= 60 ? 'amber' : 'red'}
          iconBg="var(--green-bg)"
          iconColor="var(--green-text)"
        />
        <KpiCard
          icon={<IconX />}
          label="Rebotes"
          value={stats.bounced}
          sub={stats.bounceRate !== null ? `${stats.bounceRate}% del total` : '—'}
          subColor={stats.bounceRate > 15 ? 'red' : stats.bounceRate > 5 ? 'amber' : 'green'}
          iconBg="var(--red-bg)"
          iconColor="var(--red-text)"
          highlight={stats.bounceRate > 15}
        />
        <KpiCard
          icon={<IconReply />}
          label="Respuestas"
          value={stats.replied}
          sub={stats.replyRate !== null ? `${stats.replyRate}% de conversión` : '—'}
          subColor={stats.replyRate > 5 ? 'green' : 'neutral'}
          iconBg="var(--accent-subtle)"
          iconColor="var(--accent)"
        />
        <KpiCard
          icon={<IconClock />}
          label="En cola"
          value={stats.pending}
          sub="pendientes de envío"
          subColor={stats.pending > 0 ? 'amber' : 'neutral'}
          iconBg="var(--amber-bg)"
          iconColor="var(--amber-text)"
        />
      </div>

      {/* ── Barra de composición visual (patrón Mailchimp) ── */}
      {stats.total > 0 && <DeliveryBar stats={stats} />}

      {/* ── Tres columnas de detalle ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

        {/* Columna 1 — Rebotes recientes */}
        <DetailPanel
          title="Rebotes detectados"
          count={stats.bounced}
          emptyMsg="Sin rebotes detectados. Presioná Sync Gmail en Envíos para verificar."
          countColor="var(--red-text)"
          countBg="var(--red-bg)"
        >
          {recentBounced.map(c => (
            <ContactRow
              key={c.id}
              icon={<IconX />}
              iconColor="var(--red-text)"
              iconBg="var(--red-bg)"
              name={c.name || 'Sin nombre'}
              company={c.company || '—'}
              detail={c.email}
              date={fmtDate(c.bounced_at)}
              badge={bounceLabel(c)}
              badgeBg="var(--red-bg)"
              badgeColor="var(--red-text)"
            />
          ))}
        </DetailPanel>

        {/* Columna 2 — Cola de envíos */}
        <DetailPanel
          title="Cola de envíos"
          count={stats.pending}
          emptyMsg="No hay emails en cola. Los envíos programados aparecerán aquí."
          countColor="var(--amber-text)"
          countBg="var(--amber-bg)"
        >
          {upcomingJobs.map(j => (
            <ContactRow
              key={j.id}
              icon={<IconClock />}
              iconColor="var(--amber-text)"
              iconBg="var(--amber-bg)"
              name={j.contact_name || 'Sin nombre'}
              company={j.contact_company || '—'}
              detail={j.contact_email}
              date={fmtDateTime(j.scheduled_at)}
            />
          ))}
        </DetailPanel>

        {/* Columna 3 — Respuestas */}
        <DetailPanel
          title="Respuestas recibidas"
          count={stats.replied}
          emptyMsg="Sin respuestas todavía. Aparecerán aquí cuando alguien conteste."
          countColor="var(--green-text)"
          countBg="var(--green-bg)"
        >
          {recentReplied.map(c => (
            <ContactRow
              key={c.id}
              icon={<IconReply />}
              iconColor="var(--green-text)"
              iconBg="var(--green-bg)"
              name={c.name || 'Sin nombre'}
              company={c.company || '—'}
              detail={c.email}
              date={fmtDate(c.replied_at)}
            />
          ))}
        </DetailPanel>
      </div>

      {/* ── Alerta de bounce rate alto ── */}
      {stats.bounceRate > 15 && (
        <BounceAlert bounceRate={stats.bounceRate} bounced={stats.bounced} />
      )}

    </section>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, subColor = 'neutral', iconBg, iconColor, highlight = false }) {
  const subColors = { green: 'var(--green-text)', red: 'var(--red-text)', amber: 'var(--amber-text)', neutral: 'var(--text-secondary)' };
  return (
    <article style={{
      borderRadius: 10,
      padding: '14px',
      border: highlight ? '1px solid var(--red-text)' : '1px solid var(--border-faint)',
      background: highlight ? 'var(--red-bg)' : 'var(--surface-raised)',
      display: 'grid',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {label}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: iconBg, color: iconColor }}>
          {icon}
        </span>
      </div>
      <strong style={{ fontSize: '1.85rem', lineHeight: 1, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {value ?? '—'}
      </strong>
      {sub && (
        <span style={{ fontSize: '0.79rem', fontWeight: 500, color: subColors[subColor] }}>
          {sub}
        </span>
      )}
    </article>
  );
}

function DeliveryBar({ stats }) {
  const total = stats.total + stats.pending;
  const pDelivered = total > 0 ? (stats.delivered / total) * 100 : 0;
  const pBounced   = total > 0 ? (stats.bounced   / total) * 100 : 0;
  const pPending   = total > 0 ? (stats.pending   / total) * 100 : 0;

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Composición de envíos
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {stats.total + stats.pending} total
        </span>
      </div>
      {/* Barra de progreso segmentada */}
      <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-subtle)', gap: 1 }}>
        {pDelivered > 0 && <div style={{ width: `${pDelivered}%`, background: 'var(--green-text)', borderRadius: pBounced === 0 && pPending === 0 ? 99 : '99px 0 0 99px' }} />}
        {pBounced   > 0 && <div style={{ width: `${pBounced}%`,   background: 'var(--red-text)' }} />}
        {pPending   > 0 && <div style={{ width: `${pPending}%`,   background: 'var(--amber-text)', borderRadius: '0 99px 99px 0' }} />}
      </div>
      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
        <LegendItem color="var(--green-text)" label="Entregados" value={stats.delivered} pct={stats.deliveryRate} />
        <LegendItem color="var(--red-text)"   label="Rebotes"    value={stats.bounced}   pct={stats.bounceRate} />
        {stats.pending > 0 && <LegendItem color="var(--amber-text)" label="En cola" value={stats.pending} pct={Math.round(pPending)} />}
      </div>
    </div>
  );
}

function LegendItem({ color, label, value, pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {label}: <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
        {pct !== null && <span style={{ color: 'var(--text-muted)' }}> ({pct}%)</span>}
      </span>
    </div>
  );
}

function DetailPanel({ title, count, emptyMsg, countColor, countBg, children }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section className="card" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {title}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '2px 9px', background: countBg, color: countColor, fontSize: '0.78rem', fontWeight: 700 }}>
          {count}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {hasContent ? children : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '16px 0', lineHeight: 1.5 }}>
            {emptyMsg}
          </div>
        )}
      </div>
    </section>
  );
}

function ContactRow({ icon, iconColor, iconBg, name, company, detail, date, badge, badgeBg, badgeColor }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto',
      gap: 8,
      alignItems: 'start',
      padding: '8px 10px',
      borderRadius: 8,
      background: 'var(--surface-subtle)',
      border: '1px solid var(--border-faint)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: iconBg, color: iconColor, flexShrink: 0, marginTop: 1 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {company}
        </div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{date}</span>
        {badge && (
          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function BounceAlert({ bounceRate, bounced }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 16px',
      borderRadius: 10,
      background: 'var(--red-bg)',
      border: '1px solid var(--red-text)',
    }}>
      <span style={{ color: 'var(--red-text)', flexShrink: 0, marginTop: 1 }}><IconWarning /></span>
      <div>
        <strong style={{ fontSize: '0.9rem', color: 'var(--red-text)' }}>
          Bounce rate alto: {bounceRate}%
        </strong>
        <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {bounced} emails rebotaron. Un bounce rate mayor a 15% puede afectar la reputación del remitente en Gmail.
          Revisá los rebotes y eliminá esas direcciones de futuros envíos. Presioná <strong>Sync Gmail</strong> en la sección de Envíos para actualizar la detección.
        </p>
      </div>
    </div>
  );
}
