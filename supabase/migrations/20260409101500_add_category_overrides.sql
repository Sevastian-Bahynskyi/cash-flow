create table if not exists public.category_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text,
  icon        text,
  updated_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

create index if not exists category_overrides_user_idx
  on public.category_overrides (user_id, updated_at desc);

alter table public.category_overrides enable row level security;

drop policy if exists category_overrides_select_own on public.category_overrides;
create policy category_overrides_select_own on public.category_overrides
  for select using (user_id = auth.uid());

drop policy if exists category_overrides_insert_own on public.category_overrides;
create policy category_overrides_insert_own on public.category_overrides
  for insert with check (user_id = auth.uid());

drop policy if exists category_overrides_update_own on public.category_overrides;
create policy category_overrides_update_own on public.category_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists category_overrides_delete_own on public.category_overrides;
create policy category_overrides_delete_own on public.category_overrides
  for delete using (user_id = auth.uid());

create or replace function public.category_overrides_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists category_overrides_touch_updated_at_trg on public.category_overrides;
create trigger category_overrides_touch_updated_at_trg
  before update on public.category_overrides
  for each row execute function public.category_overrides_touch_updated_at();
