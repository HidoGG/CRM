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
