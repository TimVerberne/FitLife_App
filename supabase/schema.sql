-- FitFlow Phase 4 schema. Run once in the Supabase SQL editor (SQL Editor -> New query).

create table public.routines (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exercise_ids text[] not null default '{}',
  created_at bigint not null
);
create index routines_user_created_idx on public.routines (user_id, created_at);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  person text not null default 'You' check (person = 'You'), -- Sanne/Joost demo data never syncs
  name text not null,
  routine_id uuid references public.routines(id) on delete set null,
  started_at bigint not null,
  duration_min integer not null,
  entries jsonb not null default '[]'
);
create index sessions_user_started_idx on public.sessions (user_id, started_at);

create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;

create policy "own routines" on public.routines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings" on public.settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- FitFlow Phase 5 schema. Run once, after the Phase 4 schema above already exists.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

-- Any authenticated user can read any profile row. RLS can't restrict which
-- email a client searches for anyway (the query is client-controlled), so
-- the only real choice is broad read vs. hiding everything behind a Postgres
-- function. Broad read is fine for a personal app with a handful of trusted
-- users.
create policy "profiles readable by authenticated users" on public.profiles
  for select to authenticated using (true);

create policy "users manage own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row on signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill for accounts that signed up before this trigger existed.
insert into public.profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- A declined pair doesn't block a fresh request later.
create unique index friendships_unique_pair_idx on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status <> 'declined';

alter table public.friendships enable row level security;

create policy "select own friendships" on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "insert own friend request" on public.friendships for insert
  with check (auth.uid() = requester_id and status = 'pending');

create policy "addressee updates status" on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

create policy "participants can delete" on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Additive SELECT policy on the existing sessions table — the "own sessions"
-- policy above stays untouched; Postgres OR's multiple permissive SELECT
-- policies together, so a user sees their own rows plus any accepted
-- friend's rows.
create policy "friends can read your sessions" on public.sessions for select
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = sessions.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = sessions.user_id))
    )
  );

-- Self-service account deletion. Deletes the auth.users row for the calling
-- user, which cascades to profiles, routines, sessions, settings,
-- friendships, push_subscriptions, active_nudges, body_profile, body_log,
-- and water_log (every one of those tables references auth.users or
-- profiles with "on delete cascade"), plus Supabase's own internal auth tables
-- (identities, sessions, refresh tokens) which cascade from auth.users by
-- Supabase's own schema design. security definer runs this as the function
-- owner (the postgres role, which has the necessary privileges on the auth
-- schema) rather than as the calling user, since a normal authenticated
-- client has no direct access to auth.users.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;

-- Security fix: the "addressee updates status" policy's WITH CHECK only
-- constrains the *new* row's addressee_id/status — it never pins
-- requester_id to stay the same. RLS policies can't compare OLD vs NEW
-- columns on their own (USING sees the pre-update row, WITH CHECK sees the
-- post-update row, but neither sees both at once), so this needs a trigger.
-- Without it, anyone who is the addressee on ANY friendship row (including
-- one they created themselves, from a throwaway account, to themselves) can
-- UPDATE that row's requester_id to an arbitrary victim's profile id while
-- setting status='accepted' — instantly satisfying the "friends can read
-- your sessions" policy and reading that victim's entire workout history,
-- with no consent or awareness on the victim's part.
create or replace function public.lock_friendship_requester()
returns trigger
language plpgsql
as $$
begin
  if new.requester_id <> old.requester_id then
    raise exception 'requester_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger friendships_lock_requester
  before update on public.friendships
  for each row execute procedure public.lock_friendship_requester();

-- Phase 6: "Workout still in progress" push nudge.
-- Run this in the Supabase SQL editor, then follow supabase/functions/
-- nudge-dispatcher/README.md to deploy the dispatcher and schedule it.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per user (primary key), upserted by the client on background and
-- deleted by the client on foreground/finish/discard — see armNudge() /
-- disarmNudge() in src/lib/pushNudges.ts. The dispatcher Edge Function runs
-- with the service-role key, which bypasses RLS entirely, so it can read
-- and update every user's row on its own schedule; no extra policy needed
-- for it.
create table public.active_nudges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_name text not null,
  sets_logged integer not null default 0,
  next_fire_at timestamptz not null,
  nudges_sent integer not null default 0,
  max_nudges integer not null default 2,
  updated_at timestamptz not null default now()
);

alter table public.active_nudges enable row level security;
create policy "own active nudges" on public.active_nudges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Schedules the dispatcher Edge Function to run every minute (pg_cron's
-- standard granularity — some Supabase projects support finer-grained
-- "N seconds" schedules too, but a 1-minute tick already matches the
-- feature's own "~30-60s" timing note, so there's no need to rely on that).
-- Replace <project-ref> and <service-role-key> below, then run this after
-- the Edge Function is deployed (see supabase/functions/nudge-dispatcher/README.md).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'nudge-dispatcher-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/nudge-dispatcher',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To change the schedule later (e.g. after confirming your project's
-- pg_cron supports sub-minute intervals): select cron.unschedule('nudge-dispatcher-tick');
-- then re-run cron.schedule(...) with a new interval.

-- Phase 7: "Life" tab — body measurements, composition, nutrition, hydration.
-- This is the most sensitive data in the app: unlike `sessions`, none of
-- these tables ever get a friends-readable SELECT policy, and nothing here
-- is ever exposed to the crew feed or Stats head-to-head.

create table public.body_profile (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  height_cm       numeric(5,1),
  birth_year      int,
  sex_at_birth    text check (sex_at_birth in ('male', 'female')),
  activity        text not null default 'moderate'
                    check (activity in ('sedentary', 'light', 'moderate', 'very', 'extra')),
  goal            text not null default 'maintain' check (goal in ('lose', 'maintain', 'gain')),
  rate_kg_week    numeric(3,2) not null default 0.5,
  climate         text not null default 'temperate' check (climate in ('temperate', 'hot')),
  sweat_rate_ml_h numeric(6,1),
  updated_at      timestamptz not null default now()
);

create table public.body_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  logged_on    date not null,
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  waist_cm     numeric(5,1),
  chest_cm     numeric(5,1),
  arm_cm       numeric(5,1),
  thigh_cm     numeric(5,1),
  hip_cm       numeric(5,1),
  neck_cm      numeric(5,1),
  sleep_hours  numeric(3,1),
  resting_hr   int,
  energy       int check (energy between 1 and 5),
  note         text,
  unique (user_id, logged_on)
);
create index body_log_user_logged_idx on public.body_log (user_id, logged_on);

create table public.water_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  logged_on  date not null,
  amount_ml  int not null,
  logged_at  timestamptz not null default now()
);
create index water_log_user_logged_idx on public.water_log (user_id, logged_on);

alter table public.body_profile enable row level security;
alter table public.body_log     enable row level security;
alter table public.water_log    enable row level security;

create policy "own body_profile" on public.body_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own body_log" on public.body_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own water_log" on public.water_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Phase 8: daily calorie total, logged the same way as water_log — a
-- single running number per day, no meal names, no per-food macros, no
-- food database. Still the most sensitive table in the app: same
-- own-rows-only RLS as everything else in this feature, no friends-select
-- policy.

create table public.calorie_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  logged_on    date not null,
  amount_kcal  int not null,
  logged_at    timestamptz not null default now()
);
create index calorie_log_user_logged_idx on public.calorie_log (user_id, logged_on);

alter table public.calorie_log enable row level security;
create policy "own calorie_log" on public.calorie_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
