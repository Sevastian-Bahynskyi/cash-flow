alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  transport_parent uuid;
  household_parent uuid;
  transfers_parent uuid;
  household_gas uuid;
  transport_fuel uuid;
begin
  select id
  into transport_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transport'
  limit 1;

  select id
  into household_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'household'
  limit 1;

  select id
  into transfers_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transfers'
  limit 1;

  select id
  into household_gas
  from public.categories
  where is_system = true
    and parent_id = household_parent
    and lower(name) = 'gas'
  limit 1;

  select id
  into transport_fuel
  from public.categories
  where is_system = true
    and parent_id = transport_parent
    and lower(name) = 'fuel'
  limit 1;

  if transport_parent is not null and not exists (
    select 1
    from public.categories
    where is_system = true
      and parent_id = transport_parent
      and lower(name) = 'parking'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Parking', 2, true, transport_parent, 'parking', '#60A5FA');
  end if;

  if transfers_parent is not null and not exists (
    select 1
    from public.categories
    where is_system = true
      and parent_id = transfers_parent
      and lower(name) = 'transfer'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Transfer', 2, true, transfers_parent, 'bank-transfer', '#22C55E');
  end if;

  if household_gas is not null and transport_fuel is not null then
    update public.transactions
    set category_id = transport_fuel
    where category_id = household_gas;

    update public.budgets
    set category_id = transport_fuel
    where category_id = household_gas;

    delete from public.categories
    where id = household_gas;
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
