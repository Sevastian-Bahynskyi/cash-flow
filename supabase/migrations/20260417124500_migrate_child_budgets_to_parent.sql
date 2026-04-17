do $$
begin
  insert into public.budgets (user_id, category_id, salary_cycle_id, amount_minor, created_at)
  select
    b.user_id,
    c.parent_id,
    b.salary_cycle_id,
    sum(b.amount_minor),
    min(b.created_at)
  from public.budgets b
  join public.categories c on c.id = b.category_id
  join public.categories p on p.id = c.parent_id
  where c.level = 2
    and c.parent_id is not null
    and lower(p.name) <> 'transfers'
  group by b.user_id, c.parent_id, b.salary_cycle_id
  on conflict (user_id, category_id, salary_cycle_id)
  do update set
    amount_minor = public.budgets.amount_minor + excluded.amount_minor,
    created_at = least(public.budgets.created_at, excluded.created_at);

  delete from public.budgets b
  using public.categories c
  join public.categories p on p.id = c.parent_id
  where b.category_id = c.id
    and c.level = 2
    and lower(p.name) <> 'transfers';
end $$;
