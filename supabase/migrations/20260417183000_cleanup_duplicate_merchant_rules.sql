-- Remove duplicate and low-value manual rules to keep merchant rule set clean.

with duplicate_revolut as (
  select id
  from public.merchant_category_rules
  where lower(pattern) = 'revolut'
    and source = 'bootstrap_history'
  order by updated_at desc
  limit 1
), duplicate_transfergo as (
  select id
  from public.merchant_category_rules
  where lower(pattern) = 'transfergo'
    and source = 'bootstrap_curated'
  order by updated_at desc
  offset 1 limit 1
), duplicate_temu as (
  select id
  from public.merchant_category_rules
  where lower(pattern) = 'temu'
    and source = 'bootstrap_curated'
  order by updated_at desc
  offset 1 limit 1
), duplicate_zalando as (
  select id
  from public.merchant_category_rules
  where lower(pattern) = 'zalando'
    and source = 'bootstrap_curated'
  order by updated_at desc
  offset 1 limit 1
)
delete from public.merchant_category_rules
where id in (
  select id from duplicate_revolut
  union all
  select id from duplicate_transfergo
  union all
  select id from duplicate_temu
  union all
  select id from duplicate_zalando
)
or lower(pattern) in ('normal', 'ok', 'claude', 'interest');
