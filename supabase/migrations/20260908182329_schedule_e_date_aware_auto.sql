-- =============================================================================
-- Leverage Lab — 0012: date-aware auto rental-use % (was a lifetime max)
-- =============================================================================
-- 0011's property_auto_rental_use_percent counted a unit_identifier as
-- "leased" if it EVER had a lease, ignoring lease_end entirely — so a room
-- whose lease ended and was never re-let would keep counting forever. Leases
-- already say exactly which room, from when to when (lease_start/lease_end);
-- the auto fraction should actually use that range, evaluated per month, the
-- same way property_monthly_cashflow already determines lease coverage.
--
-- property_auto_rental_use_percent now takes p_asof and only counts leases
-- whose date range covers that day. property_rental_use_percent_for_year and
-- property_current_rental_use_percent both move to a single per-month
-- resolver (manual-if-any-else-auto) so the year average and the "current"
-- display use identical logic instead of two hand-maintained copies.
-- =============================================================================

-- Old signature (single uuid arg) is being replaced by a 2-arg one with a
-- default — CREATE OR REPLACE would treat that as a new overload rather than
-- replacing it (return type AND arg list must match), leaving the stale
-- 1-arg version in place and making plain `foo(id)` calls ambiguous between
-- the two. Drop it explicitly first.
drop function if exists property_auto_rental_use_percent(uuid);

-- ---------------------------------------------------------------------------
-- property_auto_rental_use_percent — rental-use fraction AS OF p_asof, from
-- leases whose [lease_start, lease_end] actually covers that day. Deliberately
-- NOT filtered by lease status (unlike property_monthly_cashflow's projection
-- logic) — status is a current-lifecycle marker ("I've since marked this
-- lease ended"), not a historical validity flag, and this function is asked
-- about arbitrary past dates (e.g. a 2026 Schedule E run in 2027, by which
-- point every one of that year's leases is long since marked 'ended'). Only
-- the date range decides whether a room counts as rented on a given day.
-- Room-count based when property_settings.total_rooms is set; otherwise 100%
-- while any lease covers asof, 0% once placed in service but nothing
-- currently covers asof (a room whose lease ended and hasn't been re-let
-- stops counting). Null before the property was ever placed in service.
-- ---------------------------------------------------------------------------
create or replace function property_auto_rental_use_percent(
  p_property_id uuid,
  p_asof        date default current_date
) returns numeric
language sql stable
as $$
  with rooms as (
    select total_rooms from property_settings where property_id = p_property_id
  ),
  covering as (
    select count(distinct unit_identifier) as n
    from leases
    where property_id = p_property_id
      and lease_start <= p_asof
      and (lease_end is null or lease_end >= p_asof)
  ),
  ever_placed as (
    select exists(
      select 1 from leases
      where property_id = p_property_id and lease_start <= p_asof
    ) as v
  )
  select case
    when not (select v from ever_placed) then null
    when (select total_rooms from rooms) is not null and (select total_rooms from rooms) > 0
      then least(1, (select n from covering)::numeric / (select total_rooms from rooms))
    else least(1, (select n from covering)::numeric)  -- 1.0 while covered, 0 while vacant
  end;
$$;

-- ---------------------------------------------------------------------------
-- property_rental_use_percent_for_year / property_current_rental_use_percent
-- — both now delegate to the SAME per-day resolver (manual override wins
-- entirely if any rental_use_periods row exists for the property; else the
-- date-aware auto fraction above), instead of each hand-rolling their own
-- manual-vs-auto branch.
-- ---------------------------------------------------------------------------
create or replace function property_effective_rental_use_percent(
  p_property_id uuid,
  p_asof        date default current_date
) returns numeric
language sql stable
as $$
  with manual_exists as (
    select exists(select 1 from rental_use_periods where property_id = p_property_id) as v
  ),
  manual as (
    select rental_use_percent
    from rental_use_periods
    where property_id = p_property_id and effective_date <= p_asof
    order by effective_date desc
    limit 1
  )
  select case
    when (select v from manual_exists) then (select rental_use_percent from manual)
    else property_auto_rental_use_percent(p_property_id, p_asof)
  end;
$$;

create or replace function property_rental_use_percent_for_year(
  p_property_id uuid,
  p_tax_year    integer
) returns numeric
language sql stable
as $$
  with months as (
    select (make_date(p_tax_year, 1, 1) + (g || ' months')::interval)::date as m_start
    from generate_series(0, 11) g
  ),
  monthly as (
    select property_effective_rental_use_percent(
      p_property_id, (m.m_start + interval '1 month - 1 day')::date
    ) as pct
    from months m
  )
  select avg(pct) from monthly where pct is not null;
$$;

create or replace function property_current_rental_use_percent(
  p_property_id uuid,
  p_asof        date default current_date
) returns numeric
language sql stable
as $$
  select property_effective_rental_use_percent(p_property_id, p_asof);
$$;

grant execute on function property_effective_rental_use_percent(uuid, date) to authenticated;
grant execute on function property_auto_rental_use_percent(uuid, date)      to authenticated;
