-- Shared budgets: category limits for the joint account, one set per salary cycle.
-- Additive only: public.budgets is untouched and its rows stay the personal budgets.
-- Shared budgets count each joint purchase in full; personal budgets count your own purchases plus your share of joint ones.

create table if not exists public.shared_budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  salary_cycle_id uuid not null references public.transactions(id) on delete cascade,
  amount_minor    bigint not null check (amount_minor > 0),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (user_id, category_id, salary_cycle_id)
);

create index if not exists shared_budgets_user_cycle_idx
  on public.shared_budgets (user_id, salary_cycle_id);

alter table public.shared_budgets enable row level security;

drop policy if exists shared_budgets_select_own on public.shared_budgets;
create policy shared_budgets_select_own on public.shared_budgets
  for select using (user_id = (select auth.uid()));

drop policy if exists shared_budgets_insert_own on public.shared_budgets;
create policy shared_budgets_insert_own on public.shared_budgets
  for insert with check (user_id = (select auth.uid()));

drop policy if exists shared_budgets_update_own on public.shared_budgets;
create policy shared_budgets_update_own on public.shared_budgets
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists shared_budgets_delete_own on public.shared_budgets;
create policy shared_budgets_delete_own on public.shared_budgets
  for delete using (user_id = (select auth.uid()));

-- A new salary starts a fresh cycle with the usual shared limits, as copy_previous_cycle_budgets does for personal ones.
-- The limits are copied, never what was left: unused room does not carry over.
create or replace function public.copy_previous_cycle_shared_budgets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_salary_id uuid;
begin
  if new.is_salary is distinct from true or new.kind <> 'income' then
    return new;
  end if;

  select t.id
    into previous_salary_id
  from public.transactions t
  where t.user_id = new.user_id
    and t.is_salary = true
    and t.occurred_on < new.occurred_on
    and t.id <> new.id
  order by t.occurred_on desc, t.created_at desc
  limit 1;

  if previous_salary_id is null then
    return new;
  end if;

  insert into public.shared_budgets (user_id, category_id, salary_cycle_id, amount_minor, notes)
  select new.user_id, b.category_id, new.id, b.amount_minor, b.notes
  from public.shared_budgets b
  where b.user_id = new.user_id
    and b.salary_cycle_id = previous_salary_id
  on conflict (user_id, category_id, salary_cycle_id) do nothing;

  return new;
end;
$$;

drop trigger if exists transactions_copy_previous_cycle_shared_budgets on public.transactions;
create trigger transactions_copy_previous_cycle_shared_budgets
after insert on public.transactions
for each row
when (new.is_salary = true)
execute function public.copy_previous_cycle_shared_budgets();
