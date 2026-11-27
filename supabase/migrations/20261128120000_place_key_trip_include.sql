-- Place per shop branch, and purchases added to a trip by hand.

-- The bank text of the branch ("lidl198arhushasle", "mercadona cl del garbi"), so two shops of one chain
-- are placed apart. Filled by the sync function; null on manual rows (they use their name).
alter table public.transactions add column if not exists place_key text;

-- A purchase inside a trip's dates counted in the trip although it looks like home or online ("Count it in the trip").
alter table public.transactions add column if not exists trip_include boolean not null default false;
