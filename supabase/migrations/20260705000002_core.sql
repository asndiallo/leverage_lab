-- =============================================================================
-- Leverage Lab — 0002: Core property + financing tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- properties
-- Note: NO loan columns here. Loan terms moved to their own table (0002 below)
-- because a military house-hacker will very likely refinance (VA IRRRL), and a
-- refi must not overwrite the original loan's history.
-- purchase_price_cents is the BASIS anchor and is deliberately separate from the
-- loan amount — with VA the loan can exceed the price (financed funding fee),
-- and the extra financed amount is not cash you invested nor part of your basis.
-- ---------------------------------------------------------------------------
create table properties (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  address       text not null,
  city          text not null,
  state         text not null check (char_length(state) = 2),
  zip           text not null,                      -- text: preserves leading zeros
  cad_account   text,                               -- county appraisal district acct (Guadalupe CAD 110923 / R358077)
  parcel_id     text,                               -- geographic / parcel ID (e.g. 1G3626-4004-02400-0-00)

  purchase_price_cents bigint not null check (purchase_price_cents >= 0),
  purchase_date date not null,

  property_type property_type   not null,
  status        property_status not null default 'pending',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index properties_user_idx on properties(user_id);
create trigger properties_set_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- loans
-- One property can have multiple loans over time. `replaces_loan_id` chains a
-- refi to the loan it paid off, so scenario modeling can show before/after
-- without losing the original terms.
-- Monthly P&I is NOT stored (compute-don't-store) — it is derived from
-- original_amount_cents + interest_rate + term_months via mortgage_monthly_pi()
-- in 0005. `pi_override_cents` exists only for the rare case where you want the
-- lender's exact amortized figure (which can differ from the formula by a cent).
-- ---------------------------------------------------------------------------
create table loans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  loan_type     loan_type   not null default 'original',
  lender        text,                               -- e.g. "Navy Federal Credit Union"

  original_amount_cents bigint not null check (original_amount_cents > 0),
  interest_rate numeric(6,4) not null check (interest_rate >= 0),  -- 0.0550 = 5.50%
  rate_type     rate_type not null default 'fixed',
  term_months   integer not null check (term_months > 0),          -- store months (360), not years

  -- Two distinct dates that are often conflated. Funding is when money moves;
  -- first_payment is typically the 1st of the month ~30+ days later. Interest
  -- accrual/amortization keys off these, so we keep both explicit.
  funding_date       date,
  first_payment_date date,

  pi_override_cents  bigint check (pi_override_cents is null or pi_override_cents >= 0),

  status        loan_status not null default 'active',
  replaces_loan_id uuid references loans(id) on delete set null,

  notes         text,
  created_at    timestamptz not null default now()
);
create index loans_property_idx on loans(property_id);
create index loans_user_idx on loans(user_id);

-- ---------------------------------------------------------------------------
-- escrow_schedules  (versioned)
-- Replaces the brief's `mortgage_escrow`. Holds ONLY the parts that actually
-- change over time — tax escrow, insurance escrow, HOA — each as an append-only
-- version keyed by effective_date. P&I is not here (it belongs to the loan and
-- doesn't change on a fixed loan; repeating it per version would invite drift).
-- The "current" escrow for a given month = latest effective_date <= that month.
-- ---------------------------------------------------------------------------
create table escrow_schedules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  loan_id       uuid references loans(id) on delete set null,  -- servicer, if tied to a specific loan

  effective_date date not null,                     -- when this escrow amount takes effect (NFCU recalc date)
  monthly_tax_escrow_cents       bigint not null default 0 check (monthly_tax_escrow_cents >= 0),
  monthly_insurance_escrow_cents bigint not null default 0 check (monthly_insurance_escrow_cents >= 0),
  monthly_hoa_cents              bigint not null default 0 check (monthly_hoa_cents >= 0),

  notes         text,                               -- e.g. "NFCU annual escrow analysis"
  created_at    timestamptz not null default now(),

  unique (property_id, effective_date)
);
create index escrow_property_idx on escrow_schedules(property_id, effective_date desc);
create index escrow_user_idx on escrow_schedules(user_id);

-- ---------------------------------------------------------------------------
-- property_settings
-- Home for the "configurable" assumptions the metric formulas reference but the
-- brief never gave a table for: vacancy reserve %, maintenance reserve %.
-- One row per property; defaults match the brief (5% / 1%). Not versioned —
-- these are modeling knobs, not historical facts.
-- ---------------------------------------------------------------------------
create table property_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null unique references properties(id) on delete cascade,

  vacancy_reserve_rate     numeric(5,4) not null default 0.0500 check (vacancy_reserve_rate >= 0),  -- of gross rent
  maintenance_reserve_rate numeric(5,4) not null default 0.0100 check (maintenance_reserve_rate >= 0), -- of purchase price / yr

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index property_settings_user_idx on property_settings(user_id);
create trigger property_settings_set_updated_at
  before update on property_settings
  for each row execute function set_updated_at();
