import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — auth and sync will not work.');
}

// Fall back to a syntactically valid placeholder so createClient doesn't throw
// synchronously and crash the whole app when env vars aren't configured yet —
// auth calls will just fail at request time instead, which the UI already handles.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder');

let currentSession: Session | null = null;

supabase.auth.getSession().then(({ data }) => {
  currentSession = data.session;
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
});

export function getCurrentUserId(): string | null {
  return currentSession?.user.id ?? null;
}
