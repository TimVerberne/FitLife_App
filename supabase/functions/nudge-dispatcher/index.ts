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

interface ActiveNudgeRow {
  user_id: string;
  session_name: string;
  sets_logged: number;
  next_fire_at: string;
  nudges_sent: number;
  max_nudges: number;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async () => {
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

  return new Response(JSON.stringify({ processed: dueNudges?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
