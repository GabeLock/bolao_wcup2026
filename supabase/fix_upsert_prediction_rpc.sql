-- Reparo da RPC de salvamento de palpites.
-- Rode no SQL Editor se aparecer erro de schema cache para public.upsert_prediction.

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

grant execute on function public.upsert_prediction(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
