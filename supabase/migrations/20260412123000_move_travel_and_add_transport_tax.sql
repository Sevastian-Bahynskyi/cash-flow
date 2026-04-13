alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  entertainment_parent uuid;
  other_parent uuid;
  transport_parent uuid;
  entertainment_travel uuid;
  other_travel uuid;
begin
  select id
  into entertainment_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'entertainment'
  limit 1;

  select id
  into other_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'other'
  limit 1;

  select id
  into transport_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transport'
  limit 1;

  select id
  into entertainment_travel
  from public.categories
  where is_system = true
    and parent_id = entertainment_parent
    and lower(name) = 'travel'
  limit 1;

  select id
  into other_travel
  from public.categories
  where is_system = true
    and parent_id = other_parent
    and lower(name) = 'travel'
  limit 1;

  if entertainment_travel is not null and other_travel is not null and entertainment_travel <> other_travel then
    update public.transactions
    set category_id = entertainment_travel
    where category_id = other_travel;

    delete from public.budgets source
    using public.budgets target
    where source.category_id = other_travel
      and target.category_id = entertainment_travel
      and source.user_id = target.user_id
      and source.salary_cycle_id = target.salary_cycle_id;

    update public.budgets
    set category_id = entertainment_travel
    where category_id = other_travel;

    delete from public.category_overrides source
    using public.category_overrides target
    where source.category_id = other_travel
      and target.category_id = entertainment_travel
      and source.user_id = target.user_id;

    update public.category_overrides
    set category_id = entertainment_travel
    where category_id = other_travel;

    update public.ai_category_rules
    set category_id = entertainment_travel
    where category_id = other_travel;

    update public.merchant_category_rules
    set category_id = entertainment_travel
    where category_id = other_travel;

    update public.merchant_category_memory
    set category_id = entertainment_travel
    where category_id = other_travel;

    delete from public.categories
    where id = other_travel;
  elsif entertainment_travel is null and other_travel is not null and entertainment_parent is not null then
    update public.categories
    set
      parent_id = entertainment_parent,
      icon = 'airplane',
      color = '#A78BFA'
    where id = other_travel;

    entertainment_travel := other_travel;
  elsif entertainment_travel is null and entertainment_parent is not null then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Travel', 2, true, entertainment_parent, 'airplane', '#A78BFA')
    returning id into entertainment_travel;
  end if;

  if entertainment_travel is not null then
    update public.categories
    set
      parent_id = entertainment_parent,
      icon = 'airplane',
      color = '#A78BFA'
    where id = entertainment_travel;
  end if;

  if other_parent is not null then
    delete from public.categories
    where is_system = true
      and parent_id = other_parent
      and lower(name) = 'travel';
  end if;

  if transport_parent is not null and not exists (
    select 1
    from public.categories
    where is_system = true
      and parent_id = transport_parent
      and lower(name) = 'transport tax'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Transport tax', 2, true, transport_parent, 'receipt-text-outline', '#60A5FA');
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
