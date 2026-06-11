create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Run once, replacing values before execution:
-- select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
-- select vault.create_secret('SUA_CHAVE_ANON_PUBLICA', 'publishable_key');

select cron.unschedule('sync-worldcup-fixtures-and-results')
where exists (
  select 1 from cron.job
  where jobname = 'sync-worldcup-fixtures-and-results'
);

select cron.schedule(
  'sync-worldcup-fixtures-and-results',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-fixtures',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
