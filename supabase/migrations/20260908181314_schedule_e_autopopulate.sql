-- =============================================================================
-- Leverage Lab — 0011: Schedule E auto-population from leases/transactions/utilities
-- =============================================================================
-- 0010 required a manual rental_use_periods entry for EVERY property, even a
-- pure rental with no house-hack split at all. That duplicates data the app
-- already has: leases already say which units are rented and since when, and
-- escrow_schedules/utility_accounts already carry estimated insurance/HOA/
-- utility costs for months you haven't logged a discrete transaction for.
--
-- New rule, in priority order, wherever this migration touches rental-use %:
--   1. Any rental_use_periods row exists for the property -> manual wins,
--      entirely (existing 0010 versioned behavior, unchanged).
--   2. Otherwise -> auto-computed from leases (+ property_settings.total_rooms
--      if you've set it): a constant fraction (physical layout doesn't change
--      month to month just because a room sits vacant between tenants), active
--      from the earliest lease_start on. Zero manual setup for a pure rental.
-- Expense fallback rule (insurance/HOA/utilities only): actual transactions
-- for the year if any exist, else escrow_schedules/utility_accounts estimates
-- x12 — same "actuals win, else compute" rule property_monthly_cashflow
-- already uses for debt service.
-- =============================================================================

alter table property_settings
  add column total_rooms integer check (total_rooms is null or total_rooms > 0);

-- ---------------------------------------------------------------------------
-- property_auto_placed_in_service — earliest lease_start ever logged for the
-- property (any status): the day the property (or its first rented room)
-- was placed in service as a rental. Null if no leases exist yet.
-- ---------------------------------------------------------------------------
create or replace function property_auto_placed_in_service(p_property_id uuid)
returns date
language sql stable
as $$
  select min(lease_start) from leases where property_id = p_property_id;
$$;

-- ---------------------------------------------------------------------------
-- property_auto_rental_use_percent — constant rental-use fraction derived
-- from leases, ignoring any manual rental_use_periods override (callers
-- decide whether manual takes priority). Room-count based when
-- property_settings.total_rooms is set (distinct unit_identifiers ever
-- leased / total_rooms, clamped at 100%); otherwise a pure-rental default of
-- 100% whenever at least one lease has ever existed. Null when there has
-- never been a lease at all (nothing to derive from).
-- ---------------------------------------------------------------------------
create or replace function property_auto_rental_use_percent(p_property_id uuid)
returns numeric
language sql stable
as $$
  with rooms as (
    select total_rooms from property_settings where property_id = p_property_id
  ),
  leased as (
    select count(distinct unit_identifier) as n
    from leases
    where property_id = p_property_id
  )
  select case
    when (select n from leased) = 0 then null
    when (select total_rooms from rooms) is not null and (select total_rooms from rooms) > 0
      then least(1, (select n from leased)::numeric / (select total_rooms from rooms))
    else 1.0
  end;
$$;

-- ---------------------------------------------------------------------------
-- property_rental_use_percent_for_year — manual (versioned, existing 0010
-- behavior) when any rental_use_periods row exists; otherwise the auto
-- constant fraction, active for any tax year on/after the auto-derived
-- placed-in-service year. Null (not configured) before that, or when the
-- property has never had a lease.
-- ---------------------------------------------------------------------------
create or replace function property_rental_use_percent_for_year(
  p_property_id uuid,
  p_tax_year    integer
) returns numeric
language sql stable
as $$
  with manual_exists as (
    select exists(select 1 from rental_use_periods where property_id = p_property_id) as v
  ),
  months as (
    select (make_date(p_tax_year, 1, 1) + (g || ' months')::interval)::date as m_start
    from generate_series(0, 11) g
  ),
  monthly as (
    select (
      select rp.rental_use_percent
      from rental_use_periods rp
      where rp.property_id = p_property_id
        and rp.effective_date <= (m.m_start + interval '1 month - 1 day')::date
      order by rp.effective_date desc
      limit 1
    ) as pct
    from months m
  ),
  manual_avg as (
    select avg(pct) as v from monthly where pct is not null
  ),
  auto as (
    select
      property_auto_rental_use_percent(p_property_id) as pct,
      extract(year from property_auto_placed_in_service(p_property_id))::integer as placed_year
  )
  select case
    when (select v from manual_exists) then (select v from manual_avg)
    when (select placed_year from auto) is not null and p_tax_year >= (select placed_year from auto)
      then (select pct from auto)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- property_current_rental_use_percent — same manual-else-auto priority as
-- above, for a single point in time (UI "current %" display). Distinct from
-- 0010's property_current_rental_use, which only ever looks at manual rows
-- and returns the whole row (still used when you want the method/notes of a
-- specific manual entry) — this one always resolves to a number.
-- ---------------------------------------------------------------------------
create or replace function property_current_rental_use_percent(
  p_property_id uuid,
  p_asof        date default current_date
) returns numeric
language sql stable
as $$
  with manual as (
    select rental_use_percent
    from rental_use_periods
    where property_id = p_property_id and effective_date <= p_asof
    order by effective_date desc
    limit 1
  ),
  manual_exists as (
    select exists(select 1 from rental_use_periods where property_id = p_property_id) as v
  ),
  auto as (
    select
      property_auto_rental_use_percent(p_property_id) as pct,
      property_auto_placed_in_service(p_property_id) as placed
  )
  select case
    when (select v from manual_exists) then (select rental_use_percent from manual)
    when (select placed from auto) is not null and p_asof >= (select placed from auto)
      then (select pct from auto)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- property_annual_depreciation_cents — placed-in-service date now falls back
-- to property_auto_placed_in_service() when no manual rental_use_periods row
-- exists, instead of requiring one just to unlock depreciation.
-- ---------------------------------------------------------------------------
create or replace function property_annual_depreciation_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns bigint
language sql stable
as $$
  with rental_pct as (
    select property_rental_use_percent_for_year(p_property_id, p_tax_year) as pct
  ),
  placed_in_service as (
    select coalesce(
      (select min(effective_date) from rental_use_periods where property_id = p_property_id),
      property_auto_placed_in_service(p_property_id)
    ) as d
  ),
  building as (
    select depreciation_asset_year_cents(
      property_building_basis_cents(p_property_id),
      (select d from placed_in_service),
      p_tax_year
    ) as cents
  ),
  improvements as (
    select coalesce(sum(
      depreciation_asset_year_cents(t.amount_cents, t.txn_date, p_tax_year)
    ), 0) as cents
    from transactions t
    join transaction_categories c on c.code = t.category
    where t.property_id = p_property_id
      and c.category_group = 'capital_improvement'
  )
  select case
    when (select pct from rental_pct) is null
      or (select d from placed_in_service) is null
      or property_building_basis_cents(p_property_id) is null
      then null
    else round(
      ((select cents from building) + (select cents from improvements))
      * (select pct from rental_pct)
    )::bigint
  end;
$$;

-- ---------------------------------------------------------------------------
-- HOA dues get their own schedule_e_line ('hoa', still reported under the
-- IRS "Other" line in the UI) so property_schedule_e can give it the same
-- actual-else-escrow-estimate fallback as insurance/utilities below, without
-- pulling in other_operating (which has no natural fallback source).
-- ---------------------------------------------------------------------------
update transaction_categories set schedule_e_line = 'hoa' where code = 'hoa_dues';

-- ---------------------------------------------------------------------------
-- property_annual_insurance_cents / _hoa_cents / _utilities_cents — actual
-- transactions for the year when any exist, else an estimate x12: escrow's
-- current-as-of-year-end monthly amount for insurance/HOA, or the sum of
-- utility_accounts.monthly_avg_cents for utilities. `is_actual` lets the
-- report tell the UI which source it used.
-- ---------------------------------------------------------------------------
create or replace function property_annual_insurance_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns table (amount_cents bigint, is_actual boolean)
language sql stable
as $$
  with bounds as (
    select make_date(p_tax_year, 1, 1) as y_start, make_date(p_tax_year, 12, 31) as y_end
  ),
  actual as (
    select coalesce(sum(t.amount_cents), 0) as cents
    from transactions t
    where t.property_id = p_property_id
      and t.category = 'insurance'
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
  ),
  esc as (
    select monthly_insurance_escrow_cents
    from property_current_escrow(p_property_id, (select y_end from bounds))
  )
  select
    case when (select cents from actual) > 0 then (select cents from actual)
      else coalesce((select monthly_insurance_escrow_cents from esc), 0) * 12
    end,
    (select cents from actual) > 0;
$$;

create or replace function property_annual_hoa_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns table (amount_cents bigint, is_actual boolean)
language sql stable
as $$
  with bounds as (
    select make_date(p_tax_year, 1, 1) as y_start, make_date(p_tax_year, 12, 31) as y_end
  ),
  actual as (
    select coalesce(sum(t.amount_cents), 0) as cents
    from transactions t
    where t.property_id = p_property_id
      and t.category = 'hoa_dues'
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
  ),
  esc as (
    select monthly_hoa_cents
    from property_current_escrow(p_property_id, (select y_end from bounds))
  )
  select
    case when (select cents from actual) > 0 then (select cents from actual)
      else coalesce((select monthly_hoa_cents from esc), 0) * 12
    end,
    (select cents from actual) > 0;
$$;

create or replace function property_annual_utilities_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns table (amount_cents bigint, is_actual boolean)
language sql stable
as $$
  with bounds as (
    select make_date(p_tax_year, 1, 1) as y_start, make_date(p_tax_year, 12, 31) as y_end
  ),
  actual as (
    select coalesce(sum(t.amount_cents), 0) as cents
    from transactions t
    where t.property_id = p_property_id
      and t.category in ('utilities_electric', 'utilities_water', 'utilities_internet')
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
  ),
  est as (
    select coalesce(sum(monthly_avg_cents), 0) as cents
    from utility_accounts
    where property_id = p_property_id
  )
  select
    case when (select cents from actual) > 0 then (select cents from actual)
      else (select cents from est) * 12
    end,
    (select cents from actual) > 0;
$$;

-- ---------------------------------------------------------------------------
-- property_schedule_e — insurance/hoa/utilities now come from the dedicated
-- actual-else-estimate functions above instead of the generic transactions
-- grouping, so they always appear (like taxes) and can report 'computed' as
-- a source when falling back to an escrow/utility-account estimate. The
-- generic 'operating' grouping keeps only the categories with no fallback
-- source (repairs, supplies, management_fees, other).
-- ---------------------------------------------------------------------------
create or replace function property_schedule_e(
  p_property_id uuid,
  p_tax_year    integer
) returns table (
  line_code    text,
  label        text,
  amount_cents bigint,
  is_prorated  boolean,
  source       text
)
language sql stable
as $$
  with bounds as (
    select make_date(p_tax_year, 1, 1) as y_start, make_date(p_tax_year, 12, 31) as y_end
  ),
  pct as (
    select property_rental_use_percent_for_year(p_property_id, p_tax_year) as v
  ),
  income as (
    select
      'rents_received'::text as line_code,
      'Rents received'::text as label,
      coalesce(sum(t.amount_cents), 0)::bigint as amount_cents,
      false as is_prorated,
      'actual'::text as source
    from transactions t
    join transaction_categories c on c.code = t.category
    where t.property_id = p_property_id
      and c.category_group = 'income'
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
  ),
  operating as (
    select
      c.schedule_e_line as line_code,
      initcap(replace(c.schedule_e_line, '_', ' ')) as label,
      round(sum(
        case when c.prorate_by_rental_use
          then t.amount_cents * coalesce((select v from pct), 1)
          else t.amount_cents::numeric
        end
      ))::bigint as amount_cents,
      bool_or(c.prorate_by_rental_use) as is_prorated,
      case
        when bool_or(c.prorate_by_rental_use) and (select v from pct) is null
          then 'not_configured'
        else 'actual'
      end as source
    from transactions t
    join transaction_categories c on c.code = t.category
    where t.property_id = p_property_id
      and c.schedule_e_line is not null
      and c.schedule_e_line not in ('insurance', 'hoa', 'utilities')
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
    group by c.schedule_e_line
  ),
  interest as (
    select
      'mortgage_interest'::text as line_code,
      'Mortgage interest paid to banks, etc.'::text as label,
      round(
        property_annual_interest_paid_cents(p_property_id, p_tax_year)
        * coalesce((select v from pct), 1)
      )::bigint as amount_cents,
      true as is_prorated,
      case when (select v from pct) is null then 'not_configured' else 'computed' end as source
  ),
  taxes as (
    select
      'taxes'::text as line_code,
      'Taxes'::text as label,
      round(
        property_annual_tax_cents(p_property_id, p_tax_year)
        * coalesce((select v from pct), 1)
      )::bigint as amount_cents,
      true as is_prorated,
      case when (select v from pct) is null then 'not_configured' else 'computed' end as source
  ),
  insurance_line as (
    select
      'insurance'::text as line_code,
      'Insurance'::text as label,
      round(ins.amount_cents * coalesce((select v from pct), 1))::bigint as amount_cents,
      true as is_prorated,
      case
        when (select v from pct) is null then 'not_configured'
        when ins.is_actual then 'actual'
        else 'computed'
      end as source
    from property_annual_insurance_cents(p_property_id, p_tax_year) ins
  ),
  hoa_line as (
    select
      'hoa'::text as line_code,
      'HOA dues'::text as label,
      round(hoa.amount_cents * coalesce((select v from pct), 1))::bigint as amount_cents,
      true as is_prorated,
      case
        when (select v from pct) is null then 'not_configured'
        when hoa.is_actual then 'actual'
        else 'computed'
      end as source
    from property_annual_hoa_cents(p_property_id, p_tax_year) hoa
  ),
  utilities_line as (
    select
      'utilities'::text as line_code,
      'Utilities'::text as label,
      round(u.amount_cents * coalesce((select v from pct), 1))::bigint as amount_cents,
      true as is_prorated,
      case
        when (select v from pct) is null then 'not_configured'
        when u.is_actual then 'actual'
        else 'computed'
      end as source
    from property_annual_utilities_cents(p_property_id, p_tax_year) u
  ),
  depreciation as (
    select
      'depreciation'::text as line_code,
      'Depreciation expense'::text as label,
      coalesce(d.v, 0)::bigint as amount_cents,
      true as is_prorated,
      case when d.v is null then 'not_configured' else 'computed' end as source
    from (select property_annual_depreciation_cents(p_property_id, p_tax_year) as v) d
  )
  select * from income
  union all
  select * from operating
  union all
  select * from interest
  union all
  select * from taxes
  union all
  select * from insurance_line
  union all
  select * from hoa_line
  union all
  select * from utilities_line
  union all
  select * from depreciation;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function property_auto_placed_in_service(uuid)              to authenticated;
grant execute on function property_auto_rental_use_percent(uuid)             to authenticated;
grant execute on function property_current_rental_use_percent(uuid, date)    to authenticated;
grant execute on function property_annual_insurance_cents(uuid, integer)     to authenticated;
grant execute on function property_annual_hoa_cents(uuid, integer)           to authenticated;
grant execute on function property_annual_utilities_cents(uuid, integer)     to authenticated;
