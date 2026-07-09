// Utilidades compartidas entre vistas (antes vivían en AppShell.jsx).

export const worktrayActions = ['enviar', 'revisar', 'portal', 'descartar'];

// Filtros por tab
const ENVIAR_FILTERS = ['hoy', 'en_cola'];
const REVISAR_FILTERS = ['todos', 'rebote_permanente', 'rebote_temporario', 'auto_respuesta'];
const NO_FILTERS = ['todos'];

export const timingFilters = ['todos', 'urgente', 'sin_fecha', 'esta_semana', 'futuro']; // legacy

export function getTabFilters(action) {
  if (action === 'enviar') return ENVIAR_FILTERS;
  if (action === 'revisar') return REVISAR_FILTERS;
  return NO_FILTERS;
}

export function defaultTabFilter(action) {
  if (action === 'enviar') return 'hoy';
  return 'todos';
}

const TAB_FILTER_LABELS = {
  hoy:               'Hoy',
  en_cola:           'En cola',
  todos:             'Todos',
  rebote_permanente: 'Rebote permanente',
  rebote_temporario: 'Rebote temporario',
  auto_respuesta:    'Auto-respuesta',
};

export function prettifyTabFilter(filter) {
  return TAB_FILTER_LABELS[filter] ?? filter;
}

export function matchesTabFilter(contact, action, filter) {
  if (action === 'enviar') {
    if (filter === 'en_cola') return true;
    if (filter === 'hoy') {
      if (!contact.follow_up_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(`${contact.follow_up_date}T00:00:00`);
      return due.getTime() <= today.getTime();
    }
    return true;
  }
  if (action === 'revisar') {
    if (filter === 'todos') return true;
    const hasBounce = Boolean(contact.bounced_at);
    const isTemp = contact.bounce_reason === 'rebote_temporario' || contact.bounce_reason === 'casilla_llena';
    if (filter === 'rebote_permanente') return hasBounce && !isTemp;
    if (filter === 'rebote_temporario') return hasBounce && isTemp;
    if (filter === 'auto_respuesta') return Boolean(contact.autoreply_reason) && !hasBounce;
    return true;
  }
  return true;
}

export function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export function prettifyAction(value) {
  if (value === 'revisar_manual') return 'Revisar manual';
  return capitalize(value);
}

export function prettifyTimingFilter(value) {
  const LABELS = {
    todos:       'Todos',
    urgente:     'Urgente',
    sin_fecha:   'Sin fecha',
    esta_semana: 'Esta semana',
    futuro:      'Futuro',
  };
  return LABELS[value] ?? capitalize(value);
}

export function formatDelta(value) {
  if (!value) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

export function getDeltaClassName(value) {
  if (value > 0) return 'is-positive';
  if (value < 0) return 'is-negative';
  return 'is-neutral';
}

export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR');
}

export function formatFollowUpLabel(value) {
  if (!value) return 'Sin fecha';
  const dateValue = new Date(`${value}T00:00:00`);
  return `Seguimiento ${dateValue.toLocaleDateString('es-AR')}`;
}

export function isFollowUpDue(value) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  return dueDate.getTime() <= today.getTime();
}

export function buildSparklinePoints(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return null;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  return numericValues
    .map((value, index) => {
      const x = (index / (numericValues.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');
}

export function buildMultiSparklineSeries(snapshots) {
  const series = {
    contacts: snapshots.map((s) => s.total_contacts).reverse(),
    active: snapshots.map((s) => s.active_total).reverse(),
    overdue: snapshots.map((s) => s.overdue_count).reverse(),
    withoutDate: snapshots.map((s) => s.without_date_count).reverse(),
  };
  const entries = Object.entries(series).map(([key, values]) => [key, buildSparklinePointsForDomain(values, 64)]);
  const validEntries = entries.filter(([, points]) => Boolean(points));
  if (!validEntries.length) return null;
  return Object.fromEntries(validEntries);
}

function buildSparklinePointsForDomain(values, height) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return null;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  return numericValues
    .map((value, index) => {
      const x = (index / (numericValues.length - 1)) * 100;
      const y = height - 8 - ((value - min) / range) * (height - 16);
      return `${x},${y}`;
    })
    .join(' ');
}

export function getRelativeBarWidth(value, reference) {
  const base = Math.max(value, reference, 1);
  return (value / base) * 100;
}

export function buildTodayInbox(contacts) {
  const actionable = contacts.filter((contact) =>
    worktrayActions.includes(String(contact.next_action || '').toLowerCase()),
  );
  const overdue = [];
  const today = [];
  const withoutDate = [];

  actionable.forEach((contact) => {
    const followUpDate = contact.follow_up_date ? new Date(`${contact.follow_up_date}T00:00:00`) : null;
    const timing = getFollowUpTimingBucket(followUpDate);
    if (timing === 'overdue') overdue.push(contact);
    if (timing === 'today') today.push(contact);
    if (timing === 'without_date') withoutDate.push(contact);
  });

  return {
    overdue: overdue.slice(0, 5),
    today: today.slice(0, 5),
    withoutDate: withoutDate.slice(0, 5),
    total: overdue.length + today.length + withoutDate.length,
  };
}

function getFollowUpTimingBucket(followUpDate) {
  if (!followUpDate || Number.isNaN(followUpDate.getTime())) return 'without_date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (followUpDate.getTime() < today.getTime()) return 'overdue';
  if (followUpDate.getTime() === today.getTime()) return 'today';
  return 'future';
}

const EVENT_LABELS = {
  'email.sent':               'Correo enviado',
  'email.replied':            'Respuesta recibida',
  'email.bounced':            'Email rebotado',
  'email.autoreply':          'Auto-respuesta recibida',
  'contact.created':          'Contacto creado',
  'contact.updated':          'Contacto actualizado',
  'contact.imported':         'Contacto importado',
  'contact.action_executed':  'Acción ejecutada',
  'contact.deleted':          'Contacto eliminado',
  'import.confirmed':         'Importación confirmada',
  'import.preview_created':   'Vista previa creada',
  'import.mock_created':      'Importación de prueba',
  'reminder.sent':            'Recordatorio enviado',
};

export function prettifyEvent(value) {
  return EVENT_LABELS[value] ?? capitalize(String(value || '').replaceAll('.', ' '));
}

export function matchesTimingFilter(value, filter) {
  if (filter === 'todos') return true;
  if (filter === 'sin_fecha') return !value;
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${value}T00:00:00`);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  if (filter === 'urgente')     return diffDays <= 0;
  if (filter === 'esta_semana') return diffDays > 0 && diffDays <= 6;
  if (filter === 'futuro')      return diffDays > 6;
  return true;
}

export function createEmptyReporting() {
  return {
    generated_at: null,
    queue: { overdue: 0, due_today: 0, due_this_week: 0, without_date: 0, active_total: 0 },
    outcomes: {
      portal: { aplicado: 0, pendiente: 0, revisar: 0, total: 0 },
      discard: { total: 0, reasons: [] },
    },
    pipeline: { by_status: [], by_action: [] },
    activity: {
      last_24h: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      last_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      previous_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
      deltas_7d: { enviar: 0, seguir: 0, portal: 0, descartar: 0 },
    },
    stock_comparison: {
      previous_snapshot_date: null,
      current: { total_contacts: 0, active_total: 0, overdue_count: 0, without_date_count: 0 },
      deltas: { total_contacts: 0, active_total: 0, overdue_count: 0, without_date_count: 0 },
    },
    recent_snapshots: [],
  };
}
