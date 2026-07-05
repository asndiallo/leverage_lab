-- =============================================================================
-- Leverage Lab — 0003: Texas multi-jurisdiction property tax
-- =============================================================================
-- Texas has no single "county rate". A parcel's tax bill is the SUM of several
-- independent taxing units, each with (a) its own rate set yearly and (b) its
-- own exemptions. Modeling that faithfully needs three tables:
--   taxing_jurisdictions  — which units this property sits in
--   tax_rates             — each unit's rate, versioned by tax_year
--   tax_exemptions        — each unit's exemption(s) for this property
-- and one value table:
--   assessed_values       — appraised value, versioned by tax_year
-- =============================================================================

-- ---------------------------------------------------------------------------
-- taxing_jurisdictions — the units a given property is taxed by.
-- Per-property (not a shared reference table) because the SET of units differs
-- by parcel, and exemptions attach per property anyway.
-- For 117 Willow Cove you'd add: SCUCISD (isd), Guadalupe County (county),
-- City of Cibolo (city), plus any MUD/ESD on the tax bill.
-- ---------------------------------------------------------------------------
create table taxing_jurisdictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  name          text not null,                      -- "Schertz-Cibolo-Universal City ISD"
  jurisdiction_type jurisdiction_type not null,

  created_at    timestamptz not null default now()
);
create index jurisdictions_property_idx on taxing_jurisdictions(property_id);
create index jurisdictions_user_idx on taxing_jurisdictions(user_id);

-- ---------------------------------------------------------------------------
-- tax_rates  (versioned per jurisdiction per year)
-- Rate is stored as a per-DOLLAR fraction of taxable value (e.g. 0.011900 for a
-- bill quoted as $1.19 per $100 valuation). Append-only: new year = new row.
-- ---------------------------------------------------------------------------
create table tax_rates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  jurisdiction_id uuid not null references taxing_jurisdictions(id) on delete cascade,

  tax_year      integer not null,
  rate          numeric(9,6) not null check (rate >= 0),   -- per $1 of taxable value

  created_at    timestamptz not null default now(),
  unique (jurisdiction_id, tax_year)
);
create index tax_rates_user_idx on tax_rates(user_id);

-- ---------------------------------------------------------------------------
-- assessed_values  (versioned per property per year)
-- total_assessed_cents is the appraised value. capped_assessed_cents is the
-- optional Texas homestead-cap value (the 10%/yr increase limit): when present
-- it, not total_assessed, is the base for computing taxable value. Keeping both
-- lets you see market-appraised vs. what you're actually taxed on.
-- `source` distinguishes hard county records from your own estimates so a later
-- county_record can supersede an estimate for the same year.
-- ---------------------------------------------------------------------------
create table assessed_values (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,

  tax_year      integer not null,
  land_value_cents        bigint not null default 0 check (land_value_cents >= 0),
  improvement_value_cents bigint not null default 0 check (improvement_value_cents >= 0),
  total_assessed_cents    bigint not null check (total_assessed_cents >= 0),
  capped_assessed_cents   bigint check (capped_assessed_cents is null or capped_assessed_cents >= 0),

  source        assessed_value_source not null,
  recorded_at   timestamptz not null default now(),
  notes         text,                               -- provenance, e.g. "2026 CAD value, not yet certified"
  created_at    timestamptz not null default now(),

  unique (property_id, tax_year, source)
);
create index assessed_property_idx on assessed_values(property_id, tax_year desc);
create index assessed_user_idx on assessed_values(user_id);

-- ---------------------------------------------------------------------------
-- tax_exemptions  (per property, per jurisdiction)
-- Modeled per jurisdiction because the same exemption is worth different amounts
-- in different units. The engine (property_annual_tax_cents) computes each as:
--     exemption = clamp( flat_amount_cents + percent * base , min, max )
-- which covers every shape on the Guadalupe tax certificate for 117 Willow Cove:
--   SCUCISD homestead:        flat_amount_cents=14000000                          ($140,000)
--   City of Cibolo homestead: flat_amount_cents=500000                            ($5,000)
--   Guadalupe County:         percent=0.0100, min_amount_cents=500000             (1%, min $5,000)
--   Lateral Roads:            percent=0.0100, flat_amount_cents=300000            (1% + $3,000)
-- `calc_method` is retained only as an advisory label for the UI, not the math.
-- `applied` = filed but not yet reflected on the roll (false) vs. active (true).
-- `effective_tax_year` is the first year it applies; it stays active for later
-- years until superseded by a newer row of the same (jurisdiction, type).
-- ---------------------------------------------------------------------------
create table tax_exemptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  jurisdiction_id uuid not null references taxing_jurisdictions(id) on delete cascade,

  exemption_type exemption_type not null,
  calc_method    exemption_calc_method not null,

  flat_amount_cents bigint check (flat_amount_cents is null or flat_amount_cents >= 0),
  percent           numeric(6,4) check (percent is null or percent >= 0),  -- 0.0100 = 1%
  min_amount_cents  bigint check (min_amount_cents is null or min_amount_cents >= 0),
  max_amount_cents  bigint check (max_amount_cents is null or max_amount_cents >= 0),

  effective_tax_year integer not null,
  applied            boolean not null default false,

  notes         text,
  created_at    timestamptz not null default now(),

  -- An exemption must carry at least one value component (flat and/or percent);
  -- the engine adds them, so additive forms like "1% + $3,000" are valid.
  constraint exemption_has_a_value check (
    flat_amount_cents is not null or percent is not null
  )
);
create index exemptions_property_idx on tax_exemptions(property_id);
create index exemptions_jurisdiction_idx on tax_exemptions(jurisdiction_id);
create index exemptions_user_idx on tax_exemptions(user_id);
