-- Replace the invalid `shapes` icon with the valid Material Community icon.

alter table public.categories
  alter column icon set default 'shape-outline';

update public.categories
set icon = 'shape-outline'
where icon = 'shapes';
