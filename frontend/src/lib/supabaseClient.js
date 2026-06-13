// Cliente de Supabase Auth — OPCIONAL.
// Sólo se activa si VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY están definidas.
// Sin esas variables la app funciona igual que antes (API key o sin auth).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const authEnabled = Boolean(url && anonKey);

export const supabase = authEnabled ? createClient(url, anonKey) : null;
