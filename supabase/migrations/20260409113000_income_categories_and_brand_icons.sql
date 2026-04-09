alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  income_parent uuid;
  transfers_parent uuid;
  salary_category uuid;
  other_income_category uuid;
begin
  select id
  into income_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'income'
  limit 1;

  if income_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Income', 1, true, 'cash-plus', '#22C55E')
    returning id into income_parent;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'salary'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Salary', 2, true, income_parent, 'briefcase-outline', '#22C55E');
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'bonus'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Bonus', 2, true, income_parent, 'gift-outline', '#22C55E');
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'refund'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Refund', 2, true, income_parent, 'cash-refund', '#22C55E');
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'freelance'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Freelance', 2, true, income_parent, 'laptop', '#22C55E');
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'interest'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Interest', 2, true, income_parent, 'chart-line', '#22C55E');
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'other income'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Other income', 2, true, income_parent, 'account-cash-outline', '#22C55E');
  end if;

  select id
  into transfers_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transfers'
  limit 1;

  if transfers_parent is not null then
    update public.categories
    set icon = 'brand:mobilepay'
    where is_system = true
      and parent_id = transfers_parent
      and lower(name) = 'mobilepay';
  end if;

  select id
  into salary_category
  from public.categories
  where is_system = true
    and parent_id = income_parent
    and lower(name) = 'salary'
  limit 1;

  select id
  into other_income_category
  from public.categories
  where is_system = true
    and parent_id = income_parent
    and lower(name) = 'other income'
  limit 1;

  update public.transactions
  set category_id = salary_category
  where kind = 'income'
    and is_salary = true
    and category_id is null
    and salary_category is not null;

  update public.transactions
  set category_id = other_income_category
  where kind = 'income'
    and category_id is null
    and other_income_category is not null;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;

alter table public.transactions
  drop constraint if exists transactions_expense_requires_category;

alter table public.transactions
  drop constraint if exists transactions_requires_category;

alter table public.transactions
  add constraint transactions_requires_category
  check (category_id is not null);
