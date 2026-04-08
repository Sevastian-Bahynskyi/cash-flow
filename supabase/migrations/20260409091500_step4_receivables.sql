-- Step 4: receivables for money owed back to the user.

-- ============================================================
-- receivables
-- ============================================================
do $$ begin
  create type public.receivable_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.receivables (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  principal_minor bigint not null check (principal_minor > 0),
  remaining_minor bigint not null check (remaining_minor >= 0),
  status          public.receivable_status not null default 'open',
  created_at      timestamptz not null default now(),
  constraint receivables_remaining_le_principal check (remaining_minor <= principal_minor),
  constraint receivables_status_matches_remaining check (
    (status = 'closed' and remaining_minor = 0) or
    (status = 'open' and remaining_minor >= 0)
  )
);

create index if not exists receivables_user_status_idx
  on public.receivables (user_id, status);

alter table public.receivables enable row level security;

drop policy if exists receivables_select_own on public.receivables;
create policy receivables_select_own on public.receivables
  for select using (user_id = auth.uid());

drop policy if exists receivables_insert_own on public.receivables;
create policy receivables_insert_own on public.receivables
  for insert with check (user_id = auth.uid());

drop policy if exists receivables_update_own on public.receivables;
create policy receivables_update_own on public.receivables
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists receivables_delete_own on public.receivables;
create policy receivables_delete_own on public.receivables
  for delete using (user_id = auth.uid());

-- ============================================================
-- receivable_events
-- ============================================================
do $$ begin
  create type public.receivable_event_kind as enum ('lent', 'repaid');
exception when duplicate_object then null; end $$;

create table if not exists public.receivable_events (
  id             uuid primary key default gen_random_uuid(),
  receivable_id  uuid not null references public.receivables(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           public.receivable_event_kind not null,
  amount_minor   bigint not null check (amount_minor > 0),
  occurred_on    date not null,
  created_at     timestamptz not null default now()
);

create index if not exists receivable_events_receivable_idx
  on public.receivable_events (receivable_id, occurred_on, created_at);

alter table public.receivable_events enable row level security;

drop policy if exists receivable_events_select_own on public.receivable_events;
create policy receivable_events_select_own on public.receivable_events
  for select using (user_id = auth.uid());

drop policy if exists receivable_events_insert_own on public.receivable_events;
create policy receivable_events_insert_own on public.receivable_events
  for insert with check (user_id = auth.uid());

drop policy if exists receivable_events_update_own on public.receivable_events;
create policy receivable_events_update_own on public.receivable_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists receivable_events_delete_own on public.receivable_events;
create policy receivable_events_delete_own on public.receivable_events
  for delete using (user_id = auth.uid());
