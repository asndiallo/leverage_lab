-- =============================================================================
-- Leverage Lab — 0004: Leasing, transactions, utilities, market value
-- =============================================================================

-- ---------------------------------------------------------------------------
-- leases
-- unit_identifier is free text (e.g. 'master_bedroom', 'room_2', 'unit_a').
-- A normalized units/tenants model is deliberately skipped as over-engineering
-- at single-owner, room-by-room house-hack scale.
-- rent_amount_cents from ACTIVE/PENDING leases is what the projection engine
-- uses for future months (see property_monthly_cashflow in 0005).
-- lease_end NULL == month-to-month.
-- ---------------------------------------------------------------------------
create table leases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  unit_identifier text not null,
  tenant_name   text not null,
  tenant_email  text,

  rent_amount_cents bigint not null check (rent_amount_cents >= 0),
  lease_start   date not null,
  lease_end     date,                               -- null = month-to-month

  utilities_included boolean not null default false,
  flat_utility_charge_cents bigint not null default 0 check (flat_utility_charge_cents >= 0), -- tenant pays partial utils

  status        lease_status not null default 'pending',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (lease_end is null or lease_end >= lease_start)
);
create index leases_property_idx on leases(property_id, lease_start);
create index leases_user_idx on leases(user_id);
create trigger leases_set_updated_at
  before update on leases
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- vacancy_periods  (annotation, NOT the source of vacancy math)
-- Whether a month is vacant is DERIVED from lease coverage (compute-don't-store).
-- This table only enriches a known/expected gap with WHY it's empty and what you
-- expect to re-rent at — turning a bare "$0" projection into a decision-grade
-- warning ("Aug vacant: PCS turnover, expect $1,150 from Sep 1"). Optional.
-- ---------------------------------------------------------------------------
create table vacancy_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  unit_identifier text,                             -- null = whole property
  start_date    date not null,
  end_date      date,                               -- null = open-ended

  reason        vacancy_reason not null,
  expected_rent_cents bigint check (expected_rent_cents is null or expected_rent_cents >= 0),
  expected_fill_date  date,

  notes         text,
  created_at    timestamptz not null default now(),

  check (end_date is null or end_date >= start_date)
);
create index vacancy_property_idx on vacancy_periods(property_id, start_date);
create index vacancy_user_idx on vacancy_periods(user_id);

-- ---------------------------------------------------------------------------
-- transaction_categories  (global reference lookup, seeded below)
-- Replaces the brief's giant category enum. Each code carries its group and its
-- direction, so `direction` is NOT stored redundantly on every transaction and
-- an illegal category/direction pairing is impossible. Adding a category is an
-- INSERT, not a type migration. Readable by all authenticated users (0006).
-- ---------------------------------------------------------------------------
create table transaction_categories (
  code          text primary key,
  category_group category_group not null,
  direction     transaction_direction not null,
  label         text not null,
  sort_order    integer not null default 0
);

insert into transaction_categories (code, category_group, direction, label, sort_order) values
  -- INCOME
  ('rent',                    'income',              'income',  'Rent',                     10),
  ('late_fee',                'income',              'income',  'Late Fee',                 20),
  ('utility_reimbursement',   'income',              'income',  'Utility Reimbursement',    30),
  ('other_income',            'income',              'income',  'Other Income',             40),
  -- OPERATING EXPENSE
  ('utilities_electric',      'operating_expense',   'expense', 'Utilities — Electric',    110),
  ('utilities_water',         'operating_expense',   'expense', 'Utilities — Water',       120),
  ('utilities_internet',      'operating_expense',   'expense', 'Utilities — Internet',    130),
  ('insurance',               'operating_expense',   'expense', 'Insurance',               140),
  ('hoa_dues',                'operating_expense',   'expense', 'HOA Dues',                150),
  ('repairs_maintenance',     'operating_expense',   'expense', 'Repairs & Maintenance',   160),
  ('supplies',                'operating_expense',   'expense', 'Supplies',                170),
  ('property_management',     'operating_expense',   'expense', 'Property Management',     180),
  ('other_operating',         'operating_expense',   'expense', 'Other Operating',         190),
  -- CAPITAL IMPROVEMENT
  ('renovation',              'capital_improvement', 'expense', 'Renovation',              210),
  ('appliance',              'capital_improvement', 'expense', 'Appliance',               220),
  ('security_system',         'capital_improvement', 'expense', 'Security System',         230),
  ('landscaping',             'capital_improvement', 'expense', 'Landscaping',             240),
  ('other_capital',           'capital_improvement', 'expense', 'Other Capital',           250),
  -- LOAN  (actual payments; reconciled against computed debt service)
  ('principal_payment',       'loan',                'expense', 'Principal Payment',       310),
  ('interest_payment',        'loan',                'expense', 'Interest Payment',        320),
  ('escrow_payment',          'loan',                'expense', 'Escrow Payment',          330),
  -- CLOSING
  ('seller_credit',           'closing',             'income',  'Seller Credit',           410),
  ('borrower_credit',         'closing',             'income',  'Borrower Credit',         415),  -- title policy adj, tax/assessment prorations credited to buyer
  ('closing_cost',            'closing',             'expense', 'Closing Cost',            420),
  ('prepaid',                 'closing',             'expense', 'Prepaid',                 430),
  ('escrow_initial',          'closing',             'expense', 'Initial Escrow Deposit',  440),
  ('other_closing',           'closing',             'expense', 'Other Closing',           450);

-- ---------------------------------------------------------------------------
-- transactions
-- One table for actuals AND projected/estimate line items (is_estimate).
--   * direction/group are derived by joining transaction_categories — never stored.
--   * amount_cents is always POSITIVE; the category's direction gives the sign.
--   * loan_id ties principal/interest/escrow actuals to their loan, so the
--     cash-flow function can prefer these actuals over computed debt service for
--     a month (the "both, reconciled" model) without double-counting.
--   * is_estimate MUST be surfaced distinctly in every UI view — estimates are
--     not facts (design constraint #4).
-- ---------------------------------------------------------------------------
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  lease_id      uuid references leases(id) on delete set null,   -- nullable: not all txns are tenant-related
  loan_id       uuid references loans(id)  on delete set null,   -- set for loan/escrow actuals

  txn_date      date not null,
  amount_cents  bigint not null check (amount_cents >= 0),        -- magnitude; sign comes from category
  category      text not null references transaction_categories(code),

  description   text,
  paid_by       paid_by not null default 'owner',
  is_estimate   boolean not null default false,                   -- projected/planned, not actual
  notes         text,
  created_at    timestamptz not null default now()
);
create index transactions_property_date_idx on transactions(property_id, txn_date);
create index transactions_category_idx on transactions(category);
create index transactions_lease_idx on transactions(lease_id);
create index transactions_loan_idx on transactions(loan_id);
create index transactions_user_idx on transactions(user_id);

-- ---------------------------------------------------------------------------
-- market_snapshots — value estimates over time (distinct from tax-assessed).
-- ---------------------------------------------------------------------------
create table market_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  snapshot_date date not null,
  estimated_value_cents bigint not null check (estimated_value_cents >= 0),
  source        market_source not null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index market_property_idx on market_snapshots(property_id, snapshot_date desc);
create index market_user_idx on market_snapshots(user_id);

-- ---------------------------------------------------------------------------
-- utility_accounts
-- monthly_avg_cents is a CACHED rolling average (an input assumption for
-- projections), not a ledger fact — refresh it as bills arrive. Actual utility
-- spend lives in transactions under the utilities_* categories.
-- ---------------------------------------------------------------------------
create table utility_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  provider_name text not null,                      -- "GVEC", "City of Cibolo"
  account_number text,
  service_type  utility_service_type not null,
  monthly_avg_cents bigint check (monthly_avg_cents is null or monthly_avg_cents >= 0),  -- cached estimate

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index utility_property_idx on utility_accounts(property_id);
create index utility_user_idx on utility_accounts(user_id);
create trigger utility_accounts_set_updated_at
  before update on utility_accounts
  for each row execute function set_updated_at();
