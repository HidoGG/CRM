// Capa de acceso a la API del backend.
import { authEnabled, supabase } from './supabaseClient';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const _API_KEY = import.meta.env.VITE_API_KEY || '';

// Token de sesión de Supabase (si el login está activo). Se mantiene
// actualizado vía onAuthStateChange en AppShell.
let _accessToken = '';
export function setAccessToken(token) {
  _accessToken = token || '';
}

/** Drop-in fetch que inyecta credenciales en todas las llamadas al backend. */
export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authEnabled && _accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`);
  } else if (_API_KEY) {
    headers.set('X-API-Key', _API_KEY);
  }
  return fetch(url, { ...options, headers });
}

async function getJson(path) {
  const res = await apiFetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status} en ${path}`);
  }
  return res.json();
}

const PAGE_SIZE = 500;

/**
 * Trae TODOS los contactos paginando de a 500 hasta agotar.
 * El backend limita cada página a 500; sin este loop, el contacto 501+
 * sería invisible en la UI.
 */
export async function fetchAllContacts() {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getJson(`/contacts?limit=${PAGE_SIZE}&offset=${offset}`);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

export const fetchers = {
  health: () => getJson('/health'),
  contacts: fetchAllContacts,
  summary: () => getJson('/summary'),
  imports: () => getJson('/imports'),
  capabilities: () => getJson('/capabilities'),
  reporting: () => getJson('/reporting/overview'),
  templates: () => getJson('/templates'),
  cvFiles: () => getJson('/cv-files'),
  schedules: () => getJson('/schedules'),
  emailJobs: () => getJson('/email-jobs'),
  gmailStatus: () => getJson('/gmail/status'),
  templateStats: () => getJson('/engagement/template-stats'),
  sectorDefaults: () => getJson('/sector-defaults'),
};

// ── Career / Agente de RRHH ──────────────────────────────────────────────────

export async function fetchCareerSessions() {
  return getJson('/career/sessions');
}

export async function createCareerSession() {
  const res = await apiFetch(`${API_BASE}/career/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error('No se pudo crear la sesión');
  return res.json();
}

export async function deleteCareerSession(sessionId) {
  const res = await apiFetch(`${API_BASE}/career/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('No se pudo eliminar la sesión');
  return res.json();
}

export async function fetchCareerSession(sessionId) {
  return getJson(`/career/sessions/${sessionId}`);
}

export async function sendCareerMessage(sessionId, message, imageFile = null) {
  let body, headers;
  if (imageFile) {
    const fd = new FormData();
    fd.append('message', message);
    fd.append('image', imageFile);
    body = fd;
  } else {
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({ message });
  }
  const res = await apiFetch(`${API_BASE}/career/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error del agente');
  }
  return res.json();
}

export async function createCareerDraft(sessionId, cvId = null, to = null) {
  const res = await apiFetch(`${API_BASE}/career/sessions/${sessionId}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv_id: cvId, to }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'No se pudo crear el borrador');
  }
  return res.json();
}

export async function patchSectorDefault(sector, templateId, cvFileId) {
  const res = await apiFetch(`${API_BASE}/sector-defaults/${sector}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId ?? null, cv_file_id: cvFileId ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}
