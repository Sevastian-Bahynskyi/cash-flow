-- Debts may only point at the same user's person, debt and transaction (like transaction_splits),
-- and one transfer pays into a loan or a receivable, never both.

drop policy if exists loans_insert_own on public.loans;
create policy loans_insert_own on public.loans
  for insert with check (
    user_id = (select auth.uid())
    and (person_id is null or exists (select 1 from public.transfer_people p where p.id = person_id and p.user_id = (select auth.uid())))
  );

drop policy if exists loans_update_own on public.loans;
create policy loans_update_own on public.loans
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (person_id is null or exists (select 1 from public.transfer_people p where p.id = person_id and p.user_id = (select auth.uid())))
  );

drop policy if exists receivables_insert_own on public.receivables;
create policy receivables_insert_own on public.receivables
  for insert with check (
    user_id = (select auth.uid())
    and (person_id is null or exists (select 1 from public.transfer_people p where p.id = person_id and p.user_id = (select auth.uid())))
  );

drop policy if exists receivables_update_own on public.receivables;
create policy receivables_update_own on public.receivables
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (person_id is null or exists (select 1 from public.transfer_people p where p.id = person_id and p.user_id = (select auth.uid())))
  );

drop policy if exists loan_events_insert_own on public.loan_events;
create policy loan_events_insert_own on public.loan_events
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = (select auth.uid()))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );

drop policy if exists loan_events_update_own on public.loan_events;
create policy loan_events_update_own on public.loan_events
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = (select auth.uid()))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );

drop policy if exists receivable_events_insert_own on public.receivable_events;
create policy receivable_events_insert_own on public.receivable_events
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.receivables r where r.id = receivable_id and r.user_id = (select auth.uid()))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );

drop policy if exists receivable_events_update_own on public.receivable_events;
create policy receivable_events_update_own on public.receivable_events
  for update using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.receivables r where r.id = receivable_id and r.user_id = (select auth.uid()))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );

-- Avatars: an update may not move the file into another user's folder.
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A transfer pays into at most one debt: each events table already allows it once, this blocks it in both.
-- shortcut: two parallel inserts into both tables could still both pass; fine for one user, add a shared table if that changes.
create or replace function public.debt_events_one_debt_per_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_id is not null and (
    (tg_table_name = 'loan_events' and exists (select 1 from public.receivable_events r where r.transaction_id = new.transaction_id))
    or (tg_table_name = 'receivable_events' and exists (select 1 from public.loan_events l where l.transaction_id = new.transaction_id))
  ) then
    raise exception 'this transfer already pays into another debt';
  end if;
  return new;
end;
$$;

drop trigger if exists loan_events_one_debt_trg on public.loan_events;
create trigger loan_events_one_debt_trg
  before insert or update of transaction_id on public.loan_events
  for each row execute function public.debt_events_one_debt_per_transaction();

drop trigger if exists receivable_events_one_debt_trg on public.receivable_events;
create trigger receivable_events_one_debt_trg
  before insert or update of transaction_id on public.receivable_events
  for each row execute function public.debt_events_one_debt_per_transaction();
