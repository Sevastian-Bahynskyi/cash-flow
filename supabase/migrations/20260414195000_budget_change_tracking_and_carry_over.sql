do $$ begin
  create type public.budget_change_action as enum ('create', 'update', 'delete');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.budget_change_reason as enum ('manual', 'carry_over');
exception when duplicate_object then null;
end $$;

create table if not exists public.budget_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid references public.budgets(id) on delete set null,
  category_id uuid not null references public.categories(id) on delete cascade,
  salary_cycle_id uuid not null references public.transactions(id) on delete cascade,
  action public.budget_change_action not null,
  reason public.budget_change_reason not null default 'manual',
  old_amount_minor bigint,
  new_amount_minor bigint,
  created_at timestamptz not null default now()
);

create index if not exists budget_change_events_user_created_at_idx
  on public.budget_change_events (user_id, created_at desc);

alter table public.budget_change_events enable row level security;

drop policy if exists budget_change_events_select_own on public.budget_change_events;
create policy budget_change_events_select_own on public.budget_change_events
  for select using (user_id = auth.uid());

drop policy if exists budget_change_events_insert_own on public.budget_change_events;
create policy budget_change_events_insert_own on public.budget_change_events
  for insert with check (user_id = auth.uid());

drop policy if exists budget_change_events_update_own on public.budget_change_events;
create policy budget_change_events_update_own on public.budget_change_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists budget_change_events_delete_own on public.budget_change_events;
create policy budget_change_events_delete_own on public.budget_change_events
  for delete using (user_id = auth.uid());

create or replace function public.log_budget_change_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reason_value public.budget_change_reason := coalesce(nullif(current_setting('app.budget_change_reason', true), ''), 'manual')::public.budget_change_reason;
begin
  if tg_op = 'INSERT' then
    insert into public.budget_change_events (
      user_id,
      budget_id,
      category_id,
      salary_cycle_id,
      action,
      reason,
      old_amount_minor,
      new_amount_minor
    ) values (
      new.user_id,
      new.id,
      new.category_id,
      new.salary_cycle_id,
      'create',
      reason_value,
      null,
      new.amount_minor
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.amount_minor is distinct from new.amount_minor
      or old.category_id is distinct from new.category_id
      or old.salary_cycle_id is distinct from new.salary_cycle_id then
      insert into public.budget_change_events (
        user_id,
        budget_id,
        category_id,
        salary_cycle_id,
        action,
        reason,
        old_amount_minor,
        new_amount_minor
      ) values (
        new.user_id,
        new.id,
        new.category_id,
        new.salary_cycle_id,
        'update',
        reason_value,
        old.amount_minor,
        new.amount_minor
      );
    end if;
    return new;
  else
    insert into public.budget_change_events (
      user_id,
      budget_id,
      category_id,
      salary_cycle_id,
      action,
      reason,
      old_amount_minor,
      new_amount_minor
    ) values (
      old.user_id,
      old.id,
      old.category_id,
      old.salary_cycle_id,
      'delete',
      reason_value,
      old.amount_minor,
      null
    );
    return old;
  end if;
end;
$$;

drop trigger if exists budgets_log_change_event on public.budgets;
create trigger budgets_log_change_event
after insert or update or delete on public.budgets
for each row execute function public.log_budget_change_event();

create or replace function public.copy_previous_cycle_budgets()
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

  perform set_config('app.budget_change_reason', 'carry_over', true);

  insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor)
  select
    new.user_id,
    b.category_id,
    new.id,
    b.amount_minor
  from public.budgets b
  where b.user_id = new.user_id
    and b.salary_cycle_id = previous_salary_id
  on conflict (user_id, category_id, salary_cycle_id)
  do update set amount_minor = excluded.amount_minor;

  return new;
end;
$$;

drop trigger if exists transactions_copy_previous_cycle_budgets on public.transactions;
create trigger transactions_copy_previous_cycle_budgets
after insert on public.transactions
for each row
when (new.is_salary = true)
execute function public.copy_previous_cycle_budgets();
