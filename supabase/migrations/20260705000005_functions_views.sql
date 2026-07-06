-- =============================================================================
-- Leverage Lab — 0005: Computed metrics (calculate on query, never store)
-- =============================================================================
-- These functions/views are the reference implementation of the brief's
-- "COMPUTED METRICS" section. Nothing here is persisted. Validate outputs
-- against a real statement before trusting them for decisions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- mortgage_monthly_pi — standard fully-amortizing payment, in cents.
--   M = P * r / (1 - (1+r)^-n),  r = annual_rate / 12
-- Falls back to straight-line if rate is 0. All math in numeric, rounded once.
-- ---------------------------------------------------------------------------
create or replace function mortgage_monthly_pi(
  p_principal_cents bigint,
  p_annual_rate     numeric,
  p_term_months     integer
) returns bigint
language sql immutable
as $$
  select case
    when p_term_months is null or p_term_months <= 0 then 0
    when coalesce(p_annual_rate, 0) = 0
      then round(p_principal_cents::numeric / p_term_months)::bigint
    else round(
      p_principal_cents::numeric * (p_annual_rate / 12)
      / (1 - power(1 + p_annual_rate / 12, -p_term_months))
    )::bigint
  end;
$$;

-- ---------------------------------------------------------------------------
-- v_loan_payment — monthly P&I per loan (override wins when present).
-- ---------------------------------------------------------------------------
create or replace view v_loan_payment as
select
  l.id            as loan_id,
  l.property_id,
  l.user_id,
  l.status,
  coalesce(l.pi_override_cents,
           mortgage_monthly_pi(l.original_amount_cents, l.interest_rate, l.term_months)
  ) as monthly_pi_cents
from loans l;

-- ---------------------------------------------------------------------------
-- property_current_escrow — the effective escrow version for a given month.
-- Returns the single latest row with effective_date <= month end.
-- ---------------------------------------------------------------------------
create or replace function property_current_escrow(
  p_property_id uuid,
  p_asof        date default current_date
) returns escrow_schedules
language sql stable
as $$
  select *
  from escrow_schedules
  where property_id = p_property_id
    and effective_date <= (date_trunc('month', p_asof) + interval '1 month - 1 day')::date
  order by effective_date desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- property_annual_tax_cents — full Texas multi-jurisdiction tax for a year.
-- For each jurisdiction: taxable = base - that jurisdiction's active exemption,
-- then tax = taxable * rate; summed across jurisdictions.
--   base = capped_assessed_cents if present else total_assessed_cents
--          (prefers county_record over estimate for the year).
--   exemption per (jurisdiction,type) = latest applied row with
--          effective_tax_year <= p_tax_year, evaluated by its calc_method.
-- Worked example (2026, assessed $300,000):
--   SCUCISD flat $140k  -> taxable 160k * isd_rate
--   County 1% min $5k   -> exemption max(0.01*300k, 5k)=3k? -> min floor 5k -> 5k off
-- ---------------------------------------------------------------------------
create or replace function property_annual_tax_cents(
  p_property_id uuid,
  p_tax_year    integer
) returns bigint
language sql stable
as $$
  with av as (
    select coalesce(capped_assessed_cents, total_assessed_cents) as base_cents
    from assessed_values
    where property_id = p_property_id and tax_year = p_tax_year
    order by (source = 'county_record') desc, recorded_at desc
    limit 1
  ),
  -- one active exemption per (jurisdiction, type): most recent effective year
  active_ex as (
    select distinct on (e.jurisdiction_id, e.exemption_type)
      e.jurisdiction_id,
      e.calc_method, e.flat_amount_cents, e.percent, e.min_amount_cents, e.max_amount_cents
    from tax_exemptions e
    where e.property_id = p_property_id
      and e.applied = true
      and e.effective_tax_year <= p_tax_year
    order by e.jurisdiction_id, e.exemption_type, e.effective_tax_year desc
  ),
  ex_per_j as (
    -- exemption = clamp( flat + percent*base , min, max ), summed per jurisdiction
    select
      x.jurisdiction_id,
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
  ),
  per_j as (
    select
      greatest((select base_cents from av) - coalesce(x.exemption_cents, 0), 0) as taxable_cents,
      r.rate
    from taxing_jurisdictions j
    join tax_rates r on r.jurisdiction_id = j.id and r.tax_year = p_tax_year
    left join ex_per_j x on x.jurisdiction_id = j.id
    where j.property_id = p_property_id
  )
  select coalesce(sum(round(taxable_cents * rate))::bigint, 0) from per_j;
$$;

-- ---------------------------------------------------------------------------
-- property_tax_basis_cents — purchase price + capital improvements - seller credits.
-- ---------------------------------------------------------------------------
create or replace function property_tax_basis_cents(p_property_id uuid)
returns bigint
language sql stable
as $$
  select
    (select purchase_price_cents from properties where id = p_property_id)
    + coalesce((
        select sum(t.amount_cents) from transactions t
        join transaction_categories c on c.code = t.category
        where t.property_id = p_property_id and c.category_group = 'capital_improvement'
      ), 0)
    - coalesce((
        select sum(t.amount_cents) from transactions t
        where t.property_id = p_property_id and t.category = 'seller_credit'
      ), 0);
$$;

-- ---------------------------------------------------------------------------
-- property_monthly_cashflow — the headline metric, one month at a time.
-- Rules that implement the answered design decisions:
--   * Historical month (ends before the current month): use ACTUAL transactions.
--   * Projected month: income = rent from leases active that month
--     (+ flat utility charges); operating = any is_estimate operating rows.
--   * Debt service: if actual loan/escrow transactions exist for the month, use
--     their sum (reconciled actuals); otherwise use computed P&I + escrow.
--   * Reserves: vacancy = vacancy_rate * gross rent; maintenance =
--     maintenance_rate * purchase_price / 12.
--   * is_vacant: projected month with no active lease covering any unit.
-- ---------------------------------------------------------------------------
create or replace function property_monthly_cashflow(
  p_property_id uuid,
  p_month       date
) returns table (
  month                 date,
  is_projected          boolean,
  is_vacant             boolean,
  gross_rent_cents      bigint,
  other_income_cents    bigint,
  income_total_cents    bigint,
  debt_service_cents    bigint,
  operating_expense_cents bigint,
  vacancy_reserve_cents bigint,
  maintenance_reserve_cents bigint,
  net_cashflow_cents    bigint
)
language plpgsql stable
as $$
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  cur_month_start date := date_trunc('month', current_date)::date;
  projected boolean := m_start >= cur_month_start;

  v_gross_rent bigint := 0;
  v_other_income bigint := 0;
  v_debt bigint := 0;
  v_opex bigint := 0;
  v_vac_rate numeric;
  v_maint_rate numeric;
  v_price bigint;
  v_has_active_lease boolean := false;
  v_loan_actuals bigint;
  esc escrow_schedules;
begin
  select coalesce(ps.vacancy_reserve_rate, 0.05),
         coalesce(ps.maintenance_reserve_rate, 0.01),
         p.purchase_price_cents
    into v_vac_rate, v_maint_rate, v_price
  from properties p
  left join property_settings ps on ps.property_id = p.id
  where p.id = p_property_id;

  -- lease coverage for the month (used for projection + vacancy flag)
  select exists (
    select 1 from leases l
    where l.property_id = p_property_id
      and l.status in ('active', 'pending')
      and l.lease_start <= m_end
      and (l.lease_end is null or l.lease_end >= m_start)
  ) into v_has_active_lease;

  if projected then
    -- projected rent + partial-utility income from active leases
    select coalesce(sum(l.rent_amount_cents), 0),
           coalesce(sum(l.flat_utility_charge_cents), 0)
      into v_gross_rent, v_other_income
    from leases l
    where l.property_id = p_property_id
      and l.status in ('active', 'pending')
      and l.lease_start <= m_end
      and (l.lease_end is null or l.lease_end >= m_start);
  else
    -- actual income from transactions
    select coalesce(sum(case when t.category = 'rent' then t.amount_cents else 0 end), 0),
           coalesce(sum(case when c.category_group = 'income' and t.category <> 'rent'
                             then t.amount_cents else 0 end), 0)
      into v_gross_rent, v_other_income
    from transactions t
    join transaction_categories c on c.code = t.category
    where t.property_id = p_property_id
      and t.txn_date between m_start and m_end
      and c.direction = 'income';
  end if;

  -- operating expenses (actuals for past; is_estimate rows for projected)
  select coalesce(sum(t.amount_cents), 0)
    into v_opex
  from transactions t
  join transaction_categories c on c.code = t.category
  where t.property_id = p_property_id
    and t.txn_date between m_start and m_end
    and c.category_group = 'operating_expense'
    and (t.is_estimate = projected or projected = false);

  -- debt service: prefer reconciled loan/escrow actuals for the month
  select coalesce(sum(t.amount_cents), 0)
    into v_loan_actuals
  from transactions t
  join transaction_categories c on c.code = t.category
  where t.property_id = p_property_id
    and t.txn_date between m_start and m_end
    and c.category_group = 'loan';

  if v_loan_actuals > 0 then
    v_debt := v_loan_actuals;
  else
    -- computed: P&I of active loans + current escrow version
    select coalesce(sum(vp.monthly_pi_cents), 0)
      into v_debt
    from v_loan_payment vp
    where vp.property_id = p_property_id and vp.status = 'active';

    esc := property_current_escrow(p_property_id, m_end);
    if esc.id is not null then
      v_debt := v_debt
        + esc.monthly_tax_escrow_cents
        + esc.monthly_insurance_escrow_cents
        + esc.monthly_hoa_cents;
    end if;
  end if;

  month := m_start;
  is_projected := projected;
  is_vacant := projected and not v_has_active_lease;
  gross_rent_cents := v_gross_rent;
  other_income_cents := v_other_income;
  income_total_cents := v_gross_rent + v_other_income;
  debt_service_cents := v_debt;
  operating_expense_cents := v_opex;
  vacancy_reserve_cents := round(v_gross_rent * v_vac_rate)::bigint;
  maintenance_reserve_cents := round(v_price * v_maint_rate / 12)::bigint;
  net_cashflow_cents := income_total_cents
                        - debt_service_cents
                        - operating_expense_cents
                        - vacancy_reserve_cents
                        - maintenance_reserve_cents;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_property_yields — gross/net yield and cash-on-cash.
--   gross yield = annualized in-place rent / purchase_price
--   net yield   = trailing-12-month net cash flow / purchase_price
--   cash-on-cash= trailing-12 net cash flow / total_cash_invested
--     total_cash_invested = down payment (price - original loan, floored at 0)
--       + owner-paid closing costs/prepaids/initial escrow - seller credits.
-- Trailing-12 net cash flow sums the monthly function over the last 12 months.
-- ---------------------------------------------------------------------------
create or replace view v_property_yields as
with rent as (
  select l.property_id, coalesce(sum(l.rent_amount_cents), 0) * 12 as annual_rent_cents
  from leases l
  where l.status = 'active'
  group by l.property_id
),
invested as (
  -- Total cash the owner actually put in. Works for both a conventional
  -- down-payment loan (loan < price) AND a VA/financed loan (loan > price, where
  -- the excess loan finances closing costs). Derivation:
  --   price + your closing costs  (everything you owe)
  --   - original loan             (what financing covers, incl. any excess)
  --   - seller + borrower credits  (what others cover)
  --   = deposit + cash-to-close + costs paid before closing.
  -- For 117 Willow Cove this yields $4,528.01, matching the CD.
  select
    p.id as property_id,
    greatest(
      p.purchase_price_cents
      + coalesce((
          select sum(t.amount_cents) from transactions t
          join transaction_categories c on c.code = t.category
          where t.property_id = p.id
            and c.category_group = 'closing' and c.direction = 'expense'
            and t.paid_by = 'owner'
        ), 0)
      - coalesce((
          select sum(l.original_amount_cents) from loans l
          where l.property_id = p.id and l.loan_type = 'original'
        ), 0)
      - coalesce((
          select sum(t.amount_cents) from transactions t
          where t.property_id = p.id and t.category in ('seller_credit', 'borrower_credit')
        ), 0),
      0) as total_cash_invested_cents
  from properties p
),
ttm as (
  select p.id as property_id, coalesce(sum(cf.net_cashflow_cents), 0) as ttm_net_cents
  from properties p
  cross join lateral generate_series(0, 11) gs
  cross join lateral property_monthly_cashflow(
    p.id, (date_trunc('month', current_date) - (gs || ' months')::interval)::date
  ) cf
  group by p.id
)
select
  p.id as property_id,
  p.user_id,
  p.purchase_price_cents,
  coalesce(r.annual_rent_cents, 0)             as annual_rent_cents,
  i.total_cash_invested_cents,
  t.ttm_net_cents                              as annual_net_cashflow_cents,
  round(coalesce(r.annual_rent_cents,0)::numeric
        / nullif(p.purchase_price_cents,0), 4) as gross_yield,
  round(t.ttm_net_cents::numeric
        / nullif(p.purchase_price_cents,0), 4) as net_yield,
  round(t.ttm_net_cents::numeric
        / nullif(i.total_cash_invested_cents,0), 4) as cash_on_cash
from properties p
left join rent r     on r.property_id = p.id
left join invested i on i.property_id = p.id
left join ttm t      on t.property_id = p.id;

-- ---------------------------------------------------------------------------
-- property_cashflow_range — monthly cash flow for N consecutive months from
-- p_start. Thin generate_series wrapper over property_monthly_cashflow so the
-- UI fetches a whole strip in one round trip.
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
-- Reuses the same exemption clamp (flat + percent*base, [min,max]) as
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
