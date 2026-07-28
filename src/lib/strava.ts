import { supabase } from './supabase';

// Client side of the Strava link. Deliberately thin: every call goes through
// the strava-sync Edge Function, which holds the client secret and the
// access/refresh tokens. Nothing here ever sees a Strava token.

// Public (it's in the authorize URL either way), so it ships in the bundle
// like the VAPID public key does. The *secret* half lives only in the Edge
// Function's environment.
const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;

export function isStravaConfigured(): boolean {
  return !!CLIENT_ID;
}

// Where Strava sends the browser back to. Must be on the domain registered as
// the app's "Authorization Callback Domain" in the Strava API settings, and
// has to include the base path — the app is served from a subdirectory on
// GitHub Pages, so the bare origin would 404.
export function redirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

// activity:read_all rather than activity:read so private activities are
// visible too — a run you marked private is still a run you did.
const SCOPE = 'activity:read_all';

export function beginLink(): void {
  if (!CLIENT_ID) return;
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', SCOPE);
  window.location.href = url.toString();
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('strava-sync', { body });
  if (error) throw error;
  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

export interface StravaStatus {
  linked: boolean;
  athleteName: string | null;
}

export function stravaStatus(): Promise<StravaStatus> {
  return call<StravaStatus>({ action: 'status' });
}

export function completeLink(code: string): Promise<StravaStatus> {
  return call<StravaStatus>({ action: 'exchange', code });
}

export function unlinkStrava(): Promise<StravaStatus> {
  return call<StravaStatus>({ action: 'disconnect' });
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  startedAt: number;
  elapsedSec: number;
  movingSec: number;
  distanceM: number;
  polyline: string | null;
}

export function fetchStravaActivities(opts: { after?: number; perPage?: number } = {}): Promise<{ activities: StravaActivity[] }> {
  return call<{ activities: StravaActivity[] }>({ action: 'activities', ...opts });
}

// Strava sends the browser back to the app with ?code=... on success, or
// ?error=access_denied if the user declined. Pulled out of the URL and the
// URL cleaned immediately, so a refresh can't replay a spent code (they're
// single-use) and the query string doesn't linger in history.
export function consumeOAuthRedirect(): { code: string | null; denied: boolean } {
  if (typeof window === 'undefined') return { code: null, denied: false };
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  // `scope` accompanies a Strava callback specifically — without checking it,
  // this would also swallow a ?code= belonging to some other OAuth flow.
  const isStrava = !!params.get('scope') || error === 'access_denied';
  if (!code && !error) return { code: null, denied: false };
  if (!isStrava) return { code: null, denied: false };

  params.delete('code');
  params.delete('scope');
  params.delete('state');
  params.delete('error');
  const rest = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  return { code, denied: error === 'access_denied' };
}
