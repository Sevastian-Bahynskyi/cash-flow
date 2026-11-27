-- Debts tied to people and bank transfers, trips, and where merchants are.

-- Debts: the existing loans (you owe) and receivables (they owe you) get a person,
-- and each payment can be a bank transfer. A transfer pays into at most one debt.
alter table public.loans add column if not exists person_id uuid references public.transfer_people(id) on delete set null;
alter table public.receivables add column if not exists person_id uuid references public.transfer_people(id) on delete set null;
alter table public.loan_events add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
alter table public.receivable_events add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
create unique index if not exists loan_events_transaction_uq on public.loan_events (transaction_id) where transaction_id is not null;
create unique index if not exists receivable_events_transaction_uq on public.receivable_events (transaction_id) where transaction_id is not null;

-- Money to and from family no longer waits in the Inbox: it is just moved unless the owner adds it to a debt.
update public.transactions set needs_review = false where needs_review and reason_source = 'person';

-- Trips: while one runs, purchases abroad count in the Travel categories. end_on null = still travelling.
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  country_iso text,          -- null or 'DK': a trip inside Denmark, every purchase in it counts
  start_on    date not null,
  end_on      date,
  created_at  timestamptz not null default now(),
  constraint trips_dates_chk check (end_on is null or end_on >= start_on)
);
create index if not exists trips_user_idx on public.trips (user_id, start_on desc);

alter table public.trips enable row level security;
drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips for select using (user_id = (select auth.uid()));
drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own on public.trips for insert with check (user_id = (select auth.uid()));
drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips for delete using (user_id = (select auth.uid()));

-- One purchase can be left out of a trip ("Not part of the trip").
alter table public.transactions add column if not exists trip_exclude boolean not null default false;

-- Where a merchant is: one row per user and merchant (key = lower(trim(merchant_key or name))).
-- Filled by the sync function; lat/lng is the city centre, or the country's when the city is unknown.
create table if not exists public.merchant_places (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  country_iso text,          -- null: online or unknown
  city        text,
  lat         double precision,
  lng         double precision,
  online      boolean not null default false,
  checked_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.merchant_places enable row level security;
drop policy if exists merchant_places_select_own on public.merchant_places;
create policy merchant_places_select_own on public.merchant_places for select using (user_id = (select auth.uid()));
-- Only the sync function (service role) writes.
