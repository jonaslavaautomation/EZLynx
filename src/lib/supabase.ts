import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the env vars are missing; the app then runs in browser-storage mode. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws on an empty URL, which would blank the whole app; use a placeholder that is never called.
export const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseAnonKey || 'not-configured');

export type { Account } from '@/lib/types';
