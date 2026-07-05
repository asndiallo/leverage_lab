-- =============================================================================
-- Leverage Lab — 0007: set-returning helpers for the UI
-- Two RPC-friendly wrappers so the frontend fetches a whole range / breakdown
-- in one round trip and never re-implements computed logic in JS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- property_cashflow_range — the monthly cash flow for N consecutive months,
-- starting at p_start. Thin generate_series wrapper over property_monthly_cashflow.
-- ---------------------------------------------------------------------------
create or replace function property_cashflow_range(
  p_property_id uuid,
  p_start       date,
  p_months      integer
) returns table (
  month                     date,
  is_projected              boolean,
  is_vacant                 boolean,
  gross_rent_cents          bigint,
  other_income_cents        bigint,
  income_total_cents        bigint,
  debt_service_cents        bigint,
  operating_expense_cents   bigint,
  vacancy_reserve_cents     bigint,
  maintenance_reserve_cents bigint,
  net_cashflow_cents        bigint
)
language sql stable
as $$
  select cf.*
  from generate_series(0, greatest(p_months, 1) - 1) g
  cross join lateral property_monthly_cashflow(
    p_property_id,
    (date_trunc('month', p_start) + (g || ' months')::interval)::date
  ) cf;
$$;

-- ---------------------------------------------------------------------------
-- property_tax_breakdown — per-jurisdiction taxable value and tax for a year.
-- Reuses the exact exemption clamp (flat + percent*base, [min,max]) from
-- property_annual_tax_cents so the UI shows the same numbers the total uses.
-- ---------------------------------------------------------------------------
create or replace function property_tax_breakdown(
  p_property_id uuid,
  p_tax_year    integer
) returns table (
  jurisdiction_id   uuid,
  name              text,
  jurisdiction_type jurisdiction_type,
  rate              numeric,
  base_cents        bigint,
  exemption_cents   bigint,
  taxable_cents     bigint,
  tax_cents         bigint
)
language sql stable
as $$
  with av as (
    select coalesce(capped_assessed_cents, total_assessed_cents) as base_cents
    from assessed_values
    where property_id = p_property_id and tax_year = p_tax_year
    order by (source = 'county_record') desc, recorded_at desc
    limit 1
  ),
  active_ex as (
    select distinct on (e.jurisdiction_id, e.exemption_type)
      e.jurisdiction_id, e.flat_amount_cents, e.percent, e.min_amount_cents, e.max_amount_cents
    from tax_exemptions e
    where e.property_id = p_property_id
      and e.applied = true
      and e.effective_tax_year <= p_tax_year
    order by e.jurisdiction_id, e.exemption_type, e.effective_tax_year desc
  ),
  ex_per_j as (
    select x.jurisdiction_id,
      sum(
        greatest(
          least(
            coalesce(x.flat_amount_cents, 0)
              + round((select base_cents from av) * coalesce(x.percent, 0))::bigint,
            coalesce(x.max_amount_cents, 9223372036854775807)
          ),
          coalesce(x.min_amount_cents, 0)
        )
      ) as exemption_cents
    from active_ex x
    group by x.jurisdiction_id
  )
  select
    j.id,
    j.name,
    j.jurisdiction_type,
    r.rate,
    (select base_cents from av)                                                   as base_cents,
    coalesce(x.exemption_cents, 0)                                                as exemption_cents,
    greatest((select base_cents from av) - coalesce(x.exemption_cents, 0), 0)     as taxable_cents,
    round(greatest((select base_cents from av) - coalesce(x.exemption_cents, 0), 0) * r.rate)::bigint as tax_cents
  from taxing_jurisdictions j
  join tax_rates r on r.jurisdiction_id = j.id and r.tax_year = p_tax_year
  left join ex_per_j x on x.jurisdiction_id = j.id
  where j.property_id = p_property_id
  order by tax_cents desc;
$$;

-- The app calls these (and the 0005 helpers) as `authenticated` via PostgREST.
grant execute on function property_cashflow_range(uuid, date, integer) to authenticated;
grant execute on function property_tax_breakdown(uuid, integer)        to authenticated;
grant execute on function property_monthly_cashflow(uuid, date)        to authenticated;
grant execute on function property_annual_tax_cents(uuid, integer)     to authenticated;
grant execute on function property_tax_basis_cents(uuid)               to authenticated;
