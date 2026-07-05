-- =============================================================================
-- Bootstrap the single owner auth account.
-- Phase 2 will build the real auth UI; this just creates the row so property
-- data can be owned and RLS can be exercised. Idempotent by email.
-- Run with:  psql "$DB_URL" -v owner_email=you@example.com -v owner_pw="$(cat pwfile)"
-- =============================================================================

-- NOTE: GoTrue scans the token columns as non-null strings — a bare insert that
-- leaves them NULL makes user lookups fail ("Database error finding user"), so
-- they must be set to '' (empty string), not NULL.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  :'owner_email',
  crypt(:'owner_pw', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users where email = :'owner_email');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email = :'owner_email'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

select id as owner_id, email, created_at from auth.users where email = :'owner_email';
