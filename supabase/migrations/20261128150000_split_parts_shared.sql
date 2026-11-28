-- Each split-off part of a purchase is yours or shared with the partner; the rest keeps the purchase's own `shared`.
alter table public.transaction_splits add column if not exists shared boolean not null default false;
-- Parts made before this inherited the purchase's whose, so they keep counting the same.
update public.transaction_splits s set shared = t.shared from public.transactions t where t.id = s.transaction_id and s.shared is distinct from t.shared;
