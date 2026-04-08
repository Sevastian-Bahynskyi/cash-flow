-- Cash Flow: Step 1 foundation schema.
-- Tables: categories, transactions. Owner-scoped RLS. System categories seed.

create extension if not exists "pgcrypto";

-- ============================================================
-- categories
-- ============================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null,
  level       smallint not null check (level in (1, 2)),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint categories_level_parent_chk check (
    (level = 1 and parent_id is null) or
    (level = 2 and parent_id is not null)
  ),
  constraint categories_system_no_user_chk check (
    (is_system = true and user_id is null) or
    (is_system = false and user_id is not null)
  )
);

create unique index if not exists categories_user_parent_name_uniq
  on public.categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists categories_user_parent_idx
  on public.categories (user_id, parent_id, name);

-- Block any mutation/delete of system rows.
create or replace function public.categories_protect_system()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.is_system) then
    raise exception 'system categories are immutable';
  end if;
  if (tg_op = 'UPDATE' and old.is_system) then
    raise exception 'system categories are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists categories_protect_system_trg on public.categories;
create trigger categories_protect_system_trg
  before update or delete on public.categories
  for each row execute function public.categories_protect_system();

alter table public.categories enable row level security;

drop policy if exists categories_select_own_or_system on public.categories;
create policy categories_select_own_or_system on public.categories
  for select using (is_system = true or user_id = auth.uid());

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
  for insert with check (is_system = false and user_id = auth.uid());

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
  for delete using (is_system = false and user_id = auth.uid());

-- ============================================================
-- transactions
-- ============================================================
do $$ begin
  create type public.transaction_kind as enum ('expense', 'income');
exception when duplicate_object then null; end $$;

create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          public.transaction_kind not null,
  amount_minor  bigint not null check (amount_minor > 0),
  occurred_on   date not null,
  name          text not null,
  comment       text,
  category_id   uuid references public.categories(id) on delete restrict,
  country_iso   char(2),
  recurring     boolean not null default false,
  shared        boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint transactions_expense_requires_category check (
    kind <> 'expense' or category_id is not null
  )
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);

create index if not exists transactions_user_kind_idx
  on public.transactions (user_id, kind);

alter table public.transactions enable row level security;

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (user_id = auth.uid());

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert with check (user_id = auth.uid());

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete using (user_id = auth.uid());

-- ============================================================
-- Seed system categories (two levels)
-- ============================================================
do $$
declare
  food uuid; transport uuid; housing uuid; health uuid;
  fun uuid; shopping uuid; bills uuid; other uuid;
begin
  insert into public.categories (name, level, is_system) values ('Food', 1, true) returning id into food;
  insert into public.categories (name, level, is_system) values ('Transport', 1, true) returning id into transport;
  insert into public.categories (name, level, is_system) values ('Housing', 1, true) returning id into housing;
  insert into public.categories (name, level, is_system) values ('Health', 1, true) returning id into health;
  insert into public.categories (name, level, is_system) values ('Entertainment', 1, true) returning id into fun;
  insert into public.categories (name, level, is_system) values ('Shopping', 1, true) returning id into shopping;
  insert into public.categories (name, level, is_system) values ('Bills', 1, true) returning id into bills;
  insert into public.categories (name, level, is_system) values ('Other', 1, true) returning id into other;

  insert into public.categories (name, level, is_system, parent_id) values
    ('Groceries', 2, true, food),
    ('Restaurants', 2, true, food),
    ('Coffee', 2, true, food),
    ('Public transit', 2, true, transport),
    ('Taxi', 2, true, transport),
    ('Fuel', 2, true, transport),
    ('Rent', 2, true, housing),
    ('Utilities', 2, true, housing),
    ('Pharmacy', 2, true, health),
    ('Doctor', 2, true, health),
    ('Movies', 2, true, fun),
    ('Games', 2, true, fun),
    ('Clothes', 2, true, shopping),
    ('Electronics', 2, true, shopping),
    ('Internet', 2, true, bills),
    ('Phone', 2, true, bills),
    ('Misc', 2, true, other);
exception when unique_violation then
  -- Seed already applied.
  null;
end $$;
