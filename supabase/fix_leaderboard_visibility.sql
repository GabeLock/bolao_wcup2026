-- Reparo do ranking compartilhado.
-- Rode no SQL Editor do Supabase para todos os usuarios cadastrados aparecerem no ranking.

insert into public.profiles (id, username, is_admin, created_at)
select
  users.id,
  public.safe_profile_username(
    coalesce(users.raw_user_meta_data ->> 'username', split_part(users.email, '@', 1), 'palpiteiro'),
    users.id
  ),
  lower(coalesce(users.email, '')) = 'admin@bolao.local',
  coalesce(users.created_at, now())
from auth.users users
on conflict (id) do update set
  username = coalesce(nullif(public.profiles.username, ''), excluded.username),
  is_admin = public.profiles.is_admin or excluded.is_admin;

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
  with participants as (
    select
      users.id,
      coalesce(
        nullif(trim(pr.username), ''),
        nullif(trim(users.raw_user_meta_data ->> 'username'), ''),
        nullif(trim(split_part(users.email, '@', 1)), ''),
        'Participante'
      ) as username
    from auth.users users
    left join public.profiles pr on pr.id = users.id
  )
  select
    participants.id as user_id,
    participants.username as username,
    coalesce(sum(public.prediction_points(p.home_goals, p.away_goals, r.home_goals, r.away_goals)), 0)::integer as points,
    coalesce(sum(case when p.home_goals = r.home_goals and p.away_goals = r.away_goals then 1 else 0 end), 0)::integer as exacts,
    coalesce(sum(case when sign(p.home_goals - p.away_goals) = sign(r.home_goals - r.away_goals) then 1 else 0 end), 0)::integer as outcomes
  from participants
  left join public.predictions p on p.user_id = participants.id
  left join public.matches m on m.id = p.match_id
  left join public.results r
    on r.match_id = p.match_id
    and m.kickoff_utc + interval '3 hours' <= now()
  group by participants.id, participants.username
  order by points desc, exacts desc, outcomes desc, username asc;
$$;

grant execute on function public.get_leaderboard() to authenticated;

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.get_leaderboard()) as ranking_rows;
