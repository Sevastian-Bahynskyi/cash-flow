-- Step 4 follow-up: receivable policy and foreign key performance fixes.

create index if not exists receivable_events_user_idx
  on public.receivable_events (user_id);

drop policy if exists receivables_select_own on public.receivables;
create policy receivables_select_own on public.receivables
  for select using (user_id = (select auth.uid()));

drop policy if exists receivables_insert_own on public.receivables;
create policy receivables_insert_own on public.receivables
  for insert with check (user_id = (select auth.uid()));

drop policy if exists receivables_update_own on public.receivables;
create policy receivables_update_own on public.receivables
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists receivables_delete_own on public.receivables;
create policy receivables_delete_own on public.receivables
  for delete using (user_id = (select auth.uid()));

drop policy if exists receivable_events_select_own on public.receivable_events;
create policy receivable_events_select_own on public.receivable_events
  for select using (user_id = (select auth.uid()));

drop policy if exists receivable_events_insert_own on public.receivable_events;
create policy receivable_events_insert_own on public.receivable_events
  for insert with check (user_id = (select auth.uid()));

drop policy if exists receivable_events_update_own on public.receivable_events;
create policy receivable_events_update_own on public.receivable_events
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists receivable_events_delete_own on public.receivable_events;
create policy receivable_events_delete_own on public.receivable_events
  for delete using (user_id = (select auth.uid()));
