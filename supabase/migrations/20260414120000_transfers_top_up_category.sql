alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  transfers_parent uuid;
begin
  select id
  into transfers_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'transfers'
  limit 1;

  if transfers_parent is not null and not exists (
    select 1
    from public.categories
    where is_system = true
      and parent_id = transfers_parent
      and level = 2
      and lower(name) = 'top up'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Top up', 2, true, transfers_parent, 'cash-plus', '#22C55E');
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
