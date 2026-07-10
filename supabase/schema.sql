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
-- user, which cascades to profiles, routines, sessions, settings, and
-- friendships (every one of those tables references auth.users or profiles
-- with "on delete cascade"), plus Supabase's own internal auth tables
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
