-- =============================================================================
-- Leverage Lab — 0008: privilege grants for the `authenticated` role
-- RLS restricts WHICH ROWS a user sees (user_id = auth.uid()); it does not grant
-- access to the table itself. Objects created in earlier migrations have no
-- grants, so the app (role `authenticated`) hit "permission denied". Grant the
-- role table/view/function access here — RLS continues to enforce ownership, and
-- `anon` (unauthenticated) still gets nothing, keeping this single-user private.
-- =============================================================================

grant usage on schema public to authenticated;

-- Tables + views (ALL TABLES includes views). RLS still gates rows; the
-- reference table transaction_categories only exposes SELECT via its policy.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- The computed helpers the UI calls via RPC (SECURITY INVOKER → run as the user).
grant execute on function property_current_escrow(uuid, date) to authenticated;
grant execute on function mortgage_monthly_pi(bigint, numeric, integer) to authenticated;

-- Future tables created by the migration role auto-grant to authenticated too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
