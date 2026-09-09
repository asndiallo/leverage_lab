-- =============================================================================
-- Leverage Lab — 0013: fix mortgage-interest line always reporting 'computed'
-- =============================================================================
-- property_schedule_e's `interest` CTE hardcoded source to 'computed'
-- whenever rental-use % was configured, even when
-- property_annual_interest_paid_cents() actually used a real
-- interest_payment transaction for the year (it prefers actuals, falling
-- back to amortization — see 0010) — so a logged mortgage payment never
-- showed as 'actual' in the report. Fixed by checking directly whether any
-- interest_payment transaction exists for the year, same as every other
-- actual-vs-computed line already does.
-- =============================================================================

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
      case
        when (select v from pct) is null then 'not_configured'
        when exists (
          select 1 from transactions t
          where t.property_id = p_property_id
            and t.category = 'interest_payment'
            and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
        ) then 'actual'
        else 'computed'
      end as source
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
