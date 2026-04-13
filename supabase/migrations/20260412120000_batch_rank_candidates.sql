create or replace function public.rank_transaction_category_candidates_batch(
  inputs_json jsonb,
  limit_input integer default 6
)
returns table (
  input_id text,
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
  with current_user_id as (
    select auth.uid() as uid
  ),
  raw_inputs as (
    select
      r.id,
      r.kind::public.transaction_kind as kind,
      public.normalize_rule_value(r.raw_text) as raw_text,
      public.normalize_rule_value(r.normalized_merchant) as normalized_merchant,
      public.normalize_rule_value(r.bank_category) as bank_category,
      public.normalize_rule_value(r.sender) as sender,
      public.normalize_rule_value(r.receiver) as receiver
    from jsonb_to_recordset(inputs_json) as r(
      id text,
      kind text,
      raw_text text,
      normalized_merchant text,
      bank_category text,
      sender text,
      receiver text
    )
  ),
  per_input_blocked as (
    select distinct ri.id as input_id
    from raw_inputs ri
    cross join current_user_id cu
    join public.merchant_category_rules rules
      on rules.user_id = cu.uid
     and rules.kind = ri.kind
     and rules.is_blocked = true
    where public.match_rule_pattern(
      rules.match_type,
      rules.pattern,
      case rules.match_target
        when 'normalized_merchant' then ri.normalized_merchant
        when 'raw_text' then ri.raw_text
        when 'bank_category' then ri.bank_category
        when 'sender' then ri.sender
        when 'receiver' then ri.receiver
        else null
      end
    )
  ),
  rule_matches as (
    select
      ri.id as input_id,
      rules.category_id,
      'rule'::text as source,
      1::double precision as confidence,
      ri.normalized_merchant as normalized_merchant,
      coalesce(rules.canonical_merchant, ri.normalized_merchant) as canonical_merchant,
      rules.is_shared_topup,
      rules.pattern as matched_pattern,
      null::double precision as similarity,
      null::integer as observation_count,
      null::double precision as support_ratio,
      rules.priority
    from raw_inputs ri
    cross join current_user_id cu
    join public.merchant_category_rules rules
      on rules.user_id = cu.uid
     and rules.kind = ri.kind
     and rules.is_blocked = false
    where ri.id not in (select input_id from per_input_blocked)
      and public.match_rule_pattern(
        rules.match_type,
        rules.pattern,
        case rules.match_target
          when 'normalized_merchant' then ri.normalized_merchant
          when 'raw_text' then ri.raw_text
          when 'bank_category' then ri.bank_category
          when 'sender' then ri.sender
          when 'receiver' then ri.receiver
          else null
        end
      )
  ),
  exact_memory as (
    select
      ri.id as input_id,
      memory.category_id,
      'memory_exact'::text as source,
      least(
        0.99,
        0.78
          + least(memory.observation_count, 12) * 0.012
          + memory.support_ratio::double precision * 0.05
      ) as confidence,
      ri.normalized_merchant as normalized_merchant,
      coalesce(memory.canonical_merchant, memory.normalized_merchant) as canonical_merchant,
      memory.is_shared_topup,
      memory.normalized_merchant as matched_pattern,
      null::double precision as similarity,
      memory.observation_count,
      memory.support_ratio::double precision as support_ratio,
      0 as priority
    from raw_inputs ri
    cross join current_user_id cu
    join public.merchant_category_memory memory
      on memory.user_id = cu.uid
     and memory.kind = ri.kind
     and memory.normalized_merchant = ri.normalized_merchant
    where ri.id not in (select input_id from per_input_blocked)
  ),
  fuzzy_memory as (
    select
      ri.id as input_id,
      memory.category_id,
      'memory_fuzzy'::text as source,
      least(
        0.97,
        greatest(
          0.5,
          similarity(memory.normalized_merchant, ri.normalized_merchant) * 0.68
            + memory.support_ratio::double precision * 0.24
            + least(memory.observation_count, 12) * 0.01
        )
      ) as confidence,
      ri.normalized_merchant as normalized_merchant,
      coalesce(memory.canonical_merchant, memory.normalized_merchant) as canonical_merchant,
      memory.is_shared_topup,
      memory.normalized_merchant as matched_pattern,
      similarity(memory.normalized_merchant, ri.normalized_merchant) as similarity,
      memory.observation_count,
      memory.support_ratio::double precision as support_ratio,
      0 as priority
    from raw_inputs ri
    cross join current_user_id cu
    join public.merchant_category_memory memory
      on memory.user_id = cu.uid
     and memory.kind = ri.kind
    where ri.id not in (select input_id from per_input_blocked)
      and ri.normalized_merchant <> ''
      and memory.normalized_merchant <> ri.normalized_merchant
      and similarity(memory.normalized_merchant, ri.normalized_merchant) >= 0.6
  ),
  unioned as (
    select * from rule_matches
    union all
    select * from exact_memory
    union all
    select * from fuzzy_memory
  ),
  ranked as (
    select
      unioned.*,
      row_number() over (
        partition by unioned.input_id
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
      ) as rn
    from unioned
  )
  select
    ranked.input_id,
    ranked.category_id,
    ranked.source,
    ranked.confidence,
    ranked.normalized_merchant,
    ranked.canonical_merchant,
    ranked.is_shared_topup,
    ranked.matched_pattern,
    ranked.similarity,
    ranked.observation_count,
    ranked.support_ratio,
    ranked.priority
  from ranked
  where ranked.rn <= greatest(coalesce(limit_input, 6), 1);
$$;
