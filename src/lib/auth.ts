import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AuthStatus = 'checking' | 'signedOut' | 'signedIn' | 'recovery';

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
}

function redirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

export async function signUpWithPassword(email: string, password: string) {
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

// A password-recovery link lands here with `#access_token=...&type=recovery`
// in the URL. supabase-js processes that fragment and makes the session
// live *before* it delivers the PASSWORD_RECOVERY event to onAuthStateChange
// listeners (the event is scheduled via setTimeout(0), a macrotask, so it
// fires strictly after the current microtask queue — including any
// getSession().then() callback already in flight). That ordering means
// relying on the event alone leaves a real window where useAuthState would
// report 'signedIn' with a fully valid session, before flipping to
// 'recovery' a moment later — worse if the tab was backgrounded when the
// link was opened, since browsers throttle timers there. Checking the URL
// ourselves, synchronously, sidesteps that race entirely: we know it's a
// recovery flow before any async call resolves.
let recoveryActive = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');
const recoveryListeners = new Set<() => void>();

// Called once a new password has been set — otherwise nothing would ever
// clear recoveryActive, and the recovery screen would stay up forever even
// after a successful reset (the session itself doesn't change on
// updateUser(), so no SIGNED_OUT/SIGNED_IN event would naturally do it).
export function clearRecovery(): void {
  recoveryActive = false;
  if (typeof window !== 'undefined' && window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  recoveryListeners.forEach((notify) => notify());
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>(() => ({
    status: recoveryActive ? 'recovery' : 'checking',
    userId: null,
    email: null,
  }));

  useEffect(() => {
    let latestSession: Session | null = null;

    function recompute(session: Session | null) {
      setState({
        status: recoveryActive ? 'recovery' : session ? 'signedIn' : 'signedOut',
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
      });
    }

    supabase.auth.getSession().then(({ data }) => {
      latestSession = data.session;
      recompute(latestSession);
    });

    const onRecoveryCleared = () => recompute(latestSession);
    recoveryListeners.add(onRecoveryCleared);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      latestSession = session;
      if (event === 'PASSWORD_RECOVERY') recoveryActive = true;
      if (event === 'SIGNED_OUT') recoveryActive = false;
      recompute(session);
    });

    return () => {
      sub.subscription.unsubscribe();
      recoveryListeners.delete(onRecoveryCleared);
    };
  }, []);

  return state;
}
