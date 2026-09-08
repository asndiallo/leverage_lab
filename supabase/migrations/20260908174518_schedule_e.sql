-- =============================================================================
-- Leverage Lab — 0010: Schedule E readiness (house-hack rental-use allocation,
-- depreciation, and the Schedule E rollup itself)
-- =============================================================================
-- A house hack is PART personal residence, part rental — Schedule E only lets
-- you deduct the rental share of costs that serve the whole property (mortgage
-- interest, property tax, insurance, HOA, shared utilities/repairs). This
-- migration adds:
--   rental_use_periods    — the % of the property that's a rental, versioned
--                            (changes when you add/lose a roommate or move out)
--   transaction_categories — two new columns so an existing operating-expense
--                            category knows its Schedule E line + whether it
--                            gets prorated by rental-use %
--   depreciation_asset_year_cents / property_annual_depreciation_cents —
--                            27.5-yr straight-line, mid-month convention, on
--                            the building's rental-use share of basis
--   property_annual_interest_paid_cents — actual 1098-style transactions when
--                            tracked, else computed from loan amortization
--   property_schedule_e   — the report: one row per Schedule E line, already
--                            prorated, tagged with where the number came from
-- As with the rest of this schema (see 0005's header), these are a reference
-- implementation, not tax advice — validate against your actual return.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rental_use_periods — versioned rental-use % (like escrow_schedules). The
-- EARLIEST row's effective_date doubles as the building's depreciation
-- "placed in service" date: the day the property (or first room of it) first
-- became a rental, which is when 27.5-yr depreciation starts under IRS rules.
-- method is advisory (how you arrived at the %, e.g. "3 of 4 bedrooms" or
-- "1,850 / 2,400 sqft") — the engine only uses rental_use_percent itself.
-- ---------------------------------------------------------------------------
create type rental_use_method as enum ('square_footage', 'room_count', 'other');

create table rental_use_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  effective_date     date not null,
  rental_use_percent numeric(5,4) not null
    check (rental_use_percent >= 0 and rental_use_percent <= 1),
  method              rental_use_method not null default 'square_footage',

  notes         text,                              -- e.g. "3 of 4 bedrooms rented, 1,850/2,400 sqft"
  created_at    timestamptz not null default now(),

  unique (property_id, effective_date)
);
create index rental_use_property_idx on rental_use_periods(property_id, effective_date desc);
create index rental_use_user_idx on rental_use_periods(user_id);

alter table rental_use_periods enable row level security;
alter table rental_use_periods force row level security;
create policy rental_use_periods_select on rental_use_periods
  for select using (is_property_member(property_id));
create policy rental_use_periods_insert on rental_use_periods
  for insert with check (is_property_member(property_id));
create policy rental_use_periods_update on rental_use_periods
  for update using (is_property_member(property_id)) with check (is_property_member(property_id));
create policy rental_use_periods_delete on rental_use_periods
  for delete using (is_property_member(property_id));

-- ---------------------------------------------------------------------------
-- property_current_rental_use — effective rental-use row for a given date,
-- same "latest effective_date <= asof" shape as property_current_escrow (0005).
-- ---------------------------------------------------------------------------
create or replace function property_current_rental_use(
  p_property_id uuid,
  p_asof        date default current_date
) returns rental_use_periods
language sql stable
as $$
  select *
  from rental_use_periods
  where property_id = p_property_id
    and effective_date <= p_asof
  order by effective_date desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- property_rental_use_percent_for_year — time-weighted rental-use % for a
-- calendar year: the average of the 12 monthly "current" values (same
-- month-granularity the cashflow engine already uses). Null (not 0) when no
-- rental_use_periods row exists yet for any month of the year, so callers can
-- tell "not configured" apart from "genuinely 0% rented."
-- ---------------------------------------------------------------------------
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
    select (
      select rp.rental_use_percent
      from rental_use_periods rp
      where rp.property_id = p_property_id
        and rp.effective_date <= (m.m_start + interval '1 month - 1 day')::date
      order by rp.effective_date desc
      limit 1
    ) as pct
    from months m
  )
  select avg(pct) from monthly where pct is not null;
$$;

-- ---------------------------------------------------------------------------
-- Schedule E line tagging on the existing transaction_categories lookup.
-- schedule_e_line groups categories into the report's line items (labels are
-- derived from this code in property_schedule_e / the UI, not stored twice).
-- prorate_by_rental_use = true for costs that serve the WHOLE property (so
-- only the rental share is deductible); false for costs that are already
-- 100% attributable to the rental activity itself (e.g. a management fee for
-- renting out rooms). Categories with no schedule_e_line (income, loan
-- principal/escrow, closing, capital improvements) are handled elsewhere or
-- not on Schedule E at all — capital improvements are capitalized and flow
-- through depreciation instead of being expensed here.
-- ---------------------------------------------------------------------------
alter table transaction_categories
  add column schedule_e_line text,
  add column prorate_by_rental_use boolean not null default true;

update transaction_categories
  set schedule_e_line = 'utilities'
  where code in ('utilities_electric', 'utilities_water', 'utilities_internet');
update transaction_categories
  set schedule_e_line = 'insurance'
  where code = 'insurance';
update transaction_categories
  set schedule_e_line = 'repairs'
  where code = 'repairs_maintenance';
update transaction_categories
  set schedule_e_line = 'supplies'
  where code = 'supplies';
update transaction_categories
  set schedule_e_line = 'management_fees', prorate_by_rental_use = false
  where code = 'property_management';
update transaction_categories
  set schedule_e_line = 'other'
  where code in ('hoa_dues', 'other_operating');

-- ---------------------------------------------------------------------------
-- loan_payments_made — number of monthly due-dates passed by p_asof. Pulled
-- out of loan_balance_cents (0008) so loan_interest_paid_cents below can reuse
-- the exact same "how many payments so far" logic instead of duplicating it.
-- Behavior-preserving: loan_balance_cents is replaced immediately after to
-- call this instead of its own inline copy.
-- ---------------------------------------------------------------------------
create or replace function loan_payments_made(
  p_loan_id uuid,
  p_asof    date default current_date
) returns integer
language sql stable
as $$
  select case
    when l.first_payment_date is null or p_asof < l.first_payment_date then 0
    else least(
      l.term_months,
      (extract(year from p_asof) - extract(year from l.first_payment_date)) * 12
        + (extract(month from p_asof) - extract(month from l.first_payment_date))
        - case when extract(day from p_asof) < extract(day from l.first_payment_date)
               then 1 else 0 end
        + 1
    )
  end::integer
  from loans l
  where l.id = p_loan_id;
$$;

create or replace function loan_balance_cents(
  p_loan_id uuid,
  p_asof    date default current_date
) returns bigint
language sql stable
as $$
  with l as (
    select original_amount_cents, interest_rate, term_months
    from loans
    where id = p_loan_id
  ),
  n as (
    select loan_payments_made(p_loan_id, p_asof) as payments_made
  ),
  pmt as (
    select mortgage_monthly_pi(l.original_amount_cents, l.interest_rate, l.term_months) as amount_cents
    from l
  )
  select greatest(0, case
    when n.payments_made <= 0 then l.original_amount_cents
    when coalesce(l.interest_rate, 0) = 0
      then l.original_amount_cents - pmt.amount_cents * n.payments_made
    else round(
      l.original_amount_cents * power(1 + l.interest_rate / 12, n.payments_made)
      - pmt.amount_cents * (power(1 + l.interest_rate / 12, n.payments_made) - 1)
        / (l.interest_rate / 12)
    )::bigint
  end)
  from l, n, pmt;
$$;

-- ---------------------------------------------------------------------------
-- loan_interest_paid_cents — interest paid between two dates (inclusive), for
-- a FIXED-rate loan: (payments made in the window * PMT) - (principal paid
-- down in the window). Exact for fixed-rate amortization; ARMs are an
-- approximation since rate changes aren't versioned in this schema (same
-- known limitation as the rest of the amortization engine in 0008).
-- ---------------------------------------------------------------------------
create or replace function loan_interest_paid_cents(
  p_loan_id uuid,
  p_from    date,
  p_to      date
) returns bigint
language sql stable
as $$
  with l as (
    select original_amount_cents, interest_rate, term_months
    from loans where id = p_loan_id
  ),
  n_before as (select loan_payments_made(p_loan_id, (p_from - 1))  as n),
  n_after  as (select loan_payments_made(p_loan_id, p_to)          as n),
  pmt as (
    select mortgage_monthly_pi(l.original_amount_cents, l.interest_rate, l.term_months) as amount_cents
    from l
  )
  select greatest(0::bigint,
    (n_after.n - n_before.n) * pmt.amount_cents
    - (loan_balance_cents(p_loan_id, (p_from - 1)) - loan_balance_cents(p_loan_id, p_to))
  )
  from n_before, n_after, pmt;
$$;

-- ---------------------------------------------------------------------------
-- property_annual_interest_paid_cents — Schedule E line 12 input. Prefers
-- actual interest_payment transactions for the year (matches what a 1098
-- would show); falls back to computed amortization across every loan funded
-- by year-end, same "actuals win, else compute" rule property_monthly_cashflow
-- uses for debt service. The computed fallback can slightly double-count
-- interest during the calendar month of a refinance (old + new loan both
-- contribute) — a known, documented simplification; log actual payments to
-- avoid it.
-- ---------------------------------------------------------------------------
create or replace function property_annual_interest_paid_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns bigint
language sql stable
as $$
  with bounds as (
    select make_date(p_tax_year, 1, 1) as y_start, make_date(p_tax_year, 12, 31) as y_end
  ),
  actual as (
    select coalesce(sum(t.amount_cents), 0) as cents
    from transactions t
    where t.property_id = p_property_id
      and t.category = 'interest_payment'
      and t.txn_date between (select y_start from bounds) and (select y_end from bounds)
  ),
  computed as (
    select coalesce(sum(
      loan_interest_paid_cents(
        l.id,
        greatest((select y_start from bounds), l.funding_date),
        (select y_end from bounds)
      )
    ), 0) as cents
    from loans l
    where l.property_id = p_property_id
      and l.funding_date is not null
      and l.funding_date <= (select y_end from bounds)
  )
  select case
    when (select cents from actual) > 0 then (select cents from actual)
    else (select cents from computed)
  end;
$$;

-- ---------------------------------------------------------------------------
-- depreciation_asset_year_cents — IRS residential-rental depreciation: 27.5
-- years (330 months), straight-line, MID-MONTH convention (the placed-in-
-- service month gets a half month). Works for the building itself AND for
-- each capital improvement (which each get their own 27.5-yr clock starting
-- on their own placed-in-service date). Computed as the difference between
-- cumulative depreciated months through the end of this year vs. the end of
-- the prior year, both capped at 330 — this naturally handles the partial
-- first year and partial final year without special-casing either.
-- ---------------------------------------------------------------------------
create or replace function depreciation_asset_year_cents(
  p_basis_cents       bigint,
  p_placed_in_service date,
  p_tax_year          integer
) returns bigint
language sql immutable
as $$
  with y0 as (
    select extract(year from p_placed_in_service)::integer as yr,
           extract(month from p_placed_in_service)::integer as mo
  ),
  cum as (
    select
      least(330, greatest(0, (p_tax_year - y0.yr) * 12 + (12 - y0.mo) + 0.5)) as cum_end,
      least(330, greatest(0, (p_tax_year - 1 - y0.yr) * 12 + (12 - y0.mo) + 0.5)) as cum_start
    from y0
  )
  select case
    when p_basis_cents is null or p_placed_in_service is null then 0
    else round((cum.cum_end - cum.cum_start) * p_basis_cents::numeric / 330)::bigint
  end
  from cum;
$$;

-- ---------------------------------------------------------------------------
-- property_building_basis_cents — the depreciable (building-only) share of
-- your purchase-price basis. Land isn't depreciable, so this applies the
-- county appraisal district's land/total ratio (from the earliest available
-- assessed_values row — county_record preferred over estimate) to your
-- PURCHASE PRICE, per Pub 527's standard allocation method. Capital
-- improvements are NOT included here (they're depreciated separately, each
-- from its own placed-in-service date, in property_annual_depreciation_cents)
-- since they aren't part of the original land/building split.
-- Returns null when no assessed_values row exists yet — depreciation can't be
-- computed until you add one.
-- ---------------------------------------------------------------------------
create or replace function property_building_basis_cents(p_property_id uuid)
returns bigint
language sql stable
as $$
  with av as (
    select land_value_cents, total_assessed_cents
    from assessed_values
    where property_id = p_property_id and total_assessed_cents > 0
    order by (source = 'county_record') desc, tax_year asc
    limit 1
  ),
  p as (select purchase_price_cents from properties where id = p_property_id)
  select case
    when av.total_assessed_cents is null then null
    else round(
      p.purchase_price_cents::numeric
      * (1 - av.land_value_cents::numeric / av.total_assessed_cents)
    )::bigint
  end
  from p left join av on true;
$$;

-- ---------------------------------------------------------------------------
-- property_annual_depreciation_cents — Schedule E line 18. Per Pub 527's
-- "renting part of your home" method: depreciate the FULL building (basis
-- from property_building_basis_cents, placed in service on the earliest
-- rental_use_periods.effective_date) plus each capital improvement (its own
-- txn_date/amount as its own asset), then take the RENTAL-USE-% SHARE of the
-- total for the year — not each asset separately, so a mid-year use% change
-- still applies uniformly to the year's depreciation.
-- Null when rental use isn't configured yet, or no assessed_values row exists.
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
    select min(effective_date) as d
    from rental_use_periods
    where property_id = p_property_id
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
-- property_schedule_e — the report. One row per Schedule E line, already
-- prorated by rental-use % where applicable. `source` tells the UI whether a
-- number is real transaction data ('actual'), engine-computed ('computed'),
-- or a raw unprorated fallback because rental-use % isn't set up yet
-- ('not_configured' — still shown, at face value, so the report is never
-- silently empty, but flagged so the UI can prompt to configure it).
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
  select * from depreciation;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function property_current_rental_use(uuid, date)             to authenticated;
grant execute on function property_rental_use_percent_for_year(uuid, integer) to authenticated;
grant execute on function loan_payments_made(uuid, date)                      to authenticated;
grant execute on function loan_interest_paid_cents(uuid, date, date)          to authenticated;
grant execute on function property_annual_interest_paid_cents(uuid, integer)  to authenticated;
grant execute on function depreciation_asset_year_cents(bigint, date, integer) to authenticated;
grant execute on function property_building_basis_cents(uuid)                 to authenticated;
grant execute on function property_annual_depreciation_cents(uuid, integer)   to authenticated;
grant execute on function property_schedule_e(uuid, integer)                  to authenticated;
