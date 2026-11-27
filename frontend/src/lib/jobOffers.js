// Helpers compartidos de la pestaña "Búsquedas" (también los usa "Hoy").
import { createCareerSession, updateJobOffer } from './api';

export const APPLICATION_STATUS = [
  { id: 'pendiente',  label: 'Pendiente'  },
  { id: 'postulado',  label: 'Postulado'  },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'rechazado',  label: 'Rechazado'  },
  { id: 'cerrado',    label: 'Cerrado'    },
];

export const APPLICATION_STATUS_LABEL = Object.fromEntries(APPLICATION_STATUS.map((s) => [s.id, s.label]));

export const FOLLOW_UP_DAYS = 7;

/** Colores de la nota A–F (usa los tokens del tema, funcionan en claro y oscuro). */
export const SCORE_STYLE = {
  A: { bg: 'var(--green-bg)',  color: 'var(--green-text)' },
  B: { bg: 'var(--blue-subtle)', color: 'var(--blue)' },
  C: { bg: 'var(--amber-bg)',  color: 'var(--amber-text)' },
  D: { bg: 'var(--red-bg)',    color: 'var(--red-text)' },
  F: { bg: 'var(--red-bg)',    color: 'var(--red-text)' },
};

/** Link de Google para encontrar el aviso cuando el link no está o no se pudo confirmar. */
export function googleSearchUrl(offer) {
  const q = [offer.title, offer.company !== 'Confidencial' ? offer.company : '', offer.location, 'empleo']
    .filter(Boolean)
    .join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Días desde la postulación o el último contacto (null si no hay fecha). */
export function daysSinceContact(offer) {
  const base = offer.last_contact_at || offer.applied_at;
  if (!base) return null;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000);
}

export function splitLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

/** Mensaje que se manda al Asistente IA para analizar la oferta. */
export function buildAnalyzeMessage(offer) {
  const lines = [
    'Analizá esta oferta que encontré en la pestaña Búsquedas:',
    '',
    `Empresa: ${offer.company || 'No especificada'}`,
    `Puesto: ${offer.title}`,
    offer.location ? `Ubicación: ${offer.location}` : null,
    offer.source ? `Portal: ${offer.source}` : null,
    offer.url ? `Link: ${offer.url}` : null,
    offer.posted_text ? `Publicado: ${offer.posted_text}` : null,
  ].filter((l) => l !== null);
  if (offer.aviso_summary) {
    lines.push('', 'Lo que pide el aviso (resumen de la búsqueda en Google):', offer.aviso_summary);
  }
  lines.push(
    '',
    'Ojo: este resumen lo armó la búsqueda automática, no es el aviso completo. Si te falta '
    + 'información importante para el análisis, decímelo y te paso el texto o una captura del aviso.',
  );
  return lines.join('\n');
}

/**
 * Abre la oferta en el Asistente IA. Si ya tiene un chat, lo abre; si no, crea uno
 * nuevo, lo vincula a la oferta y le pasa el mensaje para que se envíe solo.
 * Devuelve el `state` para navigate('/asistente', { state }).
 */
export async function prepareAssistantSession(offer) {
  if (offer.career_session_id) {
    return { openSessionId: offer.career_session_id };
  }
  const { id } = await createCareerSession();
  await updateJobOffer(offer.id, { career_session_id: id });
  return { openSessionId: id, autoMessage: buildAnalyzeMessage(offer) };
}
