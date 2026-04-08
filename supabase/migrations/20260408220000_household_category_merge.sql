-- Merge Bills into Household and add a few new system subcategories.

alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  household_id uuid;
  bills_id uuid;
  child_row record;
  renamed_child_name text;
begin
  select id
  into household_id
  from public.categories
  where is_system = true
    and parent_id is null
    and lower(name) in ('household', 'housing')
  order by case when lower(name) = 'household' then 0 else 1 end
  limit 1;

  select id
  into bills_id
  from public.categories
  where is_system = true
    and parent_id is null
    and lower(name) = 'bills'
  limit 1;

  if household_id is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Household', 1, true, 'home-city-outline', '#F59E0B')
    returning id into household_id;
  else
    update public.categories
    set
      name = 'Household',
      icon = 'home-city-outline',
      color = '#F59E0B'
    where id = household_id;
  end if;

  if bills_id is not null and bills_id <> household_id then
    for child_row in
      select id, user_id, name
      from public.categories
      where parent_id = bills_id
    loop
      renamed_child_name := child_row.name;

      if exists (
        select 1
        from public.categories target
        where target.parent_id = household_id
          and coalesce(target.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(child_row.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and lower(target.name) = lower(child_row.name)
          and target.id <> child_row.id
      ) then
        renamed_child_name := child_row.name || ' (Bills)';

        if exists (
          select 1
          from public.categories target
          where target.parent_id = household_id
            and coalesce(target.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(child_row.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
            and lower(target.name) = lower(renamed_child_name)
            and target.id <> child_row.id
        ) then
          renamed_child_name := child_row.name || ' (' || left(child_row.id::text, 6) || ')';
        end if;
      end if;

      update public.categories
      set
        parent_id = household_id,
        name = renamed_child_name
      where id = child_row.id;
    end loop;

    update public.budgets
    set category_id = household_id
    where category_id = bills_id;

    update public.transactions
    set category_id = household_id
    where category_id = bills_id;

    delete from public.categories
    where id = bills_id;
  end if;

  update public.categories
  set
    color = '#F59E0B',
    icon = case lower(name)
      when 'rent' then 'home-outline'
      when 'utilities' then 'flash-outline'
      when 'internet' then 'wifi'
      when 'phone' then 'cellphone'
      when 'gas' then 'meter-gas-outline'
      when 'car insurance' then 'shield-car'
      else icon
    end
  where parent_id = household_id
    and lower(name) in ('rent', 'utilities', 'internet', 'phone', 'gas', 'car insurance');

  if not exists (
    select 1
    from public.categories
    where parent_id = household_id
      and lower(name) = 'gas'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Gas', 2, true, household_id, 'meter-gas-outline', '#F59E0B');
  end if;

  if not exists (
    select 1
    from public.categories
    where parent_id = household_id
      and lower(name) = 'car insurance'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Car insurance', 2, true, household_id, 'shield-car', '#F59E0B');
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
