# Atualizacao automatica de resultados

Este projeto nao deve depender de SQL manual para cada placar.

Fluxo automatico:

1. A Supabase Edge Function `sync-fixtures` consulta a API de resultados.
2. Ela cruza os jogos retornados pela API com os jogos oficiais do bolao pelo par de selecoes e horario aproximado.
3. Ela grava o placar em `public.results` usando o ID universal do bolao, como `match-001`.
4. O ranking usa `public.results` e recalcula os pontos automaticamente.
5. O cron chama a funcao a cada 30 minutos.
6. O site tambem tenta disparar a sincronizacao quando um usuario abre a aplicacao.

Configuracao unica no Supabase:

```bash
supabase functions deploy sync-fixtures --project-ref ozkhtxckgtftjawjxahd
supabase secrets set API_FOOTBALL_KEY=SUA_CHAVE_DA_API --project-ref ozkhtxckgtftjawjxahd
```

Depois rode uma unica vez no SQL Editor:

```sql
\i supabase/cron.sql
```

Se estiver colando pelo painel, cole o conteudo de `supabase/cron.sql` em uma New query.

Observacao: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao secrets padrao disponiveis em Edge Functions do Supabase. A chave `API_FOOTBALL_KEY` precisa ser configurada uma vez.
