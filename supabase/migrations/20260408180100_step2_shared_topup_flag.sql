-- Shared top-ups must be distinguishable from shared expenses: top-ups move money
-- from personal balance into the shared pot, shared expenses are spends from the pot.
alter table public.transactions
  add column if not exists is_shared_topup boolean not null default false;

alter table public.transactions
  drop constraint if exists transactions_topup_shape;
alter table public.transactions
  add constraint transactions_topup_shape check (
    is_shared_topup = false or (kind = 'expense' and shared = false)
  );

create index if not exists transactions_user_topup_idx
  on public.transactions (user_id, occurred_on desc)
  where is_shared_topup = true;

create index if not exists transactions_user_shared_idx
  on public.transactions (user_id, occurred_on desc)
  where shared = true;
