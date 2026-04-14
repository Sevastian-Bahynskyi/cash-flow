alter table public.transactions
add column if not exists personal_effect_minor bigint
generated always as (
  case
    when kind = 'income' then amount_minor
    when shared then 0
    when is_shared_topup and shared_participant = 'gf' then 0
    else -amount_minor
  end
) stored;

alter table public.transactions
add column if not exists shared_effect_minor bigint
generated always as (
  case
    when is_shared_topup then amount_minor
    when shared then -amount_minor
    else 0
  end
) stored;