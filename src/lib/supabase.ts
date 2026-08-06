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

type SignOutListener = () => void;
const signOutListeners: SignOutListener[] = [];

// Local Dexie cache is per-browser, not per-account — anything that cares
// about wiping it when the signed-in user changes (see cloudSync.ts) hooks
// in here rather than each registering its own onAuthStateChange listener.
export function onSignedOut(listener: SignOutListener): void {
  signOutListeners.push(listener);
}

supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (event === 'SIGNED_OUT') signOutListeners.forEach((l) => l());
});

export function getCurrentUserId(): string | null {
  return currentSession?.user.id ?? null;
}

// PostgREST caps every response at the project's `max-rows` setting (1000 by
// default). A plain .select() past that limit doesn't error — it silently
// returns a truncated page, which for an ascending-ordered log means the
// NEWEST rows are the ones missing. Every full-table read in this app goes
// through here instead, walking .range() pages until a short page proves
// the end was reached.
const PAGE_SIZE = 1000;
// Purely a runaway guard: if a server ever kept returning full pages (a
// misconfigured range, an unstable sort) this stops at 200k rows rather than
// looping forever on a phone.
const MAX_PAGES = 200;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  console.error(`fetchAllPages hit the ${MAX_PAGES}-page ceiling — results may be incomplete`);
  return rows;
}
