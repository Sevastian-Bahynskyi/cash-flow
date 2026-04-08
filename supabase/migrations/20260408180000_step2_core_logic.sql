-- Step 2: salary flag, budgets, savings_events, loans, loan_events.

-- Salary flag on income transactions.
alter table public.transactions
  add column if not exists is_salary boolean not null default false;

alter table public.transactions
  drop constraint if exists transactions_salary_requires_income;
alter table public.transactions
  add constraint transactions_salary_requires_income
  check (is_salary = false or kind = 'income');

create index if not exists transactions_user_salary_idx
  on public.transactions (user_id, occurred_on desc)
  where is_salary = true;

-- ============================================================
-- budgets
-- ============================================================
create table if not exists public.budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  salary_cycle_id uuid not null references public.transactions(id) on delete cascade,
  amount_minor    bigint not null check (amount_minor > 0),
  created_at      timestamptz not null default now(),
  unique (user_id, category_id, salary_cycle_id)
);

create index if not exists budgets_user_cycle_idx
  on public.budgets (user_id, salary_cycle_id);

alter table public.budgets enable row level security;

drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
  for select using (user_id = auth.uid());

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
  for insert with check (user_id = auth.uid());

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
  for delete using (user_id = auth.uid());

-- ============================================================
-- savings_events
-- ============================================================
do $$ begin
  create type public.savings_action as enum ('add', 'remove', 'set');
exception when duplicate_object then null; end $$;

create table if not exists public.savings_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       public.savings_action not null,
  amount_minor bigint not null check (amount_minor >= 0),
  occurred_on  date not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists savings_events_user_date_idx
  on public.savings_events (user_id, occurred_on, created_at);

alter table public.savings_events enable row level security;

drop policy if exists savings_events_select_own on public.savings_events;
create policy savings_events_select_own on public.savings_events
  for select using (user_id = auth.uid());

drop policy if exists savings_events_insert_own on public.savings_events;
create policy savings_events_insert_own on public.savings_events
  for insert with check (user_id = auth.uid());

drop policy if exists savings_events_update_own on public.savings_events;
create policy savings_events_update_own on public.savings_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists savings_events_delete_own on public.savings_events;
create policy savings_events_delete_own on public.savings_events
  for delete using (user_id = auth.uid());

-- ============================================================
-- loans
-- ============================================================
do $$ begin
  create type public.loan_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.loans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  principal_minor bigint not null check (principal_minor > 0),
  remaining_minor bigint not null check (remaining_minor >= 0),
  status          public.loan_status not null default 'open',
  created_at      timestamptz not null default now(),
  constraint loans_remaining_le_principal check (remaining_minor <= principal_minor),
  constraint loans_status_matches_remaining check (
    (status = 'closed' and remaining_minor = 0) or
    (status = 'open' and remaining_minor >= 0)
  )
);

create index if not exists loans_user_status_idx on public.loans (user_id, status);

alter table public.loans enable row level security;

drop policy if exists loans_select_own on public.loans;
create policy loans_select_own on public.loans
  for select using (user_id = auth.uid());

drop policy if exists loans_insert_own on public.loans;
create policy loans_insert_own on public.loans
  for insert with check (user_id = auth.uid());

drop policy if exists loans_update_own on public.loans;
create policy loans_update_own on public.loans
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists loans_delete_own on public.loans;
create policy loans_delete_own on public.loans
  for delete using (user_id = auth.uid());

-- ============================================================
-- loan_events
-- ============================================================
do $$ begin
  create type public.loan_event_kind as enum ('borrowed', 'repaid');
exception when duplicate_object then null; end $$;

create table if not exists public.loan_events (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references public.loans(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         public.loan_event_kind not null,
  amount_minor bigint not null check (amount_minor > 0),
  occurred_on  date not null,
  created_at   timestamptz not null default now()
);

create index if not exists loan_events_loan_idx on public.loan_events (loan_id, occurred_on);

alter table public.loan_events enable row level security;

drop policy if exists loan_events_select_own on public.loan_events;
create policy loan_events_select_own on public.loan_events
  for select using (user_id = auth.uid());

drop policy if exists loan_events_insert_own on public.loan_events;
create policy loan_events_insert_own on public.loan_events
  for insert with check (user_id = auth.uid());

drop policy if exists loan_events_update_own on public.loan_events;
create policy loan_events_update_own on public.loan_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists loan_events_delete_own on public.loan_events;
create policy loan_events_delete_own on public.loan_events
  for delete using (user_id = auth.uid());
