-- =============================================================================
-- Leverage Lab — 0006: Row-Level Security
-- =============================================================================
-- Multi-user is "out of scope" behaviorally, but the ISOLATION is built now so
-- turning it on later is zero-migration. Every user-owned table is locked to
-- its owner via `user_id = auth.uid()`. The single reference table
-- (transaction_categories) is world-readable to authenticated users.
--
-- Views are set SECURITY INVOKER so the underlying tables' RLS is evaluated as
-- the querying user (Postgres 15+ / Supabase). SQL/plpgsql functions default to
-- SECURITY INVOKER, so they too respect RLS.
-- =============================================================================

-- Owner-scoped tables: identical policy shape on each.
do $$
declare
  t text;
  owned_tables text[] := array[
    'properties', 'loans', 'escrow_schedules', 'property_settings',
    'taxing_jurisdictions', 'tax_rates', 'assessed_values', 'tax_exemptions',
    'leases', 'vacancy_periods', 'transactions',
    'market_snapshots', 'utility_accounts'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format($p$
      create policy %1$s_select on %1$I
        for select using (user_id = auth.uid());
    $p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I
        for insert with check (user_id = auth.uid());
    $p$, t);
    execute format($p$
      create policy %1$s_update on %1$I
        for update using (user_id = auth.uid()) with check (user_id = auth.uid());
    $p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I
        for delete using (user_id = auth.uid());
    $p$, t);
  end loop;
end;
$$;

-- Global reference data: readable by any authenticated user, writable by none
-- (seeded via migration only).
alter table transaction_categories enable row level security;
create policy transaction_categories_read on transaction_categories
  for select using (auth.role() = 'authenticated');

-- Evaluate view RLS as the caller, not the view owner.
alter view v_loan_payment     set (security_invoker = on);
alter view v_property_yields  set (security_invoker = on);
