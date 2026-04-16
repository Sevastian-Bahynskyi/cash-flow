create extension if not exists pg_trgm;

create index if not exists transactions_user_occurred_updated_id_idx
  on public.transactions (user_id, occurred_on desc, updated_at desc, id desc);

create index if not exists transactions_name_trgm_idx
  on public.transactions using gin (lower(name) gin_trgm_ops);

create index if not exists transactions_comment_trgm_idx
  on public.transactions using gin (lower(coalesce(comment, '')) gin_trgm_ops);

create index if not exists categories_name_trgm_idx
  on public.categories using gin (lower(name) gin_trgm_ops);

create or replace function public.transaction_token_matches_text_v1(
  p_token text,
  p_name text,
  p_comment text,
  p_category_name text
)
returns boolean
language sql
immutable
as $$
  select
    lower(coalesce(p_name, '')) like '%' || lower(coalesce(p_token, '')) || '%'
    or lower(coalesce(p_comment, '')) like '%' || lower(coalesce(p_token, '')) || '%'
    or lower(coalesce(p_category_name, '')) like '%' || lower(coalesce(p_token, '')) || '%';
$$;

create or replace function public.transaction_token_matches_date_v1(
  p_token text,
  p_occurred_on date
)
returns boolean
language plpgsql
stable
as $$
declare
  token text := btrim(coalesce(p_token, ''));
  normalized text;
  a int;
  b int;
  c int;
  year_value int;
  first_two int;
  second_two int;
begin
  if token = '' then
    return true;
  end if;

  normalized := regexp_replace(token, '[-/]', '.', 'g');

  if normalized ~ '^\d{4}\.\d{1,2}\.\d{1,2}$' then
    year_value := split_part(normalized, '.', 1)::int;
    a := split_part(normalized, '.', 2)::int;
    b := split_part(normalized, '.', 3)::int;
    return extract(year from p_occurred_on)::int = year_value
      and extract(month from p_occurred_on)::int = a
      and extract(day from p_occurred_on)::int = b;
  end if;

  if normalized ~ '^\d{1,2}\.\d{1,2}\.\d{2,4}$' then
    a := split_part(normalized, '.', 1)::int;
    b := split_part(normalized, '.', 2)::int;
    c := split_part(normalized, '.', 3)::int;
    year_value := case when c < 100 then 2000 + c else c end;

    if a > 12 then
      return extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = b
        and extract(day from p_occurred_on)::int = a;
    elsif b > 12 then
      return extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = a
        and extract(day from p_occurred_on)::int = b;
    else
      return (
        extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = b
        and extract(day from p_occurred_on)::int = a
      ) or (
        extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = a
        and extract(day from p_occurred_on)::int = b
      );
    end if;
  end if;

  if normalized ~ '^\d{1,2}\.\d{1,2}$' then
    a := split_part(normalized, '.', 1)::int;
    b := split_part(normalized, '.', 2)::int;

    if a > 12 then
      return extract(month from p_occurred_on)::int = b
        and extract(day from p_occurred_on)::int = a;
    elsif b > 12 then
      return extract(month from p_occurred_on)::int = a
        and extract(day from p_occurred_on)::int = b;
    else
      return (
        extract(month from p_occurred_on)::int = b
        and extract(day from p_occurred_on)::int = a
      ) or (
        extract(month from p_occurred_on)::int = a
        and extract(day from p_occurred_on)::int = b
      );
    end if;
  end if;

  if normalized ~ '^\d{1,2}\.\d{4}$' then
    a := split_part(normalized, '.', 1)::int;
    year_value := split_part(normalized, '.', 2)::int;
    return extract(year from p_occurred_on)::int = year_value
      and extract(month from p_occurred_on)::int = a;
  end if;

  if normalized ~ '^\d{4}\.\d{1,2}$' then
    year_value := split_part(normalized, '.', 1)::int;
    a := split_part(normalized, '.', 2)::int;
    return extract(year from p_occurred_on)::int = year_value
      and extract(month from p_occurred_on)::int = a;
  end if;

  if token ~ '^\d{4}$' then
    year_value := token::int;
    return extract(year from p_occurred_on)::int = year_value;
  end if;

  if token ~ '^\d{8}$' then
    if token like '19%' or token like '20%' then
      year_value := substring(token from 1 for 4)::int;
      a := substring(token from 5 for 2)::int;
      b := substring(token from 7 for 2)::int;
      return extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = a
        and extract(day from p_occurred_on)::int = b;
    end if;

    a := substring(token from 1 for 2)::int;
    b := substring(token from 3 for 2)::int;
    year_value := substring(token from 5 for 4)::int;
    return extract(year from p_occurred_on)::int = year_value
      and extract(month from p_occurred_on)::int = b
      and extract(day from p_occurred_on)::int = a;
  end if;

  if token ~ '^\d{6}$' then
    first_two := substring(token from 1 for 2)::int;
    second_two := substring(token from 3 for 2)::int;
    year_value := 2000 + substring(token from 5 for 2)::int;

    if first_two > 12 then
      return extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = second_two
        and extract(day from p_occurred_on)::int = first_two;
    elsif second_two > 12 then
      return extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = first_two
        and extract(day from p_occurred_on)::int = second_two;
    else
      return (
        extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = second_two
        and extract(day from p_occurred_on)::int = first_two
      ) or (
        extract(year from p_occurred_on)::int = year_value
        and extract(month from p_occurred_on)::int = first_two
        and extract(day from p_occurred_on)::int = second_two
      );
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.search_transactions_v1(
  p_query text default null,
  p_kind public.transaction_kind default null,
  p_start_on date default null,
  p_end_on_exclusive date default null,
  p_shared_only boolean default false,
  p_include_shared boolean default false,
  p_scoped_category_ids uuid[] default null,
  p_limit int default 20,
  p_offset int default 0
)
returns setof public.transactions
language sql
stable
security invoker
set search_path = public
as $$
  with tokens as (
    select token
    from unnest(regexp_split_to_array(coalesce(nullif(btrim(p_query), ''), ''), '\s+')) as token
    where token <> ''
  )
  select t.*
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and (
      (p_shared_only and (t.shared = true or t.is_shared_topup = true))
      or (not p_shared_only and (p_include_shared or t.shared = false))
    )
    and (p_kind is null or t.kind = p_kind)
    and (p_start_on is null or t.occurred_on >= p_start_on)
    and (p_end_on_exclusive is null or t.occurred_on < p_end_on_exclusive)
    and (
      p_scoped_category_ids is null
      or coalesce(array_length(p_scoped_category_ids, 1), 0) = 0
      or t.category_id = any(p_scoped_category_ids)
    )
    and not exists (
      select 1
      from tokens
      where not (
        public.transaction_token_matches_text_v1(tokens.token, t.name, t.comment, c.name)
        or public.transaction_token_matches_date_v1(tokens.token, t.occurred_on)
      )
    )
  order by t.occurred_on desc, t.updated_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.search_transaction_ids_v1(
  p_query text default null,
  p_kind public.transaction_kind default null,
  p_start_on date default null,
  p_end_on_exclusive date default null,
  p_shared_only boolean default false,
  p_include_shared boolean default false,
  p_scoped_category_ids uuid[] default null
)
returns table (id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with tokens as (
    select token
    from unnest(regexp_split_to_array(coalesce(nullif(btrim(p_query), ''), ''), '\s+')) as token
    where token <> ''
  )
  select t.id
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and (
      (p_shared_only and (t.shared = true or t.is_shared_topup = true))
      or (not p_shared_only and (p_include_shared or t.shared = false))
    )
    and (p_kind is null or t.kind = p_kind)
    and (p_start_on is null or t.occurred_on >= p_start_on)
    and (p_end_on_exclusive is null or t.occurred_on < p_end_on_exclusive)
    and (
      p_scoped_category_ids is null
      or coalesce(array_length(p_scoped_category_ids, 1), 0) = 0
      or t.category_id = any(p_scoped_category_ids)
    )
    and not exists (
      select 1
      from tokens
      where not (
        public.transaction_token_matches_text_v1(tokens.token, t.name, t.comment, c.name)
        or public.transaction_token_matches_date_v1(tokens.token, t.occurred_on)
      )
    )
  order by t.occurred_on desc, t.updated_at desc, t.id desc;
$$;

grant execute on function public.search_transactions_v1(
  text,
  public.transaction_kind,
  date,
  date,
  boolean,
  boolean,
  uuid[],
  int,
  int
) to authenticated;

grant execute on function public.search_transaction_ids_v1(
  text,
  public.transaction_kind,
  date,
  date,
  boolean,
  boolean,
  uuid[]
) to authenticated;
