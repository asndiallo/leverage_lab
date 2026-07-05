-- =============================================================================
-- Leverage Lab — 0001: Extensions, conventions, and enums
-- =============================================================================
-- CONVENTIONS USED ACROSS THE WHOLE SCHEMA
--   * Money is ALWAYS stored as integer cents in a `bigint` column named
--     `*_cents`. bigint (not int4) because int4 caps at ~$21M and portfolio
--     sums / capital projects can exceed that. No floating point, ever.
--   * Rates and percentages are `numeric` fractions (0.0550 == 5.50%), NOT cents.
--     Dollars are the only thing measured in cents.
--   * Every table carries `user_id uuid not null references auth.users`. This is
--     the ONLY way to honor "adding multi-user later needs no migration": the
--     column and its RLS policies exist from day one, defaulted to the single
--     user. Going multi-user then means handing out logins, not altering tables.
--   * Every "versioned" fact (escrow, assessed value, tax rate, exemption) is
--     append-only: you INSERT a new row with an effective date/year and never
--     UPDATE or DELETE the prior one. The "current" value is the latest
--     effective row <= the date you are asking about.
-- =============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()

-- Generic updated_at maintenance trigger, reused by mutable tables.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums. Postgres enums are cheap to extend (ALTER TYPE ... ADD VALUE) but
-- painful to reorder/remove, so we only use them for genuinely closed sets.
-- The transaction *category* list is intentionally NOT an enum — it lives in a
-- lookup table (0004) so we can attach a group + direction to each code and add
-- categories without a type migration.
-- ---------------------------------------------------------------------------

create type property_type as enum (
  'single_family', 'duplex', 'triplex', 'fourplex',
  'townhouse', 'condo', 'other'
);

create type property_status as enum (
  'pending',   -- under contract / pre-close
  'active',    -- owned
  'sold'
);

create type loan_type as enum (
  'original',      -- purchase-money loan
  'refinance',     -- e.g. VA IRRRL streamline refi
  'heloc',
  'second_lien',
  'other'
);

create type rate_type as enum ('fixed', 'arm');

create type loan_status as enum (
  'active',
  'paid_off',
  'refinanced_out'  -- superseded by a later refinance loan
);

-- Texas property tax is levied by several independent units, each with its own
-- rate AND its own exemptions. This enum tags what kind each jurisdiction is.
create type jurisdiction_type as enum (
  'isd',       -- school district (e.g. Schertz-Cibolo-Universal City ISD)
  'county',    -- e.g. Guadalupe County
  'city',      -- e.g. City of Cibolo
  'mud',       -- municipal utility district
  'esd',       -- emergency services district
  'college',   -- junior college district
  'other'
);

create type exemption_type as enum (
  'homestead',
  'over65',
  'disabled_veteran',
  'disability',
  'other'
);

-- How an exemption reduces taxable value. This is what lets one model both
-- "SCUCISD homestead = flat $140,000 off" and "Guadalupe County = 1% of
-- assessed, minimum $5,000" without special-casing each jurisdiction in code.
create type exemption_calc_method as enum (
  'flat_amount',        -- uses flat_amount_cents
  'percent_of_assessed' -- uses percent, clamped by min/max_amount_cents
);

create type assessed_value_source as enum ('county_record', 'estimate');

create type lease_status as enum ('pending', 'active', 'ended');

-- Why a unit is empty, for annotating projected vacancy gaps.
create type vacancy_reason as enum (
  'turnover', 'renovation', 'pcs_move', 'market_soft',
  'intentional_hold', 'other'
);

create type transaction_direction as enum ('income', 'expense');

create type category_group as enum (
  'income', 'operating_expense', 'capital_improvement', 'loan', 'closing'
);

create type paid_by as enum ('owner', 'seller', 'tenant');

create type market_source as enum ('zillow_estimate', 'appraisal', 'manual');

create type utility_service_type as enum (
  'electric', 'water_sewer_trash', 'internet', 'gas'
);
