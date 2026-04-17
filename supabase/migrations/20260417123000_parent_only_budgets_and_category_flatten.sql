alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  entertainment_parent uuid;
  bills_parent uuid;
  shopping_parent uuid;
  transport_parent uuid;
  travel_parent uuid;
  health_parent uuid;
  sport_parent uuid;
  doctor_parent uuid;
  rent_parent uuid;
  save_up_parent uuid;
  child record;
begin
  select id into entertainment_parent
  from public.categories
  where level = 1 and lower(name) = 'entertainment'
  limit 1;
  if entertainment_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Entertainment', 1, true, 'film', '#A78BFA')
    returning id into entertainment_parent;
  end if;

  select id into bills_parent
  from public.categories
  where level = 1 and lower(name) = 'bills'
  limit 1;
  if bills_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Bills', 1, true, 'file-invoice-dollar', '#F59E0B')
    returning id into bills_parent;
  end if;

  select id into shopping_parent
  from public.categories
  where level = 1 and lower(name) = 'shopping'
  limit 1;
  if shopping_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Shopping', 1, true, 'bag-shopping', '#FB7185')
    returning id into shopping_parent;
  end if;

  select id into transport_parent
  from public.categories
  where level = 1 and lower(name) = 'transport'
  limit 1;
  if transport_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Transport', 1, true, 'car-side', '#60A5FA')
    returning id into transport_parent;
  end if;

  select id into travel_parent
  from public.categories
  where level = 1 and lower(name) = 'travel'
  limit 1;
  if travel_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Travel', 1, true, 'plane-departure', '#38BDF8')
    returning id into travel_parent;
  end if;

  select id into sport_parent
  from public.categories
  where level = 1 and lower(name) = 'sport'
  limit 1;
  if sport_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Sport', 1, true, 'dumbbell', '#22C55E')
    returning id into sport_parent;
  end if;

  select id into doctor_parent
  from public.categories
  where level = 1 and lower(name) = 'doctor'
  limit 1;
  if doctor_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Doctor', 1, true, 'stethoscope', '#F472B6')
    returning id into doctor_parent;
  end if;

  select id into rent_parent
  from public.categories
  where level = 1 and lower(name) = 'rent'
  limit 1;
  if rent_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Rent', 1, true, 'house', '#F97316')
    returning id into rent_parent;
  end if;

  select id into save_up_parent
  from public.categories
  where level = 1 and lower(name) = 'save up'
  limit 1;
  if save_up_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Save Up', 1, true, 'piggy-bank', '#94A3B8')
    returning id into save_up_parent;
  end if;

  update public.categories
  set icon = 'film', color = '#A78BFA'
  where id = entertainment_parent;

  update public.categories
  set icon = 'file-invoice-dollar', color = '#F59E0B'
  where id = bills_parent;

  update public.categories
  set icon = 'bag-shopping', color = '#FB7185'
  where id = shopping_parent;

  update public.categories
  set icon = 'car-side', color = '#60A5FA'
  where id = transport_parent;

  update public.categories
  set icon = 'plane-departure', color = '#38BDF8'
  where id = travel_parent;

  update public.categories
  set icon = 'dumbbell', color = '#22C55E'
  where id = sport_parent;

  update public.categories
  set icon = 'stethoscope', color = '#F472B6'
  where id = doctor_parent;

  update public.categories
  set icon = 'house', color = '#F97316'
  where id = rent_parent;

  update public.categories
  set icon = 'piggy-bank', color = '#94A3B8'
  where id = save_up_parent;

  select id into health_parent
  from public.categories
  where level = 1 and lower(name) = 'health'
  limit 1;

  if health_parent is not null then
    for child in
      select id, name
      from public.categories
      where parent_id = health_parent and level = 2
    loop
      if lower(child.name) = 'fitness' then
        update public.transactions set category_id = sport_parent where category_id = child.id;

        insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
        select user_id, sport_parent, salary_cycle_id, sum(amount_minor), min(created_at)
        from public.budgets
        where category_id = child.id
        group by user_id, salary_cycle_id
        on conflict (user_id, category_id, salary_cycle_id)
        do update set
          amount_minor = public.budgets.amount_minor + excluded.amount_minor,
          created_at = least(public.budgets.created_at, excluded.created_at);
        delete from public.budgets where category_id = child.id;

        insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
        select user_id, sport_parent, name, icon, updated_at
        from public.category_overrides
        where category_id = child.id
        on conflict (user_id, category_id) do nothing;
        delete from public.category_overrides where category_id = child.id;

        update public.ai_category_rules set category_id = sport_parent where category_id = child.id;
        update public.merchant_category_rules set category_id = sport_parent where category_id = child.id;
        update public.merchant_category_memory set category_id = sport_parent where category_id = child.id;
      else
        update public.transactions set category_id = doctor_parent where category_id = child.id;

        insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
        select user_id, doctor_parent, salary_cycle_id, sum(amount_minor), min(created_at)
        from public.budgets
        where category_id = child.id
        group by user_id, salary_cycle_id
        on conflict (user_id, category_id, salary_cycle_id)
        do update set
          amount_minor = public.budgets.amount_minor + excluded.amount_minor,
          created_at = least(public.budgets.created_at, excluded.created_at);
        delete from public.budgets where category_id = child.id;

        insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
        select user_id, doctor_parent, name, icon, updated_at
        from public.category_overrides
        where category_id = child.id
        on conflict (user_id, category_id) do nothing;
        delete from public.category_overrides where category_id = child.id;

        update public.ai_category_rules set category_id = doctor_parent where category_id = child.id;
        update public.merchant_category_rules set category_id = doctor_parent where category_id = child.id;
        update public.merchant_category_memory set category_id = doctor_parent where category_id = child.id;
      end if;

      delete from public.categories where id = child.id;
    end loop;
  end if;

  for child in
    select id, name
    from public.categories
    where parent_id = entertainment_parent and level = 2
  loop
    update public.transactions set category_id = entertainment_parent where category_id = child.id;

    insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
    select user_id, entertainment_parent, salary_cycle_id, sum(amount_minor), min(created_at)
    from public.budgets
    where category_id = child.id
    group by user_id, salary_cycle_id
    on conflict (user_id, category_id, salary_cycle_id)
    do update set
      amount_minor = public.budgets.amount_minor + excluded.amount_minor,
      created_at = least(public.budgets.created_at, excluded.created_at);
    delete from public.budgets where category_id = child.id;

    insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
    select user_id, entertainment_parent, name, icon, updated_at
    from public.category_overrides
    where category_id = child.id
    on conflict (user_id, category_id) do nothing;
    delete from public.category_overrides where category_id = child.id;

    update public.ai_category_rules set category_id = entertainment_parent where category_id = child.id;
    update public.merchant_category_rules set category_id = entertainment_parent where category_id = child.id;
    update public.merchant_category_memory set category_id = entertainment_parent where category_id = child.id;

    delete from public.categories where id = child.id;
  end loop;

  for child in
    select id, name
    from public.categories
    where parent_id = bills_parent and level = 2
  loop
    if lower(child.name) = 'rent' then
      update public.transactions set category_id = rent_parent where category_id = child.id;

      insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
      select user_id, rent_parent, salary_cycle_id, sum(amount_minor), min(created_at)
      from public.budgets
      where category_id = child.id
      group by user_id, salary_cycle_id
      on conflict (user_id, category_id, salary_cycle_id)
      do update set
        amount_minor = public.budgets.amount_minor + excluded.amount_minor,
        created_at = least(public.budgets.created_at, excluded.created_at);
      delete from public.budgets where category_id = child.id;

      insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
      select user_id, rent_parent, name, icon, updated_at
      from public.category_overrides
      where category_id = child.id
      on conflict (user_id, category_id) do nothing;
      delete from public.category_overrides where category_id = child.id;

      update public.ai_category_rules set category_id = rent_parent where category_id = child.id;
      update public.merchant_category_rules set category_id = rent_parent where category_id = child.id;
      update public.merchant_category_memory set category_id = rent_parent where category_id = child.id;
    else
      update public.transactions set category_id = bills_parent where category_id = child.id;

      insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
      select user_id, bills_parent, salary_cycle_id, sum(amount_minor), min(created_at)
      from public.budgets
      where category_id = child.id
      group by user_id, salary_cycle_id
      on conflict (user_id, category_id, salary_cycle_id)
      do update set
        amount_minor = public.budgets.amount_minor + excluded.amount_minor,
        created_at = least(public.budgets.created_at, excluded.created_at);
      delete from public.budgets where category_id = child.id;

      insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
      select user_id, bills_parent, name, icon, updated_at
      from public.category_overrides
      where category_id = child.id
      on conflict (user_id, category_id) do nothing;
      delete from public.category_overrides where category_id = child.id;

      update public.ai_category_rules set category_id = bills_parent where category_id = child.id;
      update public.merchant_category_rules set category_id = bills_parent where category_id = child.id;
      update public.merchant_category_memory set category_id = bills_parent where category_id = child.id;
    end if;

    delete from public.categories where id = child.id;
  end loop;

  for child in
    select id, name
    from public.categories
    where parent_id = shopping_parent and level = 2
  loop
    update public.transactions set category_id = shopping_parent where category_id = child.id;

    insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
    select user_id, shopping_parent, salary_cycle_id, sum(amount_minor), min(created_at)
    from public.budgets
    where category_id = child.id
    group by user_id, salary_cycle_id
    on conflict (user_id, category_id, salary_cycle_id)
    do update set
      amount_minor = public.budgets.amount_minor + excluded.amount_minor,
      created_at = least(public.budgets.created_at, excluded.created_at);
    delete from public.budgets where category_id = child.id;

    insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
    select user_id, shopping_parent, name, icon, updated_at
    from public.category_overrides
    where category_id = child.id
    on conflict (user_id, category_id) do nothing;
    delete from public.category_overrides where category_id = child.id;

    update public.ai_category_rules set category_id = shopping_parent where category_id = child.id;
    update public.merchant_category_rules set category_id = shopping_parent where category_id = child.id;
    update public.merchant_category_memory set category_id = shopping_parent where category_id = child.id;

    delete from public.categories where id = child.id;
  end loop;

  for child in
    select id, name
    from public.categories
    where parent_id = transport_parent and level = 2
  loop
    update public.transactions set category_id = transport_parent where category_id = child.id;

    insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
    select user_id, transport_parent, salary_cycle_id, sum(amount_minor), min(created_at)
    from public.budgets
    where category_id = child.id
    group by user_id, salary_cycle_id
    on conflict (user_id, category_id, salary_cycle_id)
    do update set
      amount_minor = public.budgets.amount_minor + excluded.amount_minor,
      created_at = least(public.budgets.created_at, excluded.created_at);
    delete from public.budgets where category_id = child.id;

    insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
    select user_id, transport_parent, name, icon, updated_at
    from public.category_overrides
    where category_id = child.id
    on conflict (user_id, category_id) do nothing;
    delete from public.category_overrides where category_id = child.id;

    update public.ai_category_rules set category_id = transport_parent where category_id = child.id;
    update public.merchant_category_rules set category_id = transport_parent where category_id = child.id;
    update public.merchant_category_memory set category_id = transport_parent where category_id = child.id;

    delete from public.categories where id = child.id;
  end loop;

  for child in
    select id, name
    from public.categories
    where parent_id = travel_parent and level = 2
  loop
    update public.transactions set category_id = travel_parent where category_id = child.id;

    insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
    select user_id, travel_parent, salary_cycle_id, sum(amount_minor), min(created_at)
    from public.budgets
    where category_id = child.id
    group by user_id, salary_cycle_id
    on conflict (user_id, category_id, salary_cycle_id)
    do update set
      amount_minor = public.budgets.amount_minor + excluded.amount_minor,
      created_at = least(public.budgets.created_at, excluded.created_at);
    delete from public.budgets where category_id = child.id;

    insert into public.category_overrides (user_id, category_id, name, icon, updated_at)
    select user_id, travel_parent, name, icon, updated_at
    from public.category_overrides
    where category_id = child.id
    on conflict (user_id, category_id) do nothing;
    delete from public.category_overrides where category_id = child.id;

    update public.ai_category_rules set category_id = travel_parent where category_id = child.id;
    update public.merchant_category_rules set category_id = travel_parent where category_id = child.id;
    update public.merchant_category_memory set category_id = travel_parent where category_id = child.id;

    delete from public.categories where id = child.id;
  end loop;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
