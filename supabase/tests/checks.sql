-- Bank-sync safety checks. Runs in one transaction and rolls back: leaves no data behind.
-- Prints one line per check: "PASS <name>" or "FAIL <name> <detail>". Run via supabase/tests/run.sh.
\set QUIET on
\pset tuples_only on
begin;

create temp table results (name text, ok boolean, detail text);
grant all on results to public;

-- ===== seed (as postgres) ================================================================
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  cat uuid;
  ca uuid; cb uuid; aa uuid; ab uuid; ta uuid; tb uuid; ma uuid; mb uuid; pa uuid;
begin
  insert into auth.users (id, aud, role, email, is_sso_user, is_anonymous)
  values (a, 'authenticated', 'authenticated', 'test-a@example.invalid', false, false),
         (b, 'authenticated', 'authenticated', 'test-b@example.invalid', false, false);
  select id into cat from public.categories where is_system order by name limit 1;

  insert into public.bank_connections (user_id, session_id, aspsp_name, aspsp_country, valid_until, status)
  values (a, 'sess-a', 'Fakebank', 'DK', now() + interval '90 days', 'active') returning id into ca;
  insert into public.bank_connections (user_id, session_id, aspsp_name, aspsp_country, valid_until, status)
  values (b, 'sess-b', 'Fakebank', 'DK', now() + interval '90 days', 'active') returning id into cb;
  insert into public.bank_accounts (user_id, connection_id, uid, identification_hash, name, currency, cash_account_type, role)
  values (a, ca, 'uid-a', 'hash-a', 'A main', 'DKK', 'CACC', 'personal') returning id into aa;
  insert into public.bank_accounts (user_id, connection_id, uid, identification_hash, name, currency, cash_account_type, role)
  values (b, cb, 'uid-b', 'hash-b', 'B main', 'DKK', 'CACC', 'personal') returning id into ab;
  insert into public.bank_transactions (user_id, account_id, ext_id, status, booking_date, amount_minor, currency, raw)
  values (a, aa, 'ext-a', 'BOOK', '2026-11-02', -1000, 'DKK', '{}'::jsonb) returning id into ta;
  insert into public.bank_transactions (user_id, account_id, ext_id, status, booking_date, amount_minor, currency, raw)
  values (b, ab, 'ext-b', 'BOOK', '2026-11-02', -2000, 'DKK', '{}'::jsonb) returning id into tb;
  insert into public.sync_runs (user_id, trigger, ok) values (a, 'cron', true), (b, 'user', true);

  insert into public.transactions (user_id, kind, amount_minor, occurred_on, name, category_id,
    currency_code, original_amount_minor, converted_amount_minor, fx_rate, bank_transaction_id, source)
  values (a, 'expense', 1000, '2026-11-02', 'Test A', cat, 'DKK', 1000, 1000, 1, ta, 'bank') returning id into ma;
  insert into public.transactions (user_id, kind, amount_minor, occurred_on, name, category_id,
    currency_code, original_amount_minor, converted_amount_minor, fx_rate)
  values (b, 'expense', 2000, '2026-11-02', 'Test B', cat, 'DKK', 2000, 2000, 1) returning id into mb;
  insert into public.transactions (user_id, kind, amount_minor, occurred_on, name, category_id,
    currency_code, original_amount_minor, converted_amount_minor, fx_rate)
  values (a, 'income', 500, '2026-11-03', 'Payback A', cat, 'DKK', 500, 500, 1) returning id into pa;
  insert into public.transaction_splits (user_id, transaction_id, category_id, amount_minor) values (a, ma, cat, 300);
  insert into public.paybacks (user_id, payment_transaction_id, expense_transaction_id, amount_minor) values (a, pa, ma, 500);
  insert into results values ('seed', true, null);
exception when others then
  insert into results values ('seed', false, sqlerrm);
end $$;

-- ===== schema shape (as postgres) ========================================================
insert into results
select 'rls enabled on ' || t, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false), null
from unnest(array['bank_connections','bank_accounts','bank_transactions','sync_runs','transaction_splits','paybacks']) t;

-- no client write policies on ledger tables
insert into results
select 'no client write policy on ' || t,
  not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.cmd <> 'SELECT'),
  (select string_agg(policyname || ':' || cmd, ',') from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.cmd <> 'SELECT')
from unnest(array['bank_connections','bank_accounts','bank_transactions','sync_runs']) t;

-- cascade closure from bank tables never reaches money tables
with recursive reach(rel) as (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('bank_connections','bank_accounts','bank_transactions','sync_runs')
  union
  select k.conrelid from pg_constraint k join reach r on k.confrelid = r.rel
  where k.contype = 'f' and k.confdeltype = 'c'
)
insert into results
select 'no cascade path bank_* -> ' || t,
  not exists (select 1 from reach where rel = to_regclass('public.' || t)), null
from unnest(array['transactions','budgets','budget_change_events','transaction_splits','paybacks','savings_accounts','transfer_people','categories']) t;

insert into results
select 'transactions.bank_transaction_id on delete set null',
  exists (select 1 from pg_constraint k join pg_attribute at on at.attrelid = k.conrelid and at.attnum = any(k.conkey)
          where k.conrelid = 'public.transactions'::regclass and k.contype = 'f' and at.attname = 'bank_transaction_id' and k.confdeltype = 'n'), null;
insert into results
select 'transactions.bank_transaction_id unique',
  exists (select 1 from pg_index i join pg_attribute at on at.attrelid = i.indrelid and at.attnum = i.indkey[0]
          where i.indrelid = 'public.transactions'::regclass and i.indisunique and i.indnatts = 1 and at.attname = 'bank_transaction_id'), null;
insert into results
select 'savings_accounts.bank_account_id on delete set null',
  exists (select 1 from pg_constraint k join pg_attribute at on at.attrelid = k.conrelid and at.attnum = any(k.conkey)
          where k.conrelid = 'public.savings_accounts'::regclass and k.contype = 'f' and at.attname = 'bank_account_id' and k.confdeltype = 'n'), null;
insert into results
select 'bank_transactions unique(account_id, ext_id)',
  exists (select 1 from pg_constraint where conrelid = 'public.bank_transactions'::regclass and contype = 'u'
          and (select array_agg(attname::text order by attname) from pg_attribute where attrelid = conrelid and attnum = any(conkey)) = array['account_id','ext_id'])
  or exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'bank_transactions' and indexdef ilike '%unique%(account_id, ext_id)%'), null;
insert into results
select 'bank_accounts unique(user_id, identification_hash)',
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'bank_accounts' and indexdef ilike '%unique%(user_id, identification_hash)%'), null;
insert into results
select 'personal_effect_minor untouched',
  (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute at on at.attrelid = d.adrelid and at.attnum = d.adnum
   where d.adrelid = 'public.transactions'::regclass and at.attname = 'personal_effect_minor')
  ilike '%is_shared_topup%gf%', null;

-- ===== budget_effect_minor per movement ==================================================
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  cat uuid;
  m text; k text; st text; got bigint; want bigint;
begin
  select id into cat from public.categories where is_system order by name limit 1;
  for m, k, st, want in
    select * from (values
      ('spend','expense','booked',-1000::bigint), ('income','income','booked',1000), ('moved','expense','booked',0),
      ('moved','income','booked',0), ('topup','expense','booked',0), ('topup','income','booked',0), ('ignore','expense','booked',0),
      ('person','expense','booked',-1000), ('spend','expense','void',0), ('spend','expense','pending',-1000),
      -- an incoming refund or person payback must not count as spending
      ('refund','income','booked',1000), ('person','income','booked',1000)
    ) v(m, k, st, want)
  loop
    begin
      insert into public.transactions (user_id, kind, amount_minor, occurred_on, name, category_id,
        currency_code, original_amount_minor, converted_amount_minor, fx_rate, movement, status)
      values (a, k::transaction_kind, 1000, '2026-11-04', 'effect ' || m, cat, 'DKK', 1000, 1000, 1, m, st)
      returning budget_effect_minor into got;
      insert into results values ('budget_effect ' || m || '/' || k || '/' || st || ' = ' || want, got = want, 'got ' || got);
    exception when others then
      insert into results values ('budget_effect ' || m || '/' || k || '/' || st, false, sqlerrm);
    end;
  end loop;
end $$;

-- mirrored joint top-up must fit the existing transactions constraints
do $$
declare a uuid := '00000000-0000-4000-8000-00000000000a'; cat uuid;
begin
  select id into cat from public.categories where is_system order by name limit 1;
  insert into public.transactions (user_id, kind, amount_minor, occurred_on, name, category_id, currency_code,
    original_amount_minor, converted_amount_minor, fx_rate, movement, is_shared_topup, shared_participant, shared, source)
  values (a, 'expense', 1000, '2026-11-05', 'topup shape', cat, 'DKK', 1000, 1000, 1, 'topup', true, 'me', false, 'bank');
  insert into results values ('topup row (expense, shared=false) insertable', true, null);
exception when others then
  insert into results values ('topup row (expense, shared=false) insertable', false, sqlerrm);
end $$;

-- ===== RLS: user B against user A =========================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

insert into results
select 'B cannot read A ' || t,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where user_id = %L', t, '00000000-0000-4000-8000-00000000000a'), false, true, '')))[1]::text = '0', null
from unnest(array['bank_connections','bank_accounts','bank_transactions','sync_runs','transaction_splits','paybacks','transactions']) t;

do $$
declare n int; t text;
begin
  foreach t in array array['bank_connections','bank_accounts','bank_transactions','sync_runs','transaction_splits','paybacks'] loop
    begin
      execute format('update public.%I set user_id = user_id where user_id = %L', t, '00000000-0000-4000-8000-00000000000a');
      get diagnostics n = row_count;
      insert into results values ('B cannot update A ' || t, n = 0, n || ' rows');
    exception when insufficient_privilege then
      insert into results values ('B cannot update A ' || t, true, null);
    end;
  end loop;
end $$;

-- B attaches a split / payback to A's transaction (FK alone does not check ownership)
do $$
declare cat uuid; ma uuid;
begin
  select id into cat from public.categories where is_system order by name limit 1;
  ma := (select id from public.transactions where name = 'Test A' limit 1); -- invisible to B: null
  if ma is null then
    reset role;
    select id into ma from public.transactions where name = 'Test A';
    set local role authenticated;
  end if;
  begin
    insert into public.transaction_splits (user_id, transaction_id, category_id, amount_minor)
    values ('00000000-0000-4000-8000-00000000000b', ma, cat, 1);
    insert into results values ('B cannot attach split to A transaction', false, 'insert accepted');
  exception when others then
    insert into results values ('B cannot attach split to A transaction', true, sqlerrm);
  end;
  begin
    insert into public.paybacks (user_id, payment_transaction_id, expense_transaction_id, amount_minor)
    values ('00000000-0000-4000-8000-00000000000b', ma, ma, 1);
    insert into results values ('B cannot attach payback to A transaction', false, 'insert accepted');
  exception when others then
    insert into results values ('B cannot attach payback to A transaction', true, sqlerrm);
  end;
end $$;

-- ===== RLS: owner A on own ledger rows ===================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

insert into results
select 'A reads own ' || t,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::int >= 1, null
from unnest(array['bank_connections','bank_accounts','bank_transactions','sync_runs','transaction_splits','paybacks']) t;

do $$
declare n int;
begin
  begin
    insert into public.bank_transactions (user_id, account_id, ext_id, status, booking_date, amount_minor, currency, raw)
    select user_id, account_id, 'client-forged', 'BOOK', booking_date, 1, 'DKK', '{}'::jsonb from public.bank_transactions limit 1;
    insert into results values ('A cannot insert bank_transactions', false, 'insert accepted');
  exception when others then
    insert into results values ('A cannot insert bank_transactions', true, null);
  end;
  begin
    insert into public.sync_runs (user_id, trigger, ok) values ('00000000-0000-4000-8000-00000000000a', 'user', true);
    insert into results values ('A cannot insert sync_runs', false, 'insert accepted');
  exception when others then
    insert into results values ('A cannot insert sync_runs', true, null);
  end;
  begin
    update public.bank_transactions set amount_minor = 1;
    get diagnostics n = row_count;
    insert into results values ('A cannot update own bank_transactions', n = 0, n || ' rows');
  exception when others then
    insert into results values ('A cannot update own bank_transactions', true, null);
  end;
  begin
    update public.bank_accounts set role = 'joint';
    get diagnostics n = row_count;
    insert into results values ('A cannot update own bank_accounts', n = 0, n || ' rows');
  exception when others then
    insert into results values ('A cannot update own bank_accounts', true, null);
  end;
  begin
    delete from public.bank_transactions;
    get diagnostics n = row_count;
    insert into results values ('A cannot delete own bank_transactions', n = 0, n || ' rows');
  exception when others then
    insert into results values ('A cannot delete own bank_transactions', true, null);
  end;
  begin
    update public.transactions set name = name || ' (renamed)' where name = 'Test A';
    get diagnostics n = row_count;
    insert into results values ('A can still relabel own transaction', n = 1, n || ' rows');
  exception when others then
    insert into results values ('A can still relabel own transaction', false, sqlerrm);
  end;
end $$;

-- ===== anon reads nothing ================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare t text; n int;
begin
  foreach t in array array['bank_connections','bank_accounts','bank_transactions','sync_runs','transaction_splits','paybacks','transactions'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      insert into results values ('anon reads nothing from ' || t, n = 0, n || ' rows');
    exception when insufficient_privilege then
      insert into results values ('anon reads nothing from ' || t, true, null);
    end;
  end loop;
end $$;
reset role;

-- ===== cron ==============================================================================
do $$
declare s text; c text; hours int;
begin
  if to_regclass('cron.job') is null then
    insert into results values ('cron: pg_cron installed', false, 'cron.job missing');
    return;
  end if;
  execute $q$select schedule, command from cron.job where command ilike '%bank-sync%' limit 1$q$ into s, c;
  if s is null then
    insert into results values ('cron: bank-sync job exists', false, null);
    return;
  end if;
  hours := array_length(string_to_array(split_part(s, ' ', 2), ','), 1);
  insert into results values ('cron: <= 3 runs/day', split_part(s, ' ', 1) ~ '^\d+$' and split_part(s, ' ', 2) ~ '^[\d,]+$' and hours <= 3, s);
  insert into results values ('cron: secret read from vault', c ilike '%vault.decrypted_secrets%' and c ilike '%bank_sync_cron_secret%', null);
  insert into results values ('cron: url read from vault', c ilike '%project_url%', null);
end $$;

select case when ok then 'PASS ' || name else 'FAIL ' || name || coalesce(' :: ' || detail, '') end from results order by ok, name;
rollback;
