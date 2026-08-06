# nudge-dispatcher

Sends "workout still in progress" push notifications. Runs on a schedule
(pg_cron, see the bottom of `supabase/schema.sql`) — it's never called
directly from the app.

## 1. Run the schema

Run `supabase/schema.sql`'s "Phase 6" section (the `push_subscriptions` /
`active_nudges` tables) in the Supabase SQL editor first, if you haven't
already. Leave the `cron.schedule(...)` part at the bottom for last — you
need this function deployed before that will do anything useful.

## 2. Generate a VAPID keypair

This only needs to happen once per project, not per deploy. If you already
have one (e.g. one was generated for you alongside this feature), skip to
step 3.

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. The private key is a real secret —
never put it in client code, a `VITE_*` env var, or git. The public key is
not secret and is meant to end up in the client build.

## 3. Set the function's secrets

```bash
supabase secrets set VAPID_PUBLIC_KEY=<the public key>
supabase secrets set VAPID_PRIVATE_KEY=<the private key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set manually
— every Edge Function gets those automatically.

## 4. Deploy

```bash
supabase functions deploy nudge-dispatcher
```

## 5. Put the public key in the client build

Add the same public key from step 2 as `VITE_VAPID_PUBLIC_KEY` everywhere
`VITE_SUPABASE_URL` already gets set for a build — the GitHub Actions
deploy workflow's secrets, and your own `.env.local` for local dev. This one
is fine to be public (it's sent to every visitor's browser as part of the
push subscription request), just don't mix it up with the private key above.

## 6. Schedule it

Now run the `cron.schedule(...)` statement at the bottom of
`supabase/schema.sql`, filling in your project ref and service role key.

## Verifying it's working

Trigger it manually to check for errors before waiting on the cron schedule:

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/nudge-dispatcher' \
  -H "Authorization: Bearer <service-role-key>"
```

A healthy response looks like `{"processed":0,"sent":0}` when nothing's due
yet. The bearer token must be the **service role key** specifically — the
function rejects anything else with a 401. Supabase's own `verify_jwt` gate
only proves the caller holds *some* valid JWT, and every signed-in user of
the app holds one, so without that check any of them could invoke this and
fire (or exhaust) everyone's nudges. The `cron.schedule(...)` statement
already sends the service role key, so no change is needed there. Check `supabase functions logs nudge-dispatcher` if something looks
wrong — a wrong VAPID key pair (public one saved in the client build not
matching the private one set as a function secret) is the most common
failure, and shows up there as a 401/403 from the push service on send.
