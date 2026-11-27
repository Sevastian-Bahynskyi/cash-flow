-- Merchant logos: which website each merchant name belongs to, and its cached icon.
-- One row per user and merchant (names can be people, so rows stay private).
-- Icons live once per website in the public merchant-logos bucket; a website's icon carries nothing personal.

create table if not exists public.merchant_logos (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null, -- lower(trim(transactions.name))
  domain     text,          -- null: a person, a transfer or no known website
  path       text,          -- object in merchant-logos; null: no usable icon found
  checked_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists merchant_logos_domain_idx on public.merchant_logos (domain) where path is not null;

alter table public.merchant_logos enable row level security;

drop policy if exists merchant_logos_select_own on public.merchant_logos;
create policy merchant_logos_select_own on public.merchant_logos
  for select using (user_id = (select auth.uid()));
-- Only the sync function (service role) writes.

insert into storage.buckets (id, name, public)
values ('merchant-logos', 'merchant-logos', true)
on conflict (id) do update set public = true;
