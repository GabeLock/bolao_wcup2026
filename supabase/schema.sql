create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.safe_profile_username(base_username text, user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_base text;
  candidate text;
  suffix text;
begin
  clean_base := trim(coalesce(base_username, ''));
  clean_base := regexp_replace(clean_base, '\s+', '_', 'g');
  clean_base := regexp_replace(clean_base, '[^A-Za-z0-9_.-]', '', 'g');

  if char_length(clean_base) < 3 then
    clean_base := 'palpiteiro';
  end if;

  clean_base := left(clean_base, 31);
  candidate := clean_base;

  if exists (select 1 from public.profiles where username = candidate and id <> user_id) then
    suffix := '_' || left(replace(user_id::text, '-', ''), 8);
    candidate := left(clean_base, 40 - char_length(suffix)) || suffix;
  end if;

  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
begin
  desired_username := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1),
    'palpiteiro'
  );

  if lower(coalesce(new.email, '')) = 'admin@bolao.local' then
    desired_username := 'admin';
  end if;

  insert into public.profiles (id, username, is_admin, created_at)
  values (
    new.id,
    public.safe_profile_username(desired_username, new.id),
    lower(coalesce(new.email, '')) = 'admin@bolao.local',
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

with missing_users as (
  select
    users.id,
    coalesce(users.created_at, now()) as created_at,
    public.safe_profile_username(
      coalesce(users.raw_user_meta_data ->> 'username', split_part(users.email, '@', 1), 'palpiteiro'),
      users.id
    ) as base_username
  from auth.users
  where not exists (
    select 1 from public.profiles
    where profiles.id = users.id
  )
),
deduped_users as (
  select
    id,
    created_at,
    base_username,
    row_number() over (partition by base_username order by created_at, id) as username_rank
  from missing_users
)
insert into public.profiles (id, username, is_admin, created_at)
select
  id,
  case
    when username_rank = 1 then base_username
    else left(base_username, 31) || '_' || left(replace(id::text, '-', ''), 8)
  end,
  false,
  created_at
from deduped_users
on conflict (id) do nothing;

update public.profiles
set is_admin = true
where id in (
  select id from auth.users
  where lower(coalesce(email, '')) = 'admin@bolao.local'
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
using (
  public.is_admin()
  and exists (
    select 1 from public.matches
    where matches.id = results.match_id
      and matches.kickoff_utc + interval '3 hours' <= now()
  )
)
with check (
  public.is_admin()
  and exists (
    select 1 from public.matches
    where matches.id = results.match_id
      and matches.kickoff_utc + interval '3 hours' <= now()
  )
);

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

create or replace function public.upsert_prediction(
  p_match_id text,
  p_home_goals integer,
  p_away_goals integer
)
returns public.predictions
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_prediction public.predictions;
begin
  if auth.uid() is null then
    raise exception 'Usuario precisa estar autenticado para salvar palpites.';
  end if;

  if p_home_goals < 0 or p_home_goals > 30 or p_away_goals < 0 or p_away_goals > 30 then
    raise exception 'Placar invalido.';
  end if;

  if not exists (
    select 1
    from public.matches
    where matches.id = p_match_id
      and matches.kickoff_utc > now()
  ) then
    raise exception 'JOGOS INICIADOS NAO PERMITEM PREENCHIMENTO.';
  end if;

  insert into public.predictions (
    user_id,
    match_id,
    home_goals,
    away_goals,
    submitted_at
  )
  values (
    auth.uid(),
    p_match_id,
    p_home_goals,
    p_away_goals,
    now()
  )
  on conflict (user_id, match_id) do update
  set
    home_goals = excluded.home_goals,
    away_goals = excluded.away_goals,
    submitted_at = excluded.submitted_at
  returning * into saved_prediction;

  return saved_prediction;
end;
$$;

create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
  username text,
  points integer,
  exacts integer,
  outcomes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id as user_id,
    pr.username as username,
    coalesce(sum(public.prediction_points(p.home_goals, p.away_goals, r.home_goals, r.away_goals)), 0)::integer as points,
    coalesce(sum(case when p.home_goals = r.home_goals and p.away_goals = r.away_goals then 1 else 0 end), 0)::integer as exacts,
    coalesce(sum(case when sign(p.home_goals - p.away_goals) = sign(r.home_goals - r.away_goals) then 1 else 0 end), 0)::integer as outcomes
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  left join public.matches m on m.id = p.match_id
  left join public.results r
    on r.match_id = p.match_id
    and m.kickoff_utc + interval '3 hours' <= now()
  group by pr.id, pr.username
  order by points desc, exacts desc, outcomes desc, username asc;
$$;

grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.safe_profile_username(text, uuid) to authenticated;
grant execute on function public.upsert_prediction(text, integer, integer) to authenticated;
