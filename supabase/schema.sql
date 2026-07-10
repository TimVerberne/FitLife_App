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
