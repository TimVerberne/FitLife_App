import { useEffect, useState } from 'react';
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

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'checking', userId: null, email: null });

  useEffect(() => {
    let recovery = false;

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setState({
        status: recovery ? 'recovery' : session ? 'signedIn' : 'signedOut',
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (event === 'SIGNED_OUT') recovery = false;
      setState({
        status: recovery ? 'recovery' : session ? 'signedIn' : 'signedOut',
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
      });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
