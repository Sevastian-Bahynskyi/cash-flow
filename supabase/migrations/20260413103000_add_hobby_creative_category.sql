alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  entertainment_parent uuid;
  hobby_creative_category uuid;
begin
  select id
  into entertainment_parent
  from public.categories
  where is_system = true
    and level = 1
    and lower(name) = 'entertainment'
  limit 1;

  if entertainment_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Entertainment', 1, true, 'movie-open-outline', '#A78BFA')
    returning id into entertainment_parent;
  end if;

  select id
  into hobby_creative_category
  from public.categories
  where is_system = true
    and parent_id = entertainment_parent
    and lower(name) = 'hobby/creative'
  limit 1;

  if hobby_creative_category is null then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Hobby/Creative', 2, true, entertainment_parent, 'palette-outline', '#A78BFA');
  else
    update public.categories
    set
      icon = 'palette-outline',
      color = '#A78BFA'
    where id = hobby_creative_category;
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;
