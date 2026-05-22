// frontend/src/components/views/Dashboard.jsx
import React from 'react';
import { buildTodayInbox, prettifyAction } from '../../AppShell';

export function Dashboard({ summary, imports, contacts, worktrayCounts, reporting, onOpenInWorktray }) {
  const cards = [
    { label: 'Contactos', value: summary.total_contacts },
    { label: 'Empresas', value: summary.total_companies },
    { label: 'Prioridad', value: summary.priority_contacts },
    { label: 'Revisar', value: summary.review_contacts },
  ];
  const inboxToday = buildTodayInbox(contacts);

  return (
    <section className="grid gap-5">
      <div className="grid gap-5 grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <article className="bg-[#ffffff]/90 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)] bg-[radial-gradient(circle_at_top_right,rgba(75,179,253,0.12),transparent_34%),rgba(255,255,255,0.9)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#184e77]/10 text-[#184e77] text-[0.84rem] font-bold">Resumen operativo</span>
          <h2 className="m-0 mt-3 text-2xl font-bold">Base propia para reemplazar la parte operativa del Excel.</h2>
          <p className="mt-2 mb-0 text-[#142433]/70 leading-relaxed">
            Ahora el flujo ya queda dividido en dos etapas claras: importar para guardar y
            operar despues desde una bandeja accionable.
          </p>

          <div className="mt-5 grid grid-cols-4 gap-3">
            {cards.map((card) => (
              <div key={card.label} className="bg-[#f4f8fc] border border-[#142433]/8 rounded-[18px] p-[14px]">
                <span className="block text-[#597189] text-[0.88rem]">{card.label}</span>
                <strong className="text-[1.5rem] text-[#142433]">{card.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#e6a340]/16 text-[#9a6111] text-[0.84rem] font-bold">Bandeja activa</span>
          <h3 className="m-0 mt-3 text-xl font-bold">Trabajo diario sin volver al preview</h3>
          <div className="mt-[18px] grid grid-cols-2 gap-3">
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{worktrayCounts.enviar || 0}</strong>
              <span className="text-[#597189]">Enviar</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{worktrayCounts.seguir || 0}</strong>
              <span className="text-[#597189]">Seguir</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.queue.overdue}</strong>
              <span className="text-[#597189]">Vencidos</span>
            </div>
            <div className="p-[14px] rounded-[18px] bg-[#f4f8fc]">
              <strong className="block text-[1.4rem] text-[#142433]">{reporting.outcomes.portal.aplicado}</strong>
              <span className="text-[#597189]">Portales aplicados</span>
            </div>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <div className="flex justify-between gap-3 items-start mb-[14px]">
            <h3 className="m-0 text-xl font-bold">Flujo recomendado</h3>
            <span className="text-[#597189] text-[0.9rem]">Operativo</span>
          </div>
          <ol className="m-0 pl-5 leading-[1.8] text-[#173047]">
            <li>Subir archivo.</li>
            <li>Confirmar los candidatos utiles.</li>
            <li>Entrar a la bandeja por tipo de accion.</li>
            <li>Ejecutar enviar, seguir, portal o descartar sin volver al preview.</li>
          </ol>
        </section>

        <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
          <div className="flex justify-between gap-3 items-start mb-[14px]">
            <h3 className="m-0 text-xl font-bold">Actividad reciente</h3>
            <span className="text-[#597189] text-[0.9rem]">24h / 7 dias</span>
          </div>
          <div className="grid gap-3">
            {imports.length ? (
              imports.slice(0, 4).map((item) => (
                <div key={item.id} className="flex justify-between gap-4 py-[14px] px-4 bg-[#f6f9fc] rounded-[16px]">
                  <strong className="text-[#142433]">{item.filename}</strong>
                  <span className="text-[#597189]">
                    {item.total_contacts} contactos · {item.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex justify-between gap-4 py-[14px] px-4 bg-[#f6f9fc] rounded-[16px]">
                <strong className="text-[#142433]">Sin actividad</strong>
                <span className="text-[#597189]">Registra una importacion desde el panel</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="bg-white/86 rounded-[24px] p-[22px] border border-[#142433]/8 shadow-[0_20px_50px_rgba(32,57,82,0.08)]">
        <div className="flex justify-between gap-3 items-start mb-[14px]">
          <div>
            <h3 className="m-0 text-xl font-bold">Inbox de hoy</h3>
            <p className="m-0 mt-1 text-[#142433]/70">Lo primero que conviene resolver hoy entre vencidos, agenda del dia y pendientes sin fecha.</p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1.5 bg-[#1a2b3d]/8 text-[#163047] text-[0.84rem] font-bold">{inboxToday.total} items</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
            <div className="flex justify-between items-start gap-3">
              <strong className="text-[#102538] text-[1.05rem]">Vencidos</strong>
              <span className="text-[#597189]">{inboxToday.overdue.length}</span>
            </div>
            <div className="grid gap-[10px]">
              {inboxToday.overdue.length ? (
                inboxToday.overdue.map((contact) => (
                  <button
                    key={`overdue-${contact.id}`}
                    type="button"
                    className="border border-[#142433]/8 bg-white/90 rounded-[16px] p-[14px] text-left grid gap-[6px] text-[#173047] cursor-pointer hover:bg-white transition-colors"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong className="text-[#102538]">{contact.name || 'Sin nombre'}</strong>
                    <span className="text-[#597189] text-[0.92rem]">{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="text-[#597189] text-[0.9rem]">Nada vencido para resolver ahora.</div>
              )}
            </div>
          </article>

          <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
            <div className="flex justify-between items-start gap-3">
              <strong className="text-[#102538] text-[1.05rem]">Para hoy</strong>
              <span className="text-[#597189]">{inboxToday.today.length}</span>
            </div>
            <div className="grid gap-[10px]">
              {inboxToday.today.length ? (
                inboxToday.today.map((contact) => (
                  <button
                    key={`today-${contact.id}`}
                    type="button"
                    className="border border-[#142433]/8 bg-white/90 rounded-[16px] p-[14px] text-left grid gap-[6px] text-[#173047] cursor-pointer hover:bg-white transition-colors"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong className="text-[#102538]">{contact.name || 'Sin nombre'}</strong>
                    <span className="text-[#597189] text-[0.92rem]">{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="text-[#597189] text-[0.9rem]">No hay seguimientos marcados para hoy.</div>
              )}
            </div>
          </article>

          <article className="bg-[#f6f9fc] rounded-[22px] p-[18px] grid gap-[14px]">
            <div className="flex justify-between items-start gap-3">
              <strong className="text-[#102538] text-[1.05rem]">Sin fecha</strong>
              <span className="text-[#597189]">{inboxToday.withoutDate.length}</span>
            </div>
            <div className="grid gap-[10px]">
              {inboxToday.withoutDate.length ? (
                inboxToday.withoutDate.map((contact) => (
                  <button
                    key={`without-date-${contact.id}`}
                    type="button"
                    className="border border-[#142433]/8 bg-white/90 rounded-[16px] p-[14px] text-left grid gap-[6px] text-[#173047] cursor-pointer hover:bg-white transition-colors"
                    onClick={() => onOpenInWorktray(contact)}
                  >
                    <strong className="text-[#102538]">{contact.name || 'Sin nombre'}</strong>
                    <span className="text-[#597189] text-[0.92rem]">{contact.company || 'Sin empresa'} · {prettifyAction(contact.next_action)}</span>
                  </button>
                ))
              ) : (
                <div className="text-[#597189] text-[0.9rem]">Todo lo operativo ya tiene fecha.</div>
              )}
            </div>
          </article>
        </div>
      </section>
    </section>
  );
}
