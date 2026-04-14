alter table public.budget_change_events
  drop constraint if exists budget_change_events_budget_id_fkey;

-- Keep budget_id as historical reference only.
-- Delete events are written after the budget row is removed, so a live FK would fail.