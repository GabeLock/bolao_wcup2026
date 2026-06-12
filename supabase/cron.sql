create extension if not exists pg_cron;
create extension if not exists pg_net;

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
    url := 'https://ozkhtxckgtftjawjxahd.supabase.co/functions/v1/sync-fixtures',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
