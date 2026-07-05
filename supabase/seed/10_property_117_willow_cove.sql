-- =============================================================================
-- Seed: 117 Willow Cove, Cibolo TX 78108
-- Source docs: NFCU Closing Disclosure (07/01/2026) + Guadalupe County certified
-- tax certificate #26-SA-2045 (06/12/2026). All amounts in integer cents.
-- Run with:  psql "$DB_URL" -v owner_email=you@example.com
-- One big data-modifying CTE so it's atomic. Run once on a clean property set.
-- =============================================================================

with owner as (
  select id as uid from auth.users where email = :'owner_email' limit 1
),
prop as (
  insert into properties (user_id, address, city, state, zip, cad_account, parcel_id,
                          purchase_price_cents, purchase_date, property_type, status)
  select uid, '117 Willow Cove', 'Cibolo', 'TX', '78108',
         '110923 / R358077', '1G3626-4004-02400-0-00',
         29550000, date '2026-07-09', 'single_family', 'pending'
  from owner
  returning id, user_id
),
loan as (
  insert into loans (user_id, property_id, loan_type, lender, original_amount_cents,
                     interest_rate, rate_type, term_months, funding_date, first_payment_date,
                     pi_override_cents, status, notes)
  select user_id, id, 'original', 'Navy Federal Credit Union', 30185300,
         0.0550, 'fixed', 360, date '2026-07-09', date '2026-09-01', 171389, 'active',
         'VA loan; loan > price by the financed $6,353.25 VA funding fee. P&I is the lender''s exact figure.'
  from prop
  returning id, property_id, user_id
),
settings as (
  insert into property_settings (user_id, property_id)   -- vacancy 5% / maintenance 1% defaults
  select user_id, id from prop
  returning property_id
),
escrow as (
  insert into escrow_schedules (user_id, property_id, loan_id, effective_date,
    monthly_tax_escrow_cents, monthly_insurance_escrow_cents, monthly_hoa_cents, notes)
  select l.user_id, l.property_id, l.id, date '2026-09-01', 47517, 14417, 2016,
         'NFCU CD 07/01/2026. Escrow $619.34 = tax $475.17 + ins $144.17. HOA $20.16/mo is non-escrowed, bundled into the monthly nut.'
  from loan l
  returning property_id
),
txn as (
  insert into transactions (user_id, property_id, txn_date, amount_cents, category,
                            description, paid_by, is_estimate, notes)
  select p.user_id, p.id, date '2026-07-09', v.amount, v.cat,
         v.descr, v.payer::paid_by, false, v.note
  from prop p cross join (values
    (1496908, 'closing_cost',    'Loan Costs (A+B+C): origination $4,905.11 + services $7,442.60 (incl VA funding fee $6,353.25, financed) + title $2,621.37', 'owner',  'CD Section D'),
    (17400,   'other_closing',   'Taxes & gov fees: recording — deed $41.00 + mortgage $133.00',                                                          'owner',  'CD Section E'),
    (277604,  'prepaid',         'Prepaids: hazard insurance 12mo $1,730.00 + prepaid interest $1,046.04 (23 days @ $45.48)',                             'owner',  'CD Section F'),
    (384406,  'escrow_initial',  'Initial escrow: insurance 3mo $432.51 + property tax 10mo $4,751.70 - aggregate adjustment $1,340.15',                  'owner',  'CD Section G'),
    (76975,   'other_closing',   'Other: HOA transfer fee $250.00 + home inspection $519.75',                                                             'owner',  'CD Section H'),
    (1000000, 'seller_credit',   'Seller credit',                                                                                                         'seller', 'CD Section L05 / N08'),
    (165192,  'borrower_credit', 'Title policy adjustment $1,646.00 + assessment proration 07/01-07/09 $5.92',                                            'owner',  'CD adjustments (Section L)')
  ) as v(amount, cat, descr, payer, note)
  returning id
),
jur as (
  insert into taxing_jurisdictions (user_id, property_id, name, jurisdiction_type)
  select p.user_id, p.id, j.name, j.jtype::jurisdiction_type
  from prop p cross join (values
    ('Schertz Cibolo Universal City ISD', 'isd'),
    ('City of Cibolo',                    'city'),
    ('Guadalupe County',                  'county'),
    ('Lateral Roads',                     'other')   -- county road district
  ) as j(name, jtype)
  returning id, user_id, property_id, name
),
rates as (
  insert into tax_rates (user_id, jurisdiction_id, tax_year, rate)
  select j.user_id, j.id, r.yr, r.rate
  from jur j
  join (values
    ('Schertz Cibolo Universal City ISD', 2025, 0.010769::numeric),
    ('Schertz Cibolo Universal City ISD', 2024, 0.011369),
    ('City of Cibolo',                    2025, 0.005226),
    ('City of Cibolo',                    2024, 0.004990),
    ('Guadalupe County',                  2025, 0.002784),
    ('Guadalupe County',                  2024, 0.002627),
    ('Lateral Roads',                     2025, 0.000520),
    ('Lateral Roads',                     2024, 0.000540)
  ) as r(name, yr, rate) on r.name = j.name
  returning id
),
assessed as (
  insert into assessed_values (user_id, property_id, tax_year, land_value_cents,
    improvement_value_cents, total_assessed_cents, source, notes)
  select p.user_id, p.id, a.yr, a.land, a.impr, a.total, 'county_record', a.note
  from prop p
  join (values
    (2025, 3711800, 25834200, 29546000, 'Certified 2025 value (Guadalupe CAD acct 110923)'),
    (2026, 3933700, 26532500, 30466200, '2026 CAD value, not yet certified')
  ) as a(yr, land, impr, total, note) on true
  returning id
),
exempt as (
  insert into tax_exemptions (user_id, property_id, jurisdiction_id, exemption_type,
    calc_method, flat_amount_cents, percent, min_amount_cents, effective_tax_year, applied, notes)
  select j.user_id, j.property_id, j.id, 'homestead', e.method::exemption_calc_method,
         e.flat, e.pct, e.minc, 2027, false, e.note
  from jur j
  join (values
    ('Schertz Cibolo Universal City ISD', 'flat_amount',        14000000::bigint, null::numeric,  null::bigint,   'General homestead $140,000 (TX school). Effective TY2027 (own+reside 1/1/2027).'),
    ('City of Cibolo',                    'flat_amount',        500000::bigint,   null::numeric,  null::bigint,   'City homestead $5,000. Effective TY2027.'),
    ('Guadalupe County',                  'percent_of_assessed', null::bigint,    0.0100::numeric, 500000::bigint, 'County homestead 1% of assessed, min $5,000. Effective TY2027.'),
    ('Lateral Roads',                     'percent_of_assessed', 300000::bigint,  0.0100::numeric, null::bigint,   'Lateral Roads homestead 1% + $3,000. Effective TY2027.')
  ) as e(name, method, flat, pct, minc, note) on e.name = j.name
  returning id
)
select
  (select count(*) from txn)      as transactions,
  (select count(*) from jur)      as jurisdictions,
  (select count(*) from rates)    as tax_rates,
  (select count(*) from assessed) as assessed_values,
  (select count(*) from exempt)   as exemptions;
