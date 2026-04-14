alter table public.transactions
add column if not exists is_neutral_display boolean
generated always as (
  is_shared_topup
  and shared_participant = 'gf'
) stored;