// Supabase Edge Function: everything that talks to Strava.
//
// It exists because Strava's OAuth exchange needs the app's client_secret,
// which can never ship to a browser — the app is a static site on GitHub
// Pages, so anything in the bundle is public. Access/refresh tokens therefore
// live server-side too and are never returned to the client; the client only
// ever asks this function for already-normalised results.
//
// Called from the app via supabase.functions.invoke('strava-sync', ...),
// which forwards the caller's Supabase JWT — that's what identifies the user.
//
// Deploy + configure: see ./README.md in this directory.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const clientId = Deno.env.get('STRAVA_CLIENT_ID')!;
const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')!;

const admin = createClient(supabaseUrl, serviceRoleKey);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface TokenRow {
  user_id: string;
  athlete_id: number;
  athlete_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function stravaToken(params: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token request failed (${res.status})`);
  return (await res.json()) as StravaTokenResponse;
}

// Returns a usable access token for this user, refreshing (and persisting the
// rotated refresh token — Strava rotates it on every refresh) when the stored
// one is within a minute of expiry.
async function accessTokenFor(userId: string): Promise<string | null> {
  const { data } = await admin.from('strava_tokens').select('*').eq('user_id', userId).maybeSingle();
  const row = data as TokenRow | null;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return row.access_token;

  const refreshed = await stravaToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await admin
    .from('strava_tokens')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  return refreshed.access_token;
}

// Only the fields the app actually uses — deliberately not the raw Strava
// payload, so the client never has to know Strava's shape and nothing
// sensitive (tokens, athlete internals) leaks through.
interface NormalisedActivity {
  id: number;
  name: string;
  type: string;
  startedAt: number; // ms epoch
  elapsedSec: number;
  movingSec: number;
  distanceM: number;
  polyline: string | null;
}

interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  map?: { summary_polyline?: string | null };
}

function normalise(a: StravaActivity): NormalisedActivity {
  return {
    id: a.id,
    name: a.name,
    type: a.sport_type ?? a.type ?? 'Workout',
    startedAt: new Date(a.start_date).getTime(),
    elapsedSec: a.elapsed_time,
    movingSec: a.moving_time,
    distanceM: a.distance,
    polyline: a.map?.summary_polyline ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Identify the caller from the forwarded Supabase JWT. Everything below is
    // scoped to this user id — the function never takes a user id from the
    // request body, so a caller can't act as someone else.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'not-signed-in' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'not-signed-in' }, 401);
    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; after?: number; perPage?: number };

    switch (body.action) {
      // --- Finish the OAuth handshake the browser started. -----------------
      case 'exchange': {
        if (!body.code) return json({ error: 'missing-code' }, 400);
        const t = await stravaToken({ grant_type: 'authorization_code', code: body.code });
        const name = [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(' ') || null;
        const { error } = await admin.from('strava_tokens').upsert({
          user_id: userId,
          athlete_id: t.athlete?.id ?? 0,
          athlete_name: name,
          access_token: t.access_token,
          refresh_token: t.refresh_token,
          expires_at: new Date(t.expires_at * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        return json({ linked: true, athleteName: name });
      }

      // --- Is this account linked, and to whom? ----------------------------
      case 'status': {
        const { data } = await admin
          .from('strava_tokens')
          .select('athlete_name, athlete_id')
          .eq('user_id', userId)
          .maybeSingle();
        return json({ linked: !!data, athleteName: data?.athlete_name ?? null });
      }

      // --- Forget the link. -------------------------------------------------
      case 'disconnect': {
        // Best-effort revoke on Strava's side too, so the app disappears from
        // the user's Strava "My Apps" list rather than lingering with access.
        const token = await accessTokenFor(userId).catch(() => null);
        if (token) {
          await fetch('https://www.strava.com/oauth/deauthorize', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        await admin.from('strava_tokens').delete().eq('user_id', userId);
        return json({ linked: false });
      }

      // --- Recent activities, normalised. -----------------------------------
      case 'activities': {
        const token = await accessTokenFor(userId);
        if (!token) return json({ error: 'not-linked' }, 409);
        const perPage = Math.min(Math.max(body.perPage ?? 30, 1), 100);
        const url = new URL('https://www.strava.com/api/v3/athlete/activities');
        url.searchParams.set('per_page', String(perPage));
        if (body.after) url.searchParams.set('after', String(Math.floor(body.after / 1000)));
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 429) return json({ error: 'rate-limited' }, 429);
        if (!res.ok) return json({ error: `strava-${res.status}` }, 502);
        const raw = (await res.json()) as StravaActivity[];
        return json({ activities: raw.map(normalise) });
      }

      default:
        return json({ error: 'unknown-action' }, 400);
    }
  } catch (err) {
    console.error('strava-sync failed', err);
    return json({ error: 'server-error' }, 500);
  }
});
