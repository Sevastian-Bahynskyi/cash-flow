-- Calls bank-sync 3 times a day (05:00, 11:00, 17:00 UTC). PSD2 allows ~4 unattended
-- fetches per account per day and BankMCP shares that budget.
-- Secrets live in Vault, never in this file. Create them once per project before relying on the job:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<anon key>', 'anon_key');                -- passes the gateway's verify_jwt
--   select vault.create_secret('<same as CRON_SECRET>', 'bank_sync_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'bank-sync';

select cron.schedule(
  'bank-sync',
  '0 5,11,17 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/bank-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bank_sync_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
