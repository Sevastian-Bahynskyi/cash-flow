-- Step 3: richer UX support tables and columns.

-- ============================================================
-- categories: icon + color
-- ============================================================
alter table public.categories
  add column if not exists icon text not null default 'shapes',
  add column if not exists color text not null default '#7C5CFF';

alter table public.categories disable trigger categories_protect_system_trg;

update public.categories
set
  icon = case lower(name)
    when 'food' then 'silverware-fork-knife'
    when 'groceries' then 'cart-outline'
    when 'restaurants' then 'storefront-outline'
    when 'coffee' then 'coffee-outline'
    when 'transport' then 'train-car'
    when 'public transit' then 'bus'
    when 'taxi' then 'taxi'
    when 'fuel' then 'gas-station-outline'
    when 'housing' then 'home-city-outline'
    when 'rent' then 'home-outline'
    when 'utilities' then 'flash-outline'
    when 'health' then 'heart-pulse'
    when 'pharmacy' then 'pill'
    when 'doctor' then 'stethoscope'
    when 'entertainment' then 'party-popper'
    when 'movies' then 'movie-open-outline'
    when 'games' then 'gamepad-variant-outline'
    when 'shopping' then 'shopping-outline'
    when 'clothes' then 'tshirt-crew-outline'
    when 'electronics' then 'laptop'
    when 'bills' then 'receipt-text-outline'
    when 'internet' then 'wifi'
    when 'phone' then 'cellphone'
    when 'other' then 'dots-grid'
    when 'misc' then 'dots-horizontal-circle-outline'
    else icon
  end,
  color = case lower(name)
    when 'food' then '#34D399'
    when 'groceries' then '#34D399'
    when 'restaurants' then '#34D399'
    when 'coffee' then '#34D399'
    when 'transport' then '#60A5FA'
    when 'public transit' then '#60A5FA'
    when 'taxi' then '#60A5FA'
    when 'fuel' then '#60A5FA'
    when 'housing' then '#F59E0B'
    when 'rent' then '#F59E0B'
    when 'utilities' then '#F59E0B'
    when 'health' then '#F472B6'
    when 'pharmacy' then '#F472B6'
    when 'doctor' then '#F472B6'
    when 'entertainment' then '#A78BFA'
    when 'movies' then '#A78BFA'
    when 'games' then '#A78BFA'
    when 'shopping' then '#FB7185'
    when 'clothes' then '#FB7185'
    when 'electronics' then '#FB7185'
    when 'bills' then '#F97316'
    when 'internet' then '#F97316'
    when 'phone' then '#F97316'
    when 'other' then '#94A3B8'
    when 'misc' then '#94A3B8'
    else color
  end
where is_system = true;

alter table public.categories enable trigger categories_protect_system_trg;

-- ============================================================
-- transactions: richer entry metadata
-- ============================================================
alter table public.transactions
  add column if not exists shared_participant text,
  add column if not exists currency_code char(3) not null default 'DKK',
  add column if not exists original_amount_minor bigint,
  add column if not exists converted_amount_minor bigint,
  add column if not exists fx_rate numeric(12,6),
  add column if not exists updated_at timestamptz not null default now();

update public.transactions
set
  original_amount_minor = coalesce(original_amount_minor, amount_minor),
  converted_amount_minor = coalesce(converted_amount_minor, amount_minor),
  fx_rate = coalesce(fx_rate, 1);

alter table public.transactions
  alter column original_amount_minor set not null,
  alter column converted_amount_minor set not null,
  alter column fx_rate set not null;

alter table public.transactions
  drop constraint if exists transactions_shared_participant_chk;
alter table public.transactions
  add constraint transactions_shared_participant_chk
  check (
    shared_participant is null or shared_participant in ('me', 'gf')
  );

create index if not exists transactions_user_updated_idx
  on public.transactions (user_id, updated_at desc);

create or replace function public.transactions_touch_updated_at()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_touch_updated_at_trg on public.transactions;
create trigger transactions_touch_updated_at_trg
  before update on public.transactions
  for each row execute function public.transactions_touch_updated_at();

-- ============================================================
-- savings accounts for multiple explicit savings items
-- ============================================================
create table if not exists public.savings_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  goal_minor   bigint check (goal_minor is null or goal_minor >= 0),
  color        text not null default '#3DD68C',
  icon         text not null default 'piggy-bank-outline',
  created_at   timestamptz not null default now()
);

create index if not exists savings_accounts_user_idx
  on public.savings_accounts (user_id, created_at desc);

alter table public.savings_accounts enable row level security;

drop policy if exists savings_accounts_select_own on public.savings_accounts;
create policy savings_accounts_select_own on public.savings_accounts
  for select using (user_id = auth.uid());

drop policy if exists savings_accounts_insert_own on public.savings_accounts;
create policy savings_accounts_insert_own on public.savings_accounts
  for insert with check (user_id = auth.uid());

drop policy if exists savings_accounts_update_own on public.savings_accounts;
create policy savings_accounts_update_own on public.savings_accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists savings_accounts_delete_own on public.savings_accounts;
create policy savings_accounts_delete_own on public.savings_accounts
  for delete using (user_id = auth.uid());

alter table public.savings_events
  add column if not exists savings_account_id uuid references public.savings_accounts(id) on delete cascade;

create index if not exists savings_events_account_idx
  on public.savings_events (savings_account_id, occurred_on, created_at);

-- ============================================================
-- AI categorization correction memory
-- ============================================================
create table if not exists public.ai_category_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pattern_key   text not null,
  category_id   uuid references public.categories(id) on delete set null,
  is_blocked    boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (user_id, pattern_key)
);

create index if not exists ai_category_rules_user_idx
  on public.ai_category_rules (user_id, updated_at desc);

alter table public.ai_category_rules enable row level security;

drop policy if exists ai_category_rules_select_own on public.ai_category_rules;
create policy ai_category_rules_select_own on public.ai_category_rules
  for select using (user_id = auth.uid());

drop policy if exists ai_category_rules_insert_own on public.ai_category_rules;
create policy ai_category_rules_insert_own on public.ai_category_rules
  for insert with check (user_id = auth.uid());

drop policy if exists ai_category_rules_update_own on public.ai_category_rules;
create policy ai_category_rules_update_own on public.ai_category_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ai_category_rules_delete_own on public.ai_category_rules;
create policy ai_category_rules_delete_own on public.ai_category_rules
  for delete using (user_id = auth.uid());

create or replace function public.ai_category_rules_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_category_rules_touch_updated_at_trg on public.ai_category_rules;
create trigger ai_category_rules_touch_updated_at_trg
  before update on public.ai_category_rules
  for each row execute function public.ai_category_rules_touch_updated_at();
