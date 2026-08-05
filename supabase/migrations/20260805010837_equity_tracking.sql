-- =============================================================================
-- Leverage Lab — 0008: equity-over-time tracking
-- Additive migration (the earlier "edit migrations in place" convention no
-- longer applies now that both local and remote carry real data — see
-- memory). Adds the amortization math needed to know a property's loan
-- balance as of an arbitrary past date, and a function that turns that plus
-- the (already-existing, previously unused) market_snapshots table into an
-- equity-over-time series: [{purchase day}, ...manually logged snapshots].
-- CAGR itself is computed in the app from this series, not stored here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- loan_balance_cents — standard fully-amortizing remaining balance after n
-- payments, n derived from how many monthly due-dates (anchored to
-- first_payment_date's day-of-month) have passed by p_asof.
--   balance(n) = P*(1+r)^n - PMT*((1+r)^n - 1)/r   (r = 0 -> straight-line)
-- Falls back to the loan's full original amount when first_payment_date is
-- unknown or p_asof predates it (no payments made yet).
-- ---------------------------------------------------------------------------
create or replace function loan_balance_cents(
  p_loan_id uuid,
  p_asof    date default current_date
) returns bigint
language sql stable
as $$
  with l as (
    select original_amount_cents, interest_rate, term_months, first_payment_date
    from loans
    where id = p_loan_id
  ),
  n as (
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
    end as payments_made
    from l
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
-- property_loan_balance_cents — the balance of whichever loan governed the
-- property on p_asof (the most recently funded loan with funding_date <=
-- p_asof), so a refinance mid-history is picked up correctly rather than
-- always using today's active loan. 0 if no loan had funded yet by p_asof.
-- ---------------------------------------------------------------------------
create or replace function property_loan_balance_cents(
  p_property_id uuid,
  p_asof        date default current_date
) returns bigint
language sql stable
as $$
  select coalesce(
    (select loan_balance_cents(l.id, p_asof)
     from loans l
     where l.property_id = p_property_id
       and l.funding_date is not null
       and l.funding_date <= p_asof
     order by l.funding_date desc
     limit 1),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- property_equity_series — value/loan-balance/equity at each point the
-- property has a known value: purchase day (from properties itself, so a
-- meaningful series exists with zero manual snapshots logged) plus every
-- manually logged market_snapshots row.
-- ---------------------------------------------------------------------------
create or replace function property_equity_series(p_property_id uuid)
returns table (
  id                  uuid,   -- market_snapshots.id; null for the synthetic purchase-day row
  snapshot_date       date,
  value_cents         bigint,
  loan_balance_cents  bigint,
  equity_cents        bigint,
  source              text
)
language sql stable
as $$
  select
    null::uuid as id,
    p.purchase_date as snapshot_date,
    p.purchase_price_cents as value_cents,
    property_loan_balance_cents(p.id, p.purchase_date) as loan_balance_cents,
    p.purchase_price_cents - property_loan_balance_cents(p.id, p.purchase_date) as equity_cents,
    'purchase'::text as source
  from properties p
  where p.id = p_property_id

  union all

  select
    m.id,
    m.snapshot_date,
    m.estimated_value_cents,
    property_loan_balance_cents(p_property_id, m.snapshot_date),
    m.estimated_value_cents - property_loan_balance_cents(p_property_id, m.snapshot_date),
    m.source::text
  from market_snapshots m
  where m.property_id = p_property_id
    and m.snapshot_date <> (select purchase_date from properties where id = p_property_id)

  order by snapshot_date;
$$;

grant execute on function loan_balance_cents(uuid, date)          to authenticated;
grant execute on function property_loan_balance_cents(uuid, date) to authenticated;
grant execute on function property_equity_series(uuid)            to authenticated;
