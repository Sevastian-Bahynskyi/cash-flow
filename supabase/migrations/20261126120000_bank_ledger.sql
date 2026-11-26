-- Bank ledger: Enable Banking connections, accounts and raw transactions.
-- Written only by edge functions (service role); owners can read their own rows.
-- Additive only. Nothing here cascades into public.transactions.

create table if not exists public.bank_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    text not null unique,
  aspsp_name    text not null,
  aspsp_country text not null,
  valid_until   timestamptz,
  status        text not null default 'AUTHORIZED',
  created_at    timestamptz not null default now()
);

create index if not exists bank_connections_user_idx on public.bank_connections (user_id);

create table if not exists public.bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  connection_id       uuid not null references public.bank_connections(id),
  uid                 text not null,
  identification_hash text not null,
  name                text,
  currency            char(3) not null,
  cash_account_type   text,
  role                text not null check (role in ('personal', 'joint', 'savings')),
  balance_minor       bigint,
  balance_at          timestamptz,
  last_synced_at      timestamptz,
  last_booked_on      date,
  last_error          text,
  created_at          timestamptz not null default now(),
  unique (user_id, identification_hash)
);

create index if not exists bank_accounts_connection_idx on public.bank_accounts (connection_id);

create table if not exists public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  account_id       uuid not null references public.bank_accounts(id),
  ext_id           text not null,
  status           text not null check (status in ('BOOK', 'PDNG', 'EXPIRED', 'REPLACED')),
  booking_date     date,
  value_date       date,
  transaction_date date,
  amount_minor     bigint not null,
  currency         char(3) not null,
  creditor_name    text,
  debtor_name      text,
  remittance       text,
  mcc              text,
  bank_code        text,
  raw              jsonb not null,
  replaced_by      uuid references public.bank_transactions(id) on delete set null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (account_id, ext_id)
);

create index if not exists bank_transactions_user_booking_idx
  on public.bank_transactions (user_id, booking_date desc);
create index if not exists bank_transactions_pending_idx
  on public.bank_transactions (account_id)
  where status = 'PDNG';

create table if not exists public.sync_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trigger     text not null check (trigger in ('cron', 'user')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  error       text,
  accounts    int not null default 0,
  fetched     int not null default 0,
  inserted    int not null default 0
);

create index if not exists sync_runs_user_started_idx on public.sync_runs (user_id, started_at desc);
-- One unfinished run per user: parallel sync calls claim the slot atomically.
create unique index if not exists sync_runs_one_running_idx on public.sync_runs (user_id) where finished_at is null;

-- Consent renewal: one-time state tokens for the Enable Banking redirect. No client access.
create table if not exists public.bank_consent_states (
  state         text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id),
  created_at    timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.sync_runs enable row level security;
alter table public.bank_consent_states enable row level security;

drop policy if exists bank_connections_select_own on public.bank_connections;
create policy bank_connections_select_own on public.bank_connections
  for select using (user_id = (select auth.uid()));

drop policy if exists bank_accounts_select_own on public.bank_accounts;
create policy bank_accounts_select_own on public.bank_accounts
  for select using (user_id = (select auth.uid()));

drop policy if exists bank_transactions_select_own on public.bank_transactions;
create policy bank_transactions_select_own on public.bank_transactions
  for select using (user_id = (select auth.uid()));

drop policy if exists sync_runs_select_own on public.sync_runs;
create policy sync_runs_select_own on public.sync_runs
  for select using (user_id = (select auth.uid()));

-- Explicit grants: clients read through RLS, only the service role writes.
grant select on public.bank_connections, public.bank_accounts, public.bank_transactions, public.sync_runs
  to authenticated;
grant select, insert, update, delete
  on public.bank_connections, public.bank_accounts, public.bank_transactions, public.sync_runs, public.bank_consent_states
  to service_role;

-- transactions: link to the bank row, where the row came from, and its booking state.
alter table public.transactions
  add column if not exists bank_transaction_id uuid unique
    references public.bank_transactions(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists status text not null default 'booked';

alter table public.transactions
  drop constraint if exists transactions_source_chk;
alter table public.transactions
  add constraint transactions_source_chk check (source in ('manual', 'bank'));

alter table public.transactions
  drop constraint if exists transactions_status_chk;
alter table public.transactions
  add constraint transactions_status_chk check (status in ('booked', 'pending', 'void'));
