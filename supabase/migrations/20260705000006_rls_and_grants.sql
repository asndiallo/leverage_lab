-- =============================================================================
-- Leverage Lab — 0006: Row-Level Security
-- =============================================================================
-- Access is scoped to PROPERTY MEMBERSHIP, not row ownership: every co-owner of
-- a property (see property_members, 0002) has full, equal access to everything
-- under it. `is_property_member()` is the single predicate every policy below
-- is built from, so the membership rule only needs to be right in one place.
--
-- It's SECURITY DEFINER so it can read property_members regardless of the
-- caller's own RLS visibility into that table (avoiding any self-referential
-- policy evaluation), and STABLE so Postgres can cache it within a statement.
--
-- Views are set SECURITY INVOKER so the underlying tables' RLS is evaluated as
-- the querying user (Postgres 15+ / Supabase). SQL/plpgsql functions default to
-- SECURITY INVOKER, so they too respect RLS.
-- =============================================================================

create or replace function is_property_member(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from property_members
    where property_id = p_property_id and user_id = auth.uid()
  );
$$;
revoke all on function is_property_member(uuid) from public;

-- tax_rates hangs off taxing_jurisdictions, not properties, directly.
create or replace function is_jurisdiction_member(p_jurisdiction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_property_member(property_id)
  from taxing_jurisdictions
  where id = p_jurisdiction_id;
$$;
revoke all on function is_jurisdiction_member(uuid) from public;

-- ---------------------------------------------------------------------------
-- accept_property_invite — the only way a property_members row for someone
-- other than the creator gets created. SECURITY DEFINER because the invitee
-- isn't a member yet and so can't otherwise see the property_invites row (or
-- insert into property_members, which has no client-facing insert policy).
-- Matches on email, not on who was signed in when the invite link was opened.
-- ---------------------------------------------------------------------------
create or replace function accept_property_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite property_invites;
  v_email  text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from property_invites
  where token = p_token and status = 'pending' and expires_at > now();

  if v_invite.id is null then
    raise exception 'This invite is invalid, expired, or already used';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'This invite was sent to a different email address';
  end if;

  insert into property_members (property_id, user_id, invited_by)
  values (v_invite.property_id, auth.uid(), v_invite.invited_by)
  on conflict (property_id, user_id) do nothing;

  update property_invites
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;

  return v_invite.property_id;
end;
$$;
revoke all on function accept_property_invite(uuid) from public;

-- ---------------------------------------------------------------------------
-- property_members_with_email — auth.users isn't exposed over PostgREST, so
-- the UI can't join emails onto property_members itself. SECURITY DEFINER lets
-- this read auth.users; the is_property_member() guard keeps it scoped to
-- callers who actually belong to the property (returns nothing otherwise).
-- ---------------------------------------------------------------------------
create or replace function property_members_with_email(p_property_id uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select pm.user_id, u.email, pm.created_at
  from property_members pm
  join auth.users u on u.id = pm.user_id
  where pm.property_id = p_property_id
    and is_property_member(p_property_id)
  order by pm.created_at asc;
$$;
revoke all on function property_members_with_email(uuid) from public;

-- ---------------------------------------------------------------------------
-- Property-scoped tables: identical membership-based policy shape on each.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  owned_tables text[] := array[
    'loans', 'escrow_schedules', 'property_settings',
    'taxing_jurisdictions', 'assessed_values', 'tax_exemptions',
    'leases', 'vacancy_periods', 'transactions',
    'market_snapshots', 'utility_accounts'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format($p$
      create policy %1$s_select on %1$I
        for select using (is_property_member(property_id));
    $p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I
        for insert with check (is_property_member(property_id));
    $p$, t);
    execute format($p$
      create policy %1$s_update on %1$I
        for update using (is_property_member(property_id)) with check (is_property_member(property_id));
    $p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I
        for delete using (is_property_member(property_id));
    $p$, t);
  end loop;
end;
$$;

-- properties: update/delete follow membership. Insert is instead gated on the
-- row naming its own creator, because a brand-new row has no property_members
-- entry yet — that's added by the properties_after_insert_add_creator trigger
-- (0002), which runs AFTER INSERT. Select follows membership OR creatorship
-- (not just membership): `insert ... returning` — which is exactly what
-- supabase-js's `.insert().select()` issues, including addProperty() — re-checks
-- the SELECT policy against the new row before that trigger's effects are
-- visible to it, so a membership-only SELECT policy would make every property
-- creation fail with "new row violates row-level security policy" even though
-- the INSERT itself was allowed.
alter table properties enable row level security;
alter table properties force row level security;
create policy properties_select on properties
  for select using (is_property_member(id) or user_id = auth.uid());
create policy properties_insert on properties
  for insert with check (user_id = auth.uid());
create policy properties_update on properties
  for update using (is_property_member(id)) with check (is_property_member(id));
create policy properties_delete on properties
  for delete using (is_property_member(id));

-- tax_rates: keyed off jurisdiction_id, not property_id.
alter table tax_rates enable row level security;
alter table tax_rates force row level security;
create policy tax_rates_select on tax_rates
  for select using (is_jurisdiction_member(jurisdiction_id));
create policy tax_rates_insert on tax_rates
  for insert with check (is_jurisdiction_member(jurisdiction_id));
create policy tax_rates_update on tax_rates
  for update using (is_jurisdiction_member(jurisdiction_id)) with check (is_jurisdiction_member(jurisdiction_id));
create policy tax_rates_delete on tax_rates
  for delete using (is_jurisdiction_member(jurisdiction_id));

-- property_members: any member can see the roster (to show co-owners in the
-- UI). No insert/update/delete policy for `authenticated` at all — the only
-- writes are the properties_after_insert_add_creator trigger and
-- accept_property_invite(), both SECURITY DEFINER, so direct client writes are
-- always denied regardless of the blanket table grant below.
alter table property_members enable row level security;
alter table property_members force row level security;
create policy property_members_select on property_members
  for select using (is_property_member(property_id));

-- property_invites: any member can view/create/revoke invites for a property
-- they belong to (equal rights — no separate "admin" owner role). Accepting an
-- invite goes through accept_property_invite(), not a direct row insert, so
-- there's no policy letting an invitee touch this table before they're a member.
alter table property_invites enable row level security;
alter table property_invites force row level security;
create policy property_invites_select on property_invites
  for select using (is_property_member(property_id));
create policy property_invites_insert on property_invites
  for insert with check (is_property_member(property_id) and invited_by = auth.uid());
create policy property_invites_update on property_invites
  for update using (is_property_member(property_id)) with check (is_property_member(property_id));
create policy property_invites_delete on property_invites
  for delete using (is_property_member(property_id));

-- Global reference data: readable by any authenticated user, writable by none
-- (seeded via migration only).
alter table transaction_categories enable row level security;
create policy transaction_categories_read on transaction_categories
  for select using (auth.role() = 'authenticated');

-- Evaluate view RLS as the caller, not the view owner.
alter view v_loan_payment     set (security_invoker = on);
alter view v_property_yields  set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Grants. RLS restricts WHICH ROWS a user sees; the role still needs table and
-- function access (RLS alone does not grant it). `anon` (unauthenticated) gets
-- nothing. The default-privileges grant extends the same access to tables
-- created in later migrations (e.g. documents).
-- ---------------------------------------------------------------------------
-- service_role bypasses RLS (it's how admin/backend scripts and this app's
-- own auth.admin.* calls work), but bypassing RLS is orthogonal to having a
-- table grant at all — without this, service_role gets a bare "permission
-- denied", not just an RLS denial.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

grant execute on function mortgage_monthly_pi(bigint, numeric, integer)  to authenticated;
grant execute on function property_current_escrow(uuid, date)            to authenticated;
grant execute on function property_annual_tax_cents(uuid, integer)       to authenticated;
grant execute on function property_tax_basis_cents(uuid)                 to authenticated;
grant execute on function property_monthly_cashflow(uuid, date)          to authenticated;
grant execute on function property_cashflow_range(uuid, date, integer)   to authenticated;
grant execute on function property_tax_breakdown(uuid, integer)          to authenticated;
grant execute on function property_tax_with_homestead_cents(uuid, integer) to authenticated;

grant execute on function is_property_member(uuid)             to authenticated;
grant execute on function is_jurisdiction_member(uuid)         to authenticated;
grant execute on function accept_property_invite(uuid)         to authenticated;
grant execute on function property_members_with_email(uuid)    to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
