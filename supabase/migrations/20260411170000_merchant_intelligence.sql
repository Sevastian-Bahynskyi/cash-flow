create extension if not exists pg_trgm;
create extension if not exists unaccent;

alter table public.categories disable trigger categories_protect_system_trg;

do $$
declare
  entertainment_parent uuid;
  health_parent uuid;
  household_parent uuid;
  income_parent uuid;
  other_parent uuid;
  shopping_parent uuid;
begin
  select id into entertainment_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'entertainment'
  limit 1;

  select id into health_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'health'
  limit 1;

  select id into household_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'household'
  limit 1;

  select id into income_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'income'
  limit 1;

  select id into other_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'other'
  limit 1;

  select id into shopping_parent
  from public.categories
  where is_system = true and level = 1 and lower(name) = 'shopping'
  limit 1;

  if entertainment_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = entertainment_parent and lower(name) = 'subscriptions'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Subscriptions', 2, true, entertainment_parent, 'repeat', '#A78BFA');
  end if;

  if income_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = income_parent and lower(name) = 'benefits'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Benefits', 2, true, income_parent, 'school-outline', '#22C55E');
  end if;

  if household_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = household_parent and lower(name) = 'insurance'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Insurance', 2, true, household_parent, 'shield-home-outline', '#F59E0B');
  end if;

  if health_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = health_parent and lower(name) = 'fitness'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Fitness', 2, true, health_parent, 'dumbbell', '#F472B6');
  end if;

  if shopping_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = shopping_parent and lower(name) = 'personal care'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Personal care', 2, true, shopping_parent, 'spray-bottle', '#FB7185');
  end if;

  if other_parent is not null and not exists (
    select 1 from public.categories
    where is_system = true and parent_id = other_parent and lower(name) = 'travel'
  ) then
    insert into public.categories (name, level, is_system, parent_id, icon, color)
    values ('Travel', 2, true, other_parent, 'airplane', '#94A3B8');
  end if;
end $$;

alter table public.categories enable trigger categories_protect_system_trg;

create table if not exists public.merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_target text not null check (match_target in ('normalized_merchant', 'raw_text', 'bank_category', 'sender', 'receiver')),
  match_type text not null check (match_type in ('exact', 'prefix', 'contains', 'regex')),
  pattern text not null,
  kind public.transaction_kind not null,
  canonical_merchant text,
  category_id uuid references public.categories(id),
  is_shared_topup boolean not null default false,
  is_blocked boolean not null default false,
  priority integer not null default 100 check (priority >= 0),
  source text not null default 'manual',
  notes text,
  updated_at timestamptz not null default now(),
  constraint merchant_category_rules_action_check check (is_blocked or category_id is not null)
);

create table if not exists public.merchant_category_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.transaction_kind not null,
  normalized_merchant text not null,
  canonical_merchant text,
  category_id uuid not null references public.categories(id),
  is_shared_topup boolean not null default false,
  observation_count integer not null default 1 check (observation_count > 0),
  support_ratio numeric(5,4) not null default 1 check (support_ratio >= 0 and support_ratio <= 1),
  sample_names jsonb not null default '[]'::jsonb,
  last_seen_on date,
  source text not null default 'app',
  updated_at timestamptz not null default now()
);

create unique index if not exists merchant_category_rules_unique_idx
  on public.merchant_category_rules (user_id, kind, match_target, match_type, pattern);

create unique index if not exists merchant_category_memory_unique_idx
  on public.merchant_category_memory (user_id, kind, normalized_merchant);

create index if not exists merchant_category_rules_lookup_idx
  on public.merchant_category_rules (user_id, priority desc, kind);

create index if not exists merchant_category_memory_lookup_idx
  on public.merchant_category_memory (user_id, kind, normalized_merchant);

create index if not exists merchant_category_memory_trgm_idx
  on public.merchant_category_memory using gin (normalized_merchant gin_trgm_ops);

alter table public.merchant_category_rules enable row level security;
alter table public.merchant_category_memory enable row level security;

drop policy if exists merchant_category_rules_select_own on public.merchant_category_rules;
create policy merchant_category_rules_select_own on public.merchant_category_rules
  for select using (auth.uid() = user_id);

drop policy if exists merchant_category_rules_insert_own on public.merchant_category_rules;
create policy merchant_category_rules_insert_own on public.merchant_category_rules
  for insert with check (auth.uid() = user_id);

drop policy if exists merchant_category_rules_update_own on public.merchant_category_rules;
create policy merchant_category_rules_update_own on public.merchant_category_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists merchant_category_rules_delete_own on public.merchant_category_rules;
create policy merchant_category_rules_delete_own on public.merchant_category_rules
  for delete using (auth.uid() = user_id);

drop policy if exists merchant_category_memory_select_own on public.merchant_category_memory;
create policy merchant_category_memory_select_own on public.merchant_category_memory
  for select using (auth.uid() = user_id);

drop policy if exists merchant_category_memory_insert_own on public.merchant_category_memory;
create policy merchant_category_memory_insert_own on public.merchant_category_memory
  for insert with check (auth.uid() = user_id);

drop policy if exists merchant_category_memory_update_own on public.merchant_category_memory;
create policy merchant_category_memory_update_own on public.merchant_category_memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists merchant_category_memory_delete_own on public.merchant_category_memory;
create policy merchant_category_memory_delete_own on public.merchant_category_memory
  for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists merchant_category_rules_touch_updated_at_trg on public.merchant_category_rules;
create trigger merchant_category_rules_touch_updated_at_trg
  before update on public.merchant_category_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists merchant_category_memory_touch_updated_at_trg on public.merchant_category_memory;
create trigger merchant_category_memory_touch_updated_at_trg
  before update on public.merchant_category_memory
  for each row execute function public.touch_updated_at();

create or replace function public.normalize_rule_value(value text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select trim(
    regexp_replace(
      lower(
        regexp_replace(
          unaccent(coalesce(value, '')),
          '[^a-zA-Z0-9]+',
          ' ',
          'g'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.match_rule_pattern(match_type text, pattern text, value text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when value is null or pattern is null or btrim(pattern) = '' then false
    when match_type = 'exact' then value = pattern
    when match_type = 'prefix' then value like pattern || '%'
    when match_type = 'contains' then value like '%' || pattern || '%'
    when match_type = 'regex' then value ~ pattern
    else false
  end;
$$;

create or replace function public.rank_transaction_category_candidates(
  kind_input public.transaction_kind,
  raw_text_input text,
  normalized_merchant_input text,
  bank_category_input text default null,
  sender_input text default null,
  receiver_input text default null,
  limit_input integer default 8
)
returns table (
  category_id uuid,
  source text,
  confidence double precision,
  normalized_merchant text,
  canonical_merchant text,
  is_shared_topup boolean,
  matched_pattern text,
  similarity double precision,
  observation_count integer,
  support_ratio double precision,
  priority integer
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with inputs as (
    select
      auth.uid() as user_id,
      kind_input as kind,
      public.normalize_rule_value(raw_text_input) as raw_text,
      public.normalize_rule_value(normalized_merchant_input) as normalized_merchant,
      public.normalize_rule_value(bank_category_input) as bank_category,
      public.normalize_rule_value(sender_input) as sender,
      public.normalize_rule_value(receiver_input) as receiver,
      greatest(coalesce(limit_input, 8), 1) as result_limit
  ),
  blocked_matches as (
    select 1
    from inputs
    join public.merchant_category_rules rules
      on rules.user_id = inputs.user_id
     and rules.kind = inputs.kind
     and rules.is_blocked = true
    where public.match_rule_pattern(
      rules.match_type,
      rules.pattern,
      case rules.match_target
        when 'normalized_merchant' then inputs.normalized_merchant
        when 'raw_text' then inputs.raw_text
        when 'bank_category' then inputs.bank_category
        when 'sender' then inputs.sender
        when 'receiver' then inputs.receiver
        else null
      end
    )
    limit 1
  ),
  rule_matches as (
    select
      rules.category_id,
      'rule'::text as source,
      1::double precision as confidence,
      inputs.normalized_merchant as normalized_merchant,
      coalesce(rules.canonical_merchant, inputs.normalized_merchant) as canonical_merchant,
      rules.is_shared_topup,
      rules.pattern as matched_pattern,
      null::double precision as similarity,
      null::integer as observation_count,
      null::double precision as support_ratio,
      rules.priority
    from inputs
    join public.merchant_category_rules rules
      on rules.user_id = inputs.user_id
     and rules.kind = inputs.kind
     and rules.is_blocked = false
    where public.match_rule_pattern(
      rules.match_type,
      rules.pattern,
      case rules.match_target
        when 'normalized_merchant' then inputs.normalized_merchant
        when 'raw_text' then inputs.raw_text
        when 'bank_category' then inputs.bank_category
        when 'sender' then inputs.sender
        when 'receiver' then inputs.receiver
        else null
      end
    )
  ),
  exact_memory as (
    select
      memory.category_id,
      'memory_exact'::text as source,
      least(
        0.99,
        0.78
          + least(memory.observation_count, 12) * 0.012
          + memory.support_ratio::double precision * 0.05
      ) as confidence,
      inputs.normalized_merchant as normalized_merchant,
      coalesce(memory.canonical_merchant, memory.normalized_merchant) as canonical_merchant,
      memory.is_shared_topup,
      memory.normalized_merchant as matched_pattern,
      null::double precision as similarity,
      memory.observation_count,
      memory.support_ratio::double precision,
      0 as priority
    from inputs
    join public.merchant_category_memory memory
      on memory.user_id = inputs.user_id
     and memory.kind = inputs.kind
     and memory.normalized_merchant = inputs.normalized_merchant
  ),
  fuzzy_memory as (
    select
      memory.category_id,
      'memory_fuzzy'::text as source,
      least(
        0.97,
        greatest(
          0.5,
          similarity(memory.normalized_merchant, inputs.normalized_merchant) * 0.68
            + memory.support_ratio::double precision * 0.24
            + least(memory.observation_count, 12) * 0.01
        )
      ) as confidence,
      inputs.normalized_merchant as normalized_merchant,
      coalesce(memory.canonical_merchant, memory.normalized_merchant) as canonical_merchant,
      memory.is_shared_topup,
      memory.normalized_merchant as matched_pattern,
      similarity(memory.normalized_merchant, inputs.normalized_merchant) as similarity,
      memory.observation_count,
      memory.support_ratio::double precision,
      0 as priority
    from inputs
    join public.merchant_category_memory memory
      on memory.user_id = inputs.user_id
     and memory.kind = inputs.kind
    where inputs.normalized_merchant <> ''
      and memory.normalized_merchant <> inputs.normalized_merchant
      and similarity(memory.normalized_merchant, inputs.normalized_merchant) >= 0.6
  ),
  unioned as (
    select * from rule_matches
    union all
    select * from exact_memory
    union all
    select * from fuzzy_memory
  )
  select
    unioned.category_id,
    unioned.source,
    unioned.confidence,
    unioned.normalized_merchant,
    unioned.canonical_merchant,
    unioned.is_shared_topup,
    unioned.matched_pattern,
    unioned.similarity,
    unioned.observation_count,
    unioned.support_ratio,
    unioned.priority
  from unioned
  where not exists (select 1 from blocked_matches)
  order by
    case unioned.source
      when 'rule' then 0
      when 'memory_exact' then 1
      else 2
    end,
    unioned.priority desc,
    unioned.confidence desc,
    unioned.observation_count desc nulls last,
    unioned.similarity desc nulls last
  limit (select result_limit from inputs);
$$;
