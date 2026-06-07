import { useMemo } from 'react';
import { buildTodayInbox, prettifyAction } from '../AppShell';

export function HoyView({ summary, contacts, reporting, imports, emailJobs, onOpenInWorktray }) {
  const kpis  = useMemo(() => buildKpis(contacts, reporting, emailJobs), [contacts, reporting, emailJobs]);
  const inbox = useMemo(() => buildTodayInbox(contacts), [contacts]);

  return (
    <section className="grid gap-5">

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard
          label="Contactos totales"
          value={summary.total_contacts}
          sub={kpis.newThisWeek > 0 ? `+${kpis.newThisWeek} esta semana` : 'Sin altas esta semana'}
          subColor={kpis.newThisWeek > 0 ? 'positive' : 'neutral'}
        />
        <KpiCard label="Emails enviados" value={kpis.emailsSentWeek} sub="últimos 7 días" />
        <KpiCard
          label="Pendientes hoy"
          value={kpis.pendingEmailsToday}
          sub="correos por salir"
          urgent={kpis.pendingEmailsToday > 0}
        />
        <KpiCard
          label="Tasa de éxito"
          value={kpis.successRate !== null ? `${kpis.successRate}%` : '—'}
          sub={kpis.successRate !== null ? `${kpis.sentJobs} enviados · ${kpis.failedJobs} fallidos` : 'Sin datos suficientes'}
          subColor={kpis.successRate !== null && kpis.successRate >= 80 ? 'positive' : 'neutral'}
        />
      </div>

      {/* ── Prioridades del día ── */}
      <section className="card" aria-labelledby="priorities-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div>
            <span className="eyebrow">Agenda de hoy</span>
            <h3 id="priorities-heading" style={{ margin: '4px 0 0', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              Prioridades del día
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.87rem' }}>
              Clic en cualquier tarjeta para abrir el contacto en la bandeja operativa.
            </p>
          </div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '6px 14px', background: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border-faint)', flexShrink: 0 }}
            aria-live="polite"
          >
            {inbox.total} pendientes
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <PriorityColumn title="Atrasados"   count={inbox.overdue.length}     contacts={inbox.overdue}     onSelect={onOpenInWorktray} variant="urgent"      />
          <PriorityColumn title="Para hoy"    count={inbox.today.length}       contacts={inbox.today}       onSelect={onOpenInWorktray} variant="today"       />
          <PriorityColumn title="Sin agendar" count={inbox.withoutDate.length} contacts={inbox.withoutDate} onSelect={onOpenInWorktray} variant="unscheduled" />
        </div>
      </section>

      {/* ── Actividad reciente ── */}
      <section className="card" aria-labelledby="activity-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Historial</span>
            <h3 id="activity-heading" style={{ margin: '4px 0 0', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              Actividad reciente
            </h3>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.87rem', flexShrink: 0 }}>{imports.length} importaciones</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {imports.length ? (
            imports.slice(0, 6).map(item => <ImportRow key={item.id} item={item} />)
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.93rem', padding: '20px', textAlign: 'center' }}>
              Todavía no hay importaciones registradas.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, subColor = 'neutral', urgent = false }) {
  return (
    <article
      style={{
        borderRadius: 24,
        padding: 22,
        border: urgent ? '1px solid var(--red-text)' : '1px solid var(--border-faint)',
        background: urgent ? 'var(--red-bg)' : 'var(--surface-raised)',
        display: 'grid',
        gap: 10,
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '0.87rem', fontWeight: 500 }}>{label}</span>
      <strong style={{ fontSize: '2rem', lineHeight: 1, fontWeight: 700, color: urgent ? 'var(--red-text)' : 'var(--text-primary)' }}>
        {value}
      </strong>
      {sub && (
        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: subColor === 'positive' ? 'var(--green-text)' : 'var(--text-secondary)' }}>
          {sub}
        </span>
      )}
    </article>
  );
}

const COLUMN_BG = {
  urgent:      { background: 'var(--red-bg)',    border: '1px solid var(--red-text)',   headerColor: 'var(--red-text)',   badgeStyle: { background: 'var(--red-bg)',    color: 'var(--red-text)'   } },
  today:       { background: 'var(--amber-bg)',  border: '1px solid var(--amber-text)', headerColor: 'var(--amber-text)', badgeStyle: { background: 'var(--amber-bg)',  color: 'var(--amber-text)' } },
  unscheduled: { background: 'var(--surface-subtle)', border: '1px solid var(--border-faint)', headerColor: 'var(--text-primary)', badgeStyle: { background: 'var(--surface-raised)', color: 'var(--text-muted)' } },
};

function PriorityColumn({ title, count, contacts, onSelect, variant }) {
  const s = COLUMN_BG[variant];
  const emptyText = {
    urgent: 'Nada atrasado. Buen ritmo.',
    today: 'No hay seguimientos para hoy.',
    unscheduled: 'Todo tiene fecha asignada.',
  }[variant];

  return (
    <article style={{ background: s.background, border: s.border, borderRadius: 22, padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: '1.02rem', color: s.headerColor }}>{title}</strong>
        <span style={{ ...s.badgeStyle, display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 10px', fontSize: '0.82rem', fontWeight: 700 }}>
          {count}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {contacts.length ? (
          contacts.map(contact => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelect(contact)}
              style={{
                borderRadius: 16,
                padding: 14,
                textAlign: 'left',
                display: 'grid',
                gap: 4,
                cursor: 'pointer',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-faint)',
                width: '100%',
                transition: 'border-color 0.15s ease',
              }}
              aria-label={`Abrir ${contact.name || 'contacto'} en la bandeja`}
            >
              <strong style={{ color: 'var(--text-primary)', fontSize: '0.93rem' }}>{contact.name || 'Sin nombre'}</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}
              </span>
            </button>
          ))
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', paddingTop: 4 }}>{emptyText}</div>
        )}
      </div>
    </article>
  );
}

const IMPORT_STATUS_STYLE = {
  confirmed: { background: 'var(--green-bg)', color: 'var(--green-text)' },
  draft:     { background: 'var(--amber-bg)', color: 'var(--amber-text)' },
  error:     { background: 'var(--red-bg)',   color: 'var(--red-text)'   },
};

function ImportRow({ item }) {
  const statusStyle = IMPORT_STATUS_STYLE[item.status] || { background: 'var(--gray-bg)', color: 'var(--gray-text)' };
  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--surface-subtle)', borderRadius: 16, border: '1px solid var(--border-faint)' }}
    >
      <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.93rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename || 'Importación'}</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.total_contacts ?? '?'} contactos</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {date && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{date}</span>}
        <span style={{ ...statusStyle, display: 'inline-flex', borderRadius: 999, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
          {item.status}
        </span>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildKpis(contacts, reporting, emailJobs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const newThisWeek = contacts.filter(c => c.created_at && new Date(c.created_at).getTime() >= weekAgo.getTime()).length;
  const emailsSentWeek = reporting.activity?.last_7d?.enviar ?? 0;
  const pendingEmailsToday = contacts.filter(c =>
    String(c.next_action || '').toLowerCase() === 'enviar' &&
    c.follow_up_date &&
    new Date(`${c.follow_up_date}T00:00:00`).getTime() <= today.getTime()
  ).length;

  const sentJobs   = emailJobs.filter(j => j.status === 'sent' || j.status === 'completed').length;
  const failedJobs = emailJobs.filter(j => j.status === 'failed' || j.status === 'error').length;
  const totalResolved = sentJobs + failedJobs;
  const successRate = totalResolved > 0 ? Math.round((sentJobs / totalResolved) * 100) : null;

  return { newThisWeek, emailsSentWeek, pendingEmailsToday, sentJobs, failedJobs, successRate };
}
