-- Reparo completo para salvar palpites no Supabase.
-- Rode este arquivo uma vez no SQL Editor quando aparecer erro de RLS em public.predictions.

alter table public.predictions enable row level security;

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
    select 1
    from public.matches
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
    select 1
    from public.matches
    where matches.id = match_id
      and matches.kickoff_utc > now()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = match_id
      and matches.kickoff_utc > now()
  )
);

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

select
  proname as funcao,
  proargnames as argumentos
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname = 'upsert_prediction';

select
  policyname as politica,
  cmd as comando
from pg_policies
where schemaname = 'public'
  and tablename = 'predictions'
order by policyname;

select
  count(*) as jogos_abertos_para_palpite
from public.matches
where kickoff_utc > now();
