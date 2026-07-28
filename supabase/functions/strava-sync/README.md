# strava-sync

Everything that talks to Strava. The app never calls Strava directly — it
calls this function, which holds the client secret and the access/refresh
tokens. Nothing Strava-related is ever exposed to the browser.

Until this is set up, the Strava row in Settings shows a "not set up for this
build" note instead of a Link button, and nothing else in the app changes.

## 1. Run the schema

Run `supabase/schema.sql`'s **Phase 12** section in the Supabase SQL editor.
It creates `strava_tokens` and adds two nullable columns to `sessions`
(`strava_activity_id`, `route_polyline`). It's additive — safe on a live
database, and existing sessions are untouched.

## 2. Create a Strava API application

Go to <https://www.strava.com/settings/api> and create one. You'll get a
**Client ID** and a **Client Secret**.

Set **Authorization Callback Domain** to the domain the app is served from,
with no scheme and no path:

```
timverberne.github.io
```

For local development you'd use `localhost` instead — Strava only allows one
callback domain per application, so if you want both you need a second
Strava application for dev.

## 3. Set the function's secrets

The client secret is a real secret: never put it in client code, a `VITE_*`
variable, or git.

```bash
supabase secrets set STRAVA_CLIENT_ID=<your client id>
supabase secrets set STRAVA_CLIENT_SECRET=<your client secret>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by
the platform — you don't set those.

## 4. Deploy the function

```bash
supabase functions deploy strava-sync
```

It's called from the app with the user's Supabase JWT (via
`supabase.functions.invoke`), so leave JWT verification enabled — the function
identifies the user from that token and refuses anonymous calls.

## 5. Give the client the public half

The Client ID is not secret (it appears in the authorize URL either way), so
it ships in the bundle like the VAPID public key does. Add it alongside the
existing build secrets:

```
VITE_STRAVA_CLIENT_ID=<your client id>
```

For GitHub Pages that means adding it as a repository secret and passing it
in `.github/workflows/deploy-pages.yml` next to `VITE_SUPABASE_URL` etc.

Once it's in the build, Settings → Connections shows **Link account**.

## What the function does

One endpoint, dispatched on an `action` in the POST body:

| action | purpose |
|---|---|
| `exchange` | Trades the OAuth `code` the browser came back with for tokens, and stores them |
| `status` | Whether this user is linked, and the athlete's name |
| `disconnect` | Deauthorises with Strava, then deletes the stored tokens |
| `activities` | Recent activities, normalised to just the fields the app uses |

Access tokens last about six hours; the function refreshes on demand and
persists the rotated refresh token (Strava issues a new one each refresh).

## Terms

Strava's API agreement requires visible attribution wherever their data is
shown — the app renders "Powered by Strava" on the Settings row once linked.
Check their current [API agreement](https://www.strava.com/legal/api) and
brand guidelines before shipping this anywhere public; the rules are a
condition of API access, not a courtesy.
