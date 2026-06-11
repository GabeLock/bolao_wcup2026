create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  match_number integer,
  stage text not null,
  group_name text,
  home_team text not null,
  away_team text not null,
  kickoff_utc timestamptz not null,
  venue text,
  city text,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  home_goals integer not null check (home_goals between 0 and 30),
  away_goals integer not null check (away_goals between 0 and 30),
  submitted_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create table if not exists public.results (
  match_id text primary key references public.matches(id) on delete cascade,
  home_goals integer not null check (home_goals between 0 and 30),
  away_goals integer not null check (away_goals between 0 and 30),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.results enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "matches are readable" on public.matches;
create policy "matches are readable"
on public.matches for select
to anon, authenticated
using (true);

drop policy if exists "admins write matches" on public.matches;
create policy "admins write matches"
on public.matches for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own predictions" on public.predictions;
create policy "users read own predictions"
on public.predictions for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users insert own predictions before kickoff" on public.predictions;
create policy "users insert own predictions before kickoff"
on public.predictions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches
    where matches.id = match_id
      and matches.kickoff_utc > now()
  )
);

drop policy if exists "users update own predictions before kickoff" on public.predictions;
create policy "users update own predictions before kickoff"
on public.predictions for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches
    where matches.id = match_id
      and matches.kickoff_utc > now()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches
    where matches.id = match_id
      and matches.kickoff_utc > now()
  )
);

drop policy if exists "results are readable" on public.results;
create policy "results are readable"
on public.results for select
to anon, authenticated
using (true);

drop policy if exists "admins write results" on public.results;
create policy "admins write results"
on public.results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.prediction_points(
  pred_home integer,
  pred_away integer,
  real_home integer,
  real_away integer
)
returns integer
language sql
immutable
as $$
  select case
    when pred_home = real_home and pred_away = real_away then 5
    else
      (case when sign(pred_home - pred_away) = sign(real_home - real_away) then 3 else 0 end) +
      (case when pred_home = real_home then 1 else 0 end) +
      (case when pred_away = real_away then 1 else 0 end)
  end;
$$;

create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
  username text,
  points integer,
  exacts integer,
  outcomes integer,
  knockout_points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    coalesce(pr.username, 'Participante') as username,
    sum(public.prediction_points(p.home_goals, p.away_goals, r.home_goals, r.away_goals))::integer as points,
    sum(case when p.home_goals = r.home_goals and p.away_goals = r.away_goals then 1 else 0 end)::integer as exacts,
    sum(case when sign(p.home_goals - p.away_goals) = sign(r.home_goals - r.away_goals) then 1 else 0 end)::integer as outcomes,
    sum(case
      when lower(coalesce(m.stage, '')) like '%final%'
        or lower(coalesce(m.stage, '')) like '%mata%'
        or lower(coalesce(m.stage, '')) like '%round%'
        or lower(coalesce(m.stage, '')) like '%quarter%'
        or lower(coalesce(m.stage, '')) like '%semi%'
      then public.prediction_points(p.home_goals, p.away_goals, r.home_goals, r.away_goals)
      else 0
    end)::integer as knockout_points
  from public.predictions p
  join public.results r on r.match_id = p.match_id
  join public.matches m on m.id = p.match_id
  left join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.username
  order by points desc, exacts desc, outcomes desc, knockout_points desc, username asc;
$$;

grant execute on function public.get_leaderboard() to authenticated;
