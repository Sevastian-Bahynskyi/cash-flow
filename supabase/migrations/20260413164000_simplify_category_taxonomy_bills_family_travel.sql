alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  bills_parent uuid;
  household_parent uuid;
  travel_parent uuid;
  family_care_parent uuid;
  entertainment_parent uuid;
  other_parent uuid;
  transport_parent uuid;

  bills_subcategory uuid;
  insurance_subcategory uuid;
  rent_subcategory uuid;
  vacation_subcategory uuid;
  pets_subcategory uuid;
  kids_subcategory uuid;
  girlfriend_subcategory uuid;

  source_category_id uuid;
begin
  select id into bills_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'bills'
  limit 1;

  select id into household_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'household'
  limit 1;

  if bills_parent is null and household_parent is not null then
    update public.categories
    set
      name = 'Bills',
      icon = 'receipt-text-outline',
      color = '#F59E0B'
    where id = household_parent;

    bills_parent := household_parent;
  elsif bills_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Bills', 1, true, 'receipt-text-outline', '#F59E0B')
    returning id into bills_parent;
  else
    update public.categories
    set
      icon = 'receipt-text-outline',
      color = '#F59E0B'
    where id = bills_parent;
  end if;

  if household_parent is not null and household_parent <> bills_parent then
    for source_category_id in
      select id
      from public.categories
      where is_system = true
        and parent_id = household_parent
    loop
      update public.categories
      set parent_id = bills_parent
      where id = source_category_id;
    end loop;

    update public.transactions
    set category_id = bills_parent
    where category_id = household_parent;

    delete from public.budgets source
    using public.budgets target
    where source.category_id = household_parent
      and target.category_id = bills_parent
      and source.user_id = target.user_id
      and source.salary_cycle_id = target.salary_cycle_id;

    update public.budgets
    set category_id = bills_parent
    where category_id = household_parent;

    delete from public.category_overrides source
    using public.category_overrides target
    where source.category_id = household_parent
      and target.category_id = bills_parent
      and source.user_id = target.user_id;

    update public.category_overrides
    set category_id = bills_parent
    where category_id = household_parent;

    update public.ai_category_rules
    set category_id = bills_parent
    where category_id = household_parent;

    update public.merchant_category_rules
    set category_id = bills_parent
    where category_id = household_parent;

    update public.merchant_category_memory
    set category_id = bills_parent
    where category_id = household_parent;

    delete from public.categories
    where id = household_parent;
  end if;

  select id into travel_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'travel'
  limit 1;

  if travel_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Travel', 1, true, 'airplane', '#38BDF8')
    returning id into travel_parent;
  else
    update public.categories
    set
      icon = 'airplane',
      color = '#38BDF8'
    where id = travel_parent;
  end if;

  select id into family_care_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'family & care'
  limit 1;

  if family_care_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Family & Care', 1, true, 'account-heart-outline', '#EC4899')
    returning id into family_care_parent;
  else
    update public.categories
    set
      icon = 'account-heart-outline',
      color = '#EC4899'
    where id = family_care_parent;
  end if;

  select id into entertainment_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'entertainment'
  limit 1;

  select id into other_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'other'
  limit 1;

  select id into transport_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transport'
  limit 1;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'bills'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Bills', 2, true, bills_parent, 'file-document-outline', '#F59E0B')
    returning id into bills_subcategory;
  else
    select id into bills_subcategory
    from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'bills'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'insurance'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Insurance', 2, true, bills_parent, 'shield-check-outline', '#F59E0B')
    returning id into insurance_subcategory;
  else
    select id into insurance_subcategory
    from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'insurance'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'rent'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Rent', 2, true, bills_parent, 'home-outline', '#F59E0B')
    returning id into rent_subcategory;
  else
    select id into rent_subcategory
    from public.categories
    where is_system = true
      and parent_id = bills_parent
      and lower(name) = 'rent'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = travel_parent
      and lower(name) = 'vacation'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Vacation', 2, true, travel_parent, 'beach', '#38BDF8')
    returning id into vacation_subcategory;
  else
    select id into vacation_subcategory
    from public.categories
    where is_system = true
      and parent_id = travel_parent
      and lower(name) = 'vacation'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'pets'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Pets', 2, true, family_care_parent, 'paw', '#EC4899')
    returning id into pets_subcategory;
  else
    select id into pets_subcategory
    from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'pets'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'kids'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Kids', 2, true, family_care_parent, 'baby-face-outline', '#EC4899')
    returning id into kids_subcategory;
  else
    select id into kids_subcategory
    from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'kids'
    limit 1;
  end if;

  if not exists (
    select 1 from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'girlfriend'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Girlfriend', 2, true, family_care_parent, 'heart-outline', '#EC4899')
    returning id into girlfriend_subcategory;
  else
    select id into girlfriend_subcategory
    from public.categories
    where is_system = true
      and parent_id = family_care_parent
      and lower(name) = 'girlfriend'
    limit 1;
  end if;

  update public.categories
  set
    icon = 'receipt-text-outline',
    color = '#F59E0B'
  where id = bills_parent;

  update public.categories
  set
    icon = 'airplane',
    color = '#38BDF8'
  where id = travel_parent;

  update public.categories
  set
    icon = 'account-heart-outline',
    color = '#EC4899'
  where id = family_care_parent;

  if transport_parent is not null then
    update public.categories
    set
      icon = 'receipt-text-outline',
      color = '#60A5FA'
    where is_system = true
      and parent_id = transport_parent
      and lower(name) = 'transport tax';
  end if;

  update public.categories
  set
    icon = 'file-document-outline',
    color = '#F59E0B'
  where id = bills_subcategory;

  update public.categories
  set
    icon = 'shield-check-outline',
    color = '#F59E0B'
  where id = insurance_subcategory;

  update public.categories
  set
    icon = 'home-outline',
    color = '#F59E0B'
  where id = rent_subcategory;

  update public.categories
  set
    icon = 'beach',
    color = '#38BDF8'
  where id = vacation_subcategory;

  update public.categories
  set
    icon = 'paw',
    color = '#EC4899'
  where id = pets_subcategory;

  update public.categories
  set
    icon = 'baby-face-outline',
    color = '#EC4899'
  where id = kids_subcategory;

  update public.categories
  set
    icon = 'heart-outline',
    color = '#EC4899'
  where id = girlfriend_subcategory;

  for source_category_id in
    select id from public.categories
    where is_system = true
      and lower(name) in ('utilities', 'phone', 'internet', 'gas', 'subscriptions')
  loop
    if source_category_id is null or source_category_id = bills_subcategory then
      continue;
    end if;

    update public.transactions
    set category_id = bills_subcategory
    where category_id = source_category_id;

    delete from public.budgets source
    using public.budgets target
    where source.category_id = source_category_id
      and target.category_id = bills_subcategory
      and source.user_id = target.user_id
      and source.salary_cycle_id = target.salary_cycle_id;

    update public.budgets
    set category_id = bills_subcategory
    where category_id = source_category_id;

    delete from public.category_overrides source
    using public.category_overrides target
    where source.category_id = source_category_id
      and target.category_id = bills_subcategory
      and source.user_id = target.user_id;

    update public.category_overrides
    set category_id = bills_subcategory
    where category_id = source_category_id;

    update public.ai_category_rules
    set category_id = bills_subcategory
    where category_id = source_category_id;

    update public.merchant_category_rules
    set category_id = bills_subcategory
    where category_id = source_category_id;

    update public.merchant_category_memory
    set category_id = bills_subcategory
    where category_id = source_category_id;

    delete from public.categories
    where id = source_category_id;
  end loop;

  for source_category_id in
    select id from public.categories
    where is_system = true
      and lower(name) in ('car insurance', 'house insurance')
  loop
    if source_category_id is null or source_category_id = insurance_subcategory then
      continue;
    end if;

    update public.transactions
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    delete from public.budgets source
    using public.budgets target
    where source.category_id = source_category_id
      and target.category_id = insurance_subcategory
      and source.user_id = target.user_id
      and source.salary_cycle_id = target.salary_cycle_id;

    update public.budgets
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    delete from public.category_overrides source
    using public.category_overrides target
    where source.category_id = source_category_id
      and target.category_id = insurance_subcategory
      and source.user_id = target.user_id;

    update public.category_overrides
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    update public.ai_category_rules
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    update public.merchant_category_rules
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    update public.merchant_category_memory
    set category_id = insurance_subcategory
    where category_id = source_category_id;

    delete from public.categories
    where id = source_category_id;
  end loop;

  for source_category_id in
    select id from public.categories
    where is_system = true
      and lower(name) = 'travel'
      and parent_id in (coalesce(entertainment_parent, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(other_parent, '00000000-0000-0000-0000-000000000000'::uuid))
  loop
    if source_category_id is null or source_category_id = vacation_subcategory then
      continue;
    end if;

    update public.transactions
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    delete from public.budgets source
    using public.budgets target
    where source.category_id = source_category_id
      and target.category_id = vacation_subcategory
      and source.user_id = target.user_id
      and source.salary_cycle_id = target.salary_cycle_id;

    update public.budgets
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    delete from public.category_overrides source
    using public.category_overrides target
    where source.category_id = source_category_id
      and target.category_id = vacation_subcategory
      and source.user_id = target.user_id;

    update public.category_overrides
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    update public.ai_category_rules
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    update public.merchant_category_rules
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    update public.merchant_category_memory
    set category_id = vacation_subcategory
    where category_id = source_category_id;

    delete from public.categories
    where id = source_category_id;
  end loop;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
