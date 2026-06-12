-- Placar oficial conferido e sincronizacao de resultados.
-- Rode no SQL Editor para atualizar o placar do jogo 1 e liberar pontuacao no ranking.

create or replace function public.sync_official_seed_results()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  synced_count integer;
begin
  with official_results(match_id, home_goals, away_goals, official_at) as (
    values
      ('match-001'::text, 2, 0, '2026-06-11T22:00:00Z'::timestamptz)
  ),
  upserted as (
    insert into public.results (match_id, home_goals, away_goals, updated_at)
    select
      official_results.match_id,
      official_results.home_goals,
      official_results.away_goals,
      greatest(official_results.official_at, now())
    from official_results
    join public.matches on matches.id = official_results.match_id
    where matches.kickoff_utc + interval '3 hours' <= now()
    on conflict (match_id) do update
    set
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into synced_count from upserted;

  return synced_count;
end;
$$;

grant execute on function public.sync_official_seed_results() to authenticated;

select public.sync_official_seed_results() as synced_results;
select * from public.results where match_id = 'match-001';
select * from public.get_leaderboard();
