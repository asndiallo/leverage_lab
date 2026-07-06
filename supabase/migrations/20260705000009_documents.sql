-- =============================================================================
-- Leverage Lab — 0009: document management
-- A `documents` table (property-scoped, single optional link to one transaction
-- OR one lease) backed by a private Storage bucket. Files are served only via
-- short-lived signed URLs. Supersedes the unused transactions.receipt_url.
-- =============================================================================

create type document_type as enum (
  'receipt', 'lease', 'closing_disclosure', 'tax_document',
  'insurance', 'statement', 'appraisal', 'other'
);

create table documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  property_id    uuid not null references properties(id) on delete cascade,
  -- single association: a document may point at one transaction OR one lease.
  -- Multi-entry docs (e.g. a closing disclosure) stay property-level (both null)
  -- and surface on related transaction pages as closing documents.
  transaction_id uuid references transactions(id) on delete set null,
  lease_id       uuid references leases(id) on delete set null,

  storage_path   text not null unique,          -- path within the private 'documents' bucket
  file_name      text not null,                 -- original upload name
  mime_type      text,
  size_bytes     bigint,
  doc_type       document_type not null default 'other',
  title          text,
  notes          text,
  uploaded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index documents_property_idx on documents(property_id);
create index documents_transaction_idx on documents(transaction_id);
create index documents_lease_idx on documents(lease_id);
create index documents_user_idx on documents(user_id);

-- The one-column receipt pointer is superseded by this table (DRY).
alter table transactions drop column if exists receipt_url;

-- RLS (owner-scoped, same shape as every other table).
alter table documents enable row level security;
alter table documents force row level security;
create policy documents_select on documents for select using (user_id = auth.uid());
create policy documents_insert on documents for insert with check (user_id = auth.uid());
create policy documents_update on documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy documents_delete on documents for delete using (user_id = auth.uid());

grant select, insert, update, delete on documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: a private bucket. Objects live under {user_id}/{property_id}/... and
-- each user may only touch their own top-level folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents bucket — read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents bucket — insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents bucket — update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents bucket — delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
