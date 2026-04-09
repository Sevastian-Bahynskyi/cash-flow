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

  if transfers_parent is null then
    insert into public.categories (name, level, is_system, icon, color)
    values ('Transfers', 1, true, 'swap-horizontal', '#22C55E')
    returning id into transfers_parent;
  end if;

  if not exists (
    select 1
    from public.categories
    where is_system = true
      and parent_id = transfers_parent
      and level = 2
      and lower(name) = 'mobilepay'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('MobilePay', 2, true, transfers_parent, 'cellphone-marker', '#22C55E');
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;

create table if not exists public.transfer_people (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  normalized_name text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create index if not exists transfer_people_user_name_idx
  on public.transfer_people (user_id, normalized_name);

alter table public.transfer_people enable row level security;

drop policy if exists transfer_people_select_own on public.transfer_people;
create policy transfer_people_select_own on public.transfer_people
  for select using (user_id = auth.uid());

drop policy if exists transfer_people_insert_own on public.transfer_people;
create policy transfer_people_insert_own on public.transfer_people
  for insert with check (user_id = auth.uid());

drop policy if exists transfer_people_update_own on public.transfer_people;
create policy transfer_people_update_own on public.transfer_people
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transfer_people_delete_own on public.transfer_people;
create policy transfer_people_delete_own on public.transfer_people
  for delete using (user_id = auth.uid());

create or replace function public.transfer_people_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transfer_people_touch_updated_at_trg on public.transfer_people;
create trigger transfer_people_touch_updated_at_trg
  before update on public.transfer_people
  for each row execute function public.transfer_people_touch_updated_at();
