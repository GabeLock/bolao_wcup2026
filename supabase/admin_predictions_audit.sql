-- Auditoria administrativa dos palpites.
-- Rode no SQL Editor do Supabase para liberar a consulta de todos os palpites ao admin.

create or replace function public.get_admin_predictions_audit()
returns table (
  user_id uuid,
  username text,
  match_id text,
  match_number integer,
  stage text,
  home_team text,
  away_team text,
  kickoff_utc timestamptz,
  predicted_home_goals integer,
  predicted_away_goals integer,
  submitted_at timestamptz,
  official_home_goals integer,
  official_away_goals integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    coalesce(
      nullif(trim(pr.username), ''),
      nullif(trim(users.raw_user_meta_data ->> 'username'), ''),
      nullif(trim(split_part(users.email, '@', 1)), ''),
      'Participante'
    ) as username,
    p.match_id,
    m.match_number,
    m.stage,
    m.home_team,
    m.away_team,
    m.kickoff_utc,
    p.home_goals as predicted_home_goals,
    p.away_goals as predicted_away_goals,
    p.submitted_at,
    r.home_goals as official_home_goals,
    r.away_goals as official_away_goals
  from public.predictions p
  join public.matches m on m.id = p.match_id
  join auth.users users on users.id = p.user_id
  left join public.profiles pr on pr.id = p.user_id
  left join public.results r
    on r.match_id = p.match_id
    and m.kickoff_utc + interval '3 hours' <= now()
  where public.is_admin()
  order by p.submitted_at desc, m.kickoff_utc asc, username asc;
$$;

grant execute on function public.get_admin_predictions_audit() to authenticated;

select count(*) as visible_predictions_for_current_admin
from public.get_admin_predictions_audit();
