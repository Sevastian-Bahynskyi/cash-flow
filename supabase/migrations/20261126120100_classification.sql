-- Classification: why each transaction is what it is, people kinds, splits and paybacks.
-- Additive only. Depends on 20261126120000_bank_ledger.sql (transactions.status, bank_accounts).

-- transactions: the classifier's verdict and the new budget effect.
alter table public.transactions
  add column if not exists merchant_key text,
  add column if not exists movement text,
  add column if not exists paid_by text,
  add column if not exists reason text,
  add column if not exists reason_source text,
  add column if not exists confidence numeric,
  add column if not exists needs_review boolean not null default false,
  add column if not exists counterparty_person_id uuid
    references public.transfer_people(id) on delete set null;

alter table public.transactions drop constraint if exists transactions_movement_chk;
alter table public.transactions
  add constraint transactions_movement_chk
  check (movement is null or movement in ('spend', 'income', 'moved', 'topup', 'person', 'refund', 'ignore'));

alter table public.transactions drop constraint if exists transactions_paid_by_chk;
alter table public.transactions
  add constraint transactions_paid_by_chk check (paid_by is null or paid_by in ('me', 'partner'));

alter table public.transactions drop constraint if exists transactions_reason_source_chk;
alter table public.transactions
  add constraint transactions_reason_source_chk
  check (reason_source is null or reason_source in ('transfer', 'salary', 'person', 'rule', 'memory', 'mcc', 'ai', 'you', 'manual'));

-- Money that moves a budget: nothing for void rows, own moves, top-ups (old manual ones too, issue #7) and ignored rows.
-- personal_effect_minor stays as it is; screens switch to this column all at once.
alter table public.transactions
  add column if not exists budget_effect_minor bigint generated always as (
    case
      when status = 'void' or movement in ('moved', 'topup', 'ignore') or is_shared_topup then 0::bigint
      when kind = 'income' then amount_minor
      else -amount_minor
    end
  ) stored;

create index if not exists transactions_user_review_idx
  on public.transactions (user_id, occurred_on desc) where needs_review;
create index if not exists transactions_counterparty_idx
  on public.transactions (counterparty_person_id) where counterparty_person_id is not null;

-- People: what kind of person each is, set once; duplicates point at one canonical row.
alter table public.transfer_people
  add column if not exists kind text not null default 'settle_up',
  add column if not exists opening_balance_minor bigint not null default 0,
  add column if not exists alias_of uuid references public.transfer_people(id) on delete set null;

alter table public.transfer_people drop constraint if exists transfer_people_kind_chk;
alter table public.transfer_people
  add constraint transfer_people_kind_chk check (kind in ('self', 'partner', 'settle_up', 'family', 'ignore'));

comment on column public.transfer_people.opening_balance_minor is '+ they owe me, - I owe them';
comment on column public.transfer_people.alias_of is 'null = canonical person; else the canonical row this name variant belongs to';

-- Profile: the owner's own card suffixes (joint top-ups by these cards are his).
alter table public.profiles
  add column if not exists own_card_suffixes text[] not null default '{}';

-- Splits: part of one transaction counted in another category. The remainder stays on the transaction's category.
create table if not exists public.transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id    uuid not null references public.categories(id) on delete restrict,
  amount_minor   bigint not null check (amount_minor > 0),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists transaction_splits_transaction_idx on public.transaction_splits (transaction_id);
create index if not exists transaction_splits_user_idx on public.transaction_splits (user_id);

-- Paybacks: an incoming payment from a person matched to the expense(s) it pays back.
create table if not exists public.paybacks (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  payment_transaction_id uuid not null references public.transactions(id) on delete cascade,
  expense_transaction_id uuid not null references public.transactions(id) on delete cascade,
  amount_minor           bigint not null check (amount_minor > 0),
  created_at             timestamptz not null default now(),
  unique (payment_transaction_id, expense_transaction_id)
);

create index if not exists paybacks_user_idx on public.paybacks (user_id);
create index if not exists paybacks_expense_idx on public.paybacks (expense_transaction_id);

alter table public.transaction_splits enable row level security;
alter table public.paybacks enable row level security;

drop policy if exists transaction_splits_select_own on public.transaction_splits;
create policy transaction_splits_select_own on public.transaction_splits
  for select using (user_id = (select auth.uid()));
drop policy if exists transaction_splits_insert_own on public.transaction_splits;
create policy transaction_splits_insert_own on public.transaction_splits
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.categories c where c.id = category_id and (c.user_id is null or c.user_id = (select auth.uid())))
  );
drop policy if exists transaction_splits_update_own on public.transaction_splits;
create policy transaction_splits_update_own on public.transaction_splits
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.categories c where c.id = category_id and (c.user_id is null or c.user_id = (select auth.uid())))
  );
drop policy if exists transaction_splits_delete_own on public.transaction_splits;
create policy transaction_splits_delete_own on public.transaction_splits
  for delete using (user_id = (select auth.uid()));

drop policy if exists paybacks_select_own on public.paybacks;
create policy paybacks_select_own on public.paybacks
  for select using (user_id = (select auth.uid()));
drop policy if exists paybacks_insert_own on public.paybacks;
create policy paybacks_insert_own on public.paybacks
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = payment_transaction_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.transactions t where t.id = expense_transaction_id and t.user_id = (select auth.uid()))
  );
drop policy if exists paybacks_update_own on public.paybacks;
create policy paybacks_update_own on public.paybacks
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = payment_transaction_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.transactions t where t.id = expense_transaction_id and t.user_id = (select auth.uid()))
  );
drop policy if exists paybacks_delete_own on public.paybacks;
create policy paybacks_delete_own on public.paybacks
  for delete using (user_id = (select auth.uid()));

-- Savings goals read their balance from a synced savings account.
alter table public.savings_accounts
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null;

-- Bank link guard: a transaction may only point at its own user's bank row, and app users (anon/authenticated)
-- never set or change the bank link, source or status; only edge functions (service role) do.
create or replace function public.transactions_guard_bank_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bank_transaction_id is not null and not exists (
    select 1 from public.bank_transactions b where b.id = new.bank_transaction_id and b.user_id = new.user_id
  ) then
    raise exception 'bank_transaction_id must reference a bank row of the same user';
  end if;
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (new.source <> 'manual' or new.status <> 'booked' or new.bank_transaction_id is not null) then
      raise exception 'only the bank sync creates bank-linked transactions';
    end if;
    if tg_op = 'UPDATE' and (
      new.bank_transaction_id is distinct from old.bank_transaction_id
      or new.source is distinct from old.source
      or new.status is distinct from old.status
    ) then
      raise exception 'bank_transaction_id, source and status are set by the bank sync only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_guard_bank_columns_trg on public.transactions;
create trigger transactions_guard_bank_columns_trg
  before insert or update of bank_transaction_id, source, status, user_id on public.transactions
  for each row execute function public.transactions_guard_bank_columns();
