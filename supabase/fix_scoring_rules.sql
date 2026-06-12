-- Reparo da regra de pontuacao do bolao.
-- Rode no SQL Editor para garantir que o ranking use a regra por prioridade:
-- 5 placar exato; 3 vencedor/empate; 1 algum gol correto; 0 sem acerto.

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
    -- Placar exato: 5 pontos, sem soma adicional.
    when pred_home = real_home and pred_away = real_away then 5
    -- Acertou vencedor ou empate com placar diferente: 3 pontos.
    when sign(pred_home - pred_away) = sign(real_home - real_away) then 3
    -- Sem acerto de vencedor/empate, mas acertou algum numero de gols: 1 ponto.
    when pred_home = real_home or pred_away = real_away then 1
    else 0
  end;
$$;

notify pgrst, 'reload schema';

select
  'Mexico 2 x 0 South Africa / palpite 2 x 0' as exemplo,
  public.prediction_points(2, 0, 2, 0) as pontos
union all
select
  'Mexico 2 x 0 South Africa / palpite 1 x 0',
  public.prediction_points(1, 0, 2, 0)
union all
select
  'Mexico 2 x 0 South Africa / palpite 2 x 1',
  public.prediction_points(2, 1, 2, 0)
union all
select
  'Mexico 2 x 0 South Africa / palpite 0 x 0',
  public.prediction_points(0, 0, 2, 0)
union all
select
  'Mexico 2 x 0 South Africa / palpite 2 x 3',
  public.prediction_points(2, 3, 2, 0);

select * from public.get_leaderboard();
