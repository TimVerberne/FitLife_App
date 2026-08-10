// Supabase Edge Function: dispatches "workout still in progress" push
// nudges. Invoked on a schedule by pg_cron (see the bottom of
// supabase/schema.sql) — never called from the client directly.
//
// Runs with the service-role key, so it bypasses RLS entirely and can read
// every user's active_nudges/push_subscriptions rows on its own tick.
//
// Deploy + configure: see ./README.md in this directory.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:example@example.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

// Re-nudge delay is fixed at 5 minutes per the feature spec — not
// configurable per-user, only whether a second nudge happens at all
// (max_nudges, set by the client from the "remind again" setting).
const RENUDGE_DELAY_MS = 5 * 60 * 1000;

// Supabase's own `verify_jwt` gate only proves the caller holds SOME valid
// JWT — and every signed-in user of the app holds one. Without the check
// below, any of them could POST this endpoint on demand: firing everyone's
// due nudges early, and burning through each user's max_nudges so the real
// reminder never arrives. The pg_cron job already sends the service-role key
// as its bearer (see the cron.schedule block in schema.sql), so this asks for
// exactly that and needs no change to the schedule.
function isAuthorizedCaller(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return timingSafeEqual(token, serviceRoleKey);
}

// Compares in time independent of where the first difference falls, so the
// endpoint can't be used to recover the key one character at a time.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ActiveNudgeRow {
  user_id: string;
  session_name: string;
  sets_logged: number;
  next_fire_at: string;
  nudges_sent: number;
  max_nudges: number;
}

// The Supabase client is created inside the handler, so the helper below
// takes it as a parameter. Typed structurally rather than importing the
// generic client type, which would need the full database typings.
type SupabaseLike = ReturnType<typeof createClient>;

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (!isAuthorizedCaller(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // A row only ever exists here while it's still owed at least one more
  // nudge — the loop below deletes it once nudges_sent reaches max_nudges,
  // so there's no need to filter on that here too; anything due is due.
  const { data: dueNudges, error: nudgeErr } = await supabase
    .from('active_nudges')
    .select('*')
    .lte('next_fire_at', new Date().toISOString());

  if (nudgeErr) {
    console.error('Failed to fetch due nudges', nudgeErr);
    return new Response(JSON.stringify({ error: nudgeErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  for (const nudge of (dueNudges ?? []) as ActiveNudgeRow[]) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', nudge.user_id);

    const setCount = nudge.sets_logged;
    const payload = JSON.stringify({
      title: nudge.session_name,
      body: `\u{1F4AA} Still going? ${setCount} set${setCount === 1 ? '' : 's'} logged — tap to resume.`,
    });

    for (const sub of (subs ?? []) as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Expired or unsubscribed at the push service — prune instead of
          // retrying forever on every future tick.
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Push send failed for user', nudge.user_id, err);
        }
      }
    }

    const nudgesSent = nudge.nudges_sent + 1;
    if (nudgesSent >= nudge.max_nudges) {
      await supabase.from('active_nudges').delete().eq('user_id', nudge.user_id);
    } else {
      await supabase
        .from('active_nudges')
        .update({ nudges_sent: nudgesSent, next_fire_at: new Date(Date.now() + RENUDGE_DELAY_MS).toISOString() })
        .eq('user_id', nudge.user_id);
    }
  }

  const reactionsSent = await dispatchReactionNotifications(supabase);

  return new Response(JSON.stringify({ processed: dueNudges?.length ?? 0, sent, reactionsSent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

interface PendingReactionRow {
  id: string;
  recipient_id: string;
  session_id: string;
  reactor_id: string;
  code: string;
}

const REACTION_GLYPH: Record<string, string> = {
  fire: '🔥',
  flex: '💪',
  clap: '👏',
  grit: '😤',
  party: '🎉',
  respect: '💯',
};

// Drains the reaction queue on the same tick as the nudges above. Everything
// queued since the last tick for the same (recipient, workout) collapses into
// ONE notification — that batching is the entire reason reactions queue
// rather than pushing on insert. Three friends reacting to the same workout
// should buzz a phone once, not three times.
async function dispatchReactionNotifications(supabase: SupabaseLike): Promise<number> {
  const { data: pending, error } = await supabase
    .from('pending_reaction_notifications')
    .select('id, recipient_id, session_id, reactor_id, code')
    .order('created_at');

  if (error) {
    console.error('Failed to fetch pending reaction notifications', error);
    return 0;
  }
  const rows = (pending ?? []) as PendingReactionRow[];
  if (rows.length === 0) return 0;

  // Group by who's being told, about which workout.
  const groups = new Map<string, PendingReactionRow[]>();
  for (const row of rows) {
    const key = `${row.recipient_id}:${row.session_id}`;
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  // Resolved in bulk rather than per group — a busy tick would otherwise fan
  // out into dozens of single-row lookups.
  const recipientIds = [...new Set(rows.map((r) => r.recipient_id))];
  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const reactorIds = [...new Set(rows.map((r) => r.reactor_id))];

  const [settingsRes, sessionsRes, profilesRes] = await Promise.all([
    supabase.from('settings').select('user_id, data').in('user_id', recipientIds),
    supabase.from('sessions').select('id, name').in('id', sessionIds),
    supabase.from('profiles').select('id, display_name').in('id', reactorIds),
  ]);

  // Checked HERE rather than when the row was queued, so turning the setting
  // off silences everything still waiting rather than only what comes after.
  const wantsPush = new Map<string, boolean>();
  for (const s of (settingsRes.data ?? []) as { user_id: string; data: Record<string, unknown> | null }[]) {
    wantsPush.set(s.user_id, s.data?.notifyReactions !== false);
  }
  const sessionName = new Map<string, string>();
  for (const s of (sessionsRes.data ?? []) as { id: string; name: string }[]) sessionName.set(s.id, s.name);
  const reactorName = new Map<string, string>();
  for (const p of (profilesRes.data ?? []) as { id: string; display_name: string | null }[]) {
    reactorName.set(p.id, p.display_name?.trim() || 'Someone');
  }

  let sent = 0;
  const doneIds: string[] = [];

  for (const group of groups.values()) {
    // Consumed either way: a row that isn't going to be sent must still be
    // cleared, or the queue grows forever for anyone with pushes switched off.
    doneIds.push(...group.map((r) => r.id));

    const recipientId = group[0].recipient_id;
    // Default true — a user who has never written a settings row still wants
    // the notification they implicitly opted into by enabling push at all.
    if (wantsPush.get(recipientId) === false) continue;

    const workout = sessionName.get(group[0].session_id) ?? 'your workout';
    const names = [...new Set(group.map((r) => reactorName.get(r.reactor_id) ?? 'Someone'))];
    const glyphs = [...new Set(group.map((r) => REACTION_GLYPH[r.code] ?? '👏'))].join('');

    const body =
      names.length === 1
        ? `${names[0]} reacted ${glyphs} to ${workout}`
        : `${names[0]} and ${names.length - 1} other${names.length === 2 ? '' : 's'} reacted ${glyphs} to ${workout}`;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', recipientId);

    // sessionId rides along so tapping the notification can open that exact
    // workout — see the notificationclick handler in src/sw.ts.
    const payload = JSON.stringify({ title: 'FitFlow', body, sessionId: group[0].session_id });

    for (const sub of (subs ?? []) as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Reaction push failed for user', recipientId, err);
        }
      }
    }
  }

  if (doneIds.length > 0) {
    const { error: delErr } = await supabase.from('pending_reaction_notifications').delete().in('id', doneIds);
    // Left queued on failure, which means a duplicate notification next tick
    // rather than a silently lost one. The right way round for a nice-to-have.
    if (delErr) console.error('Failed to clear sent reaction notifications', delErr);
  }
  return sent;
}
