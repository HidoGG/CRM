import { useMemo } from 'react';
import { buildTodayInbox, prettifyAction } from '../AppShell';

export function HoyView({ summary, contacts, reporting, imports, emailJobs, onOpenInWorktray }) {
  const kpis = useMemo(() => buildKpis(contacts, reporting, emailJobs), [contacts, reporting, emailJobs]);
  const inbox = buildTodayInbox(contacts);

  return (
    <section className="grid gap-5">

      {/* ── Fila de KPIs ── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Contactos totales"
          value={summary.total_contacts}
          sub={kpis.newThisWeek > 0 ? `+${kpis.newThisWeek} esta semana` : 'Sin altas esta semana'}
          subColor={kpis.newThisWeek > 0 ? 'positive' : 'neutral'}
        />
        <KpiCard
          label="Emails enviados"
          value={kpis.emailsSentWeek}
          sub="últimos 7 días"
        />
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
      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between items-start gap-3 mb-5">
          <div>
            <h3 className="m-0 text-xl font-bold">Prioridades del día</h3>
            <p className="m-0 mt-1 text-[#142433]/70 text-[0.9rem]">
              Clic en cualquier tarjeta para abrir el contacto en la bandeja operativa y ejecutar desde ahí.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold shrink-0">
            {inbox.total} pendientes
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <PriorityColumn
            title="Atrasados"
            count={inbox.overdue.length}
            contacts={inbox.overdue}
            onSelect={onOpenInWorktray}
            variant="urgent"
          />
          <PriorityColumn
            title="Para hoy"
            count={inbox.today.length}
            contacts={inbox.today}
            onSelect={onOpenInWorktray}
            variant="today"
          />
          <PriorityColumn
            title="Sin agendar"
            count={inbox.withoutDate.length}
            contacts={inbox.withoutDate}
            onSelect={onOpenInWorktray}
            variant="unscheduled"
          />
        </div>
      </section>

      {/* ── Actividad reciente ── */}
      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h3 className="m-0 text-xl font-bold">Actividad reciente</h3>
            <p className="m-0 mt-1 text-[#142433]/70 text-[0.9rem]">Últimas importaciones procesadas en el sistema.</p>
          </div>
          <span className="text-[#597189] text-[0.9rem] shrink-0">{imports.length} importaciones</span>
        </div>
        <div className="grid gap-[10px]">
          {imports.length ? (
            imports.slice(0, 6).map((item) => <ImportRow key={item.id} item={item} />)
          ) : (
            <div className="text-[#597189] text-[0.95rem] py-4 text-center">
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
    <article className={`rounded-[24px] p-[22px] border shadow-[0_20px_50px_rgba(32,57,82,0.08)] grid gap-[10px] ${
      urgent
        ? 'bg-[#bc4749]/6 border-[#bc4749]/18'
        : 'bg-white/86 border-[#142433]/8'
    }`}>
      <span className="text-[#597189] text-[0.88rem] font-medium">{label}</span>
      <strong className={`text-[2rem] leading-none font-bold ${urgent ? 'text-[#9c2730]' : 'text-[#102538]'}`}>
        {value}
      </strong>
      {sub && (
        <span className={`text-[0.82rem] font-medium ${
          subColor === 'positive' ? 'text-[#1f5c3a]' : 'text-[#597189]'
        }`}>
          {sub}
        </span>
      )}
    </article>
  );
}

const COLUMN_STYLES = {
  urgent: {
    wrapper: 'bg-[#bc4749]/6 rounded-[22px] p-[18px]',
    header: 'text-[#9c2730]',
    badge: 'bg-[#bc4749]/14 text-[#9c2730]',
    card: 'border border-[#bc4749]/14 bg-white/90 hover:bg-white',
    empty: 'text-[#597189]',
  },
  today: {
    wrapper: 'bg-[#e6a340]/8 rounded-[22px] p-[18px]',
    header: 'text-[#7a4f10]',
    badge: 'bg-[#e6a340]/20 text-[#7a4f10]',
    card: 'border border-[#e6a340]/20 bg-white/90 hover:bg-white',
    empty: 'text-[#597189]',
  },
  unscheduled: {
    wrapper: 'bg-[#f4f8fc] rounded-[22px] p-[18px]',
    header: 'text-[#102538]',
    badge: 'bg-[#142433]/8 text-[#597189]',
    card: 'border border-[#142433]/8 bg-white/90 hover:bg-white',
    empty: 'text-[#597189]',
  },
};

function PriorityColumn({ title, count, contacts, onSelect, variant }) {
  const s = COLUMN_STYLES[variant];
  return (
    <article className={s.wrapper}>
      <div className="flex justify-between items-center gap-2 mb-[14px]">
        <strong className={`text-[1.05rem] ${s.header}`}>{title}</strong>
        <span className={`inline-flex items-center rounded-full px-[10px] py-[4px] text-[0.82rem] font-bold ${s.badge}`}>
          {count}
        </span>
      </div>
      <div className="grid gap-[10px]">
        {contacts.length ? (
          contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className={`rounded-[16px] p-[14px] text-left grid gap-[4px] cursor-pointer transition-colors w-full ${s.card}`}
              onClick={() => onSelect(contact)}
            >
              <strong className="text-[#102538] text-[0.95rem]">{contact.name || 'Sin nombre'}</strong>
              <span className="text-[#597189] text-[0.88rem]">
                {contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}
              </span>
            </button>
          ))
        ) : (
          <div className={`text-[0.9rem] py-2 ${s.empty}`}>
            {variant === 'urgent' && 'Nada atrasado. Buen ritmo.'}
            {variant === 'today' && 'No hay seguimientos para hoy.'}
            {variant === 'unscheduled' && 'Todo tiene fecha asignada.'}
          </div>
        )}
      </div>
    </article>
  );
}

const IMPORT_STATUS_STYLES = {
  confirmed: 'bg-[#1f5c3a]/10 text-[#1f5c3a]',
  draft: 'bg-[#e6a340]/16 text-[#7a4f10]',
  error: 'bg-[#bc4749]/12 text-[#9c2730]',
};

function ImportRow({ item }) {
  const statusStyle = IMPORT_STATUS_STYLES[item.status] || 'bg-[#142433]/6 text-[#597189]';
  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-4 py-[14px] px-[18px] bg-[#f6f9fc] rounded-[18px]">
      <div className="grid gap-[2px] flex-1 min-w-0">
        <strong className="text-[#102538] text-[0.95rem] truncate">{item.filename || 'Importación'}</strong>
        <span className="text-[#597189] text-[0.88rem]">{item.total_contacts ?? '?'} contactos</span>
      </div>
      <div className="flex items-center gap-[10px] shrink-0">
        {date && <span className="text-[#597189] text-[0.82rem]">{date}</span>}
        <span className={`inline-flex rounded-full px-[10px] py-[4px] text-[0.82rem] font-semibold ${statusStyle}`}>
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

  const newThisWeek = contacts.filter((c) => {
    if (!c.created_at) return false;
    return new Date(c.created_at).getTime() >= weekAgo.getTime();
  }).length;

  const emailsSentWeek = reporting.activity?.last_7d?.enviar ?? 0;

  const pendingEmailsToday = contacts.filter((c) => {
    if (String(c.next_action || '').toLowerCase() !== 'enviar') return false;
    if (!c.follow_up_date) return false;
    return new Date(`${c.follow_up_date}T00:00:00`).getTime() <= today.getTime();
  }).length;

  const sentJobs = emailJobs.filter((j) => j.status === 'sent' || j.status === 'completed').length;
  const failedJobs = emailJobs.filter((j) => j.status === 'failed' || j.status === 'error').length;
  const totalResolved = sentJobs + failedJobs;
  const successRate = totalResolved > 0 ? Math.round((sentJobs / totalResolved) * 100) : null;

  return { newThisWeek, emailsSentWeek, pendingEmailsToday, sentJobs, failedJobs, successRate };
}
