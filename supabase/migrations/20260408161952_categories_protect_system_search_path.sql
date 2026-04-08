-- Keep the system-category protection trigger function on a safe search_path.
create or replace function public.categories_protect_system()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
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
