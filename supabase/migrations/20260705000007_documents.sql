-- =============================================================================
-- Leverage Lab — 0007: document management
-- A `documents` table (property-scoped) backed by a private Storage bucket, plus
-- a `document_links` join table so one document (e.g. a Closing Disclosure) can
-- back many transactions/leases. Files are served only via signed URLs.
-- =============================================================================

create table documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  storage_path text not null unique,             -- path within the private 'documents' bucket
  file_name    text not null,                    -- original upload name
  mime_type    text,
  size_bytes   bigint,
  doc_type     document_type not null default 'other',
  title        text,
  notes        text,
  uploaded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index documents_property_idx on documents(property_id);
create index documents_user_idx on documents(user_id);

-- Many-to-many links. Each link targets exactly one entry (a transaction OR a lease).
create table document_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  document_id    uuid not null references documents(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  lease_id       uuid references leases(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint document_link_one_target check (num_nonnulls(transaction_id, lease_id) = 1)
);
create unique index document_links_txn_uniq
  on document_links(document_id, transaction_id) where transaction_id is not null;
create unique index document_links_lease_uniq
  on document_links(document_id, lease_id) where lease_id is not null;
create index document_links_document_idx on document_links(document_id);
create index document_links_transaction_idx on document_links(transaction_id);
create index document_links_lease_idx on document_links(lease_id);
create index document_links_user_idx on document_links(user_id);

-- RLS + grants (owner-scoped). Table grants also flow from the default
-- privileges set in 0006, but we grant explicitly for clarity.
alter table documents enable row level security;
alter table documents force row level security;
create policy documents_select on documents for select using (user_id = auth.uid());
create policy documents_insert on documents for insert with check (user_id = auth.uid());
create policy documents_update on documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy documents_delete on documents for delete using (user_id = auth.uid());

alter table document_links enable row level security;
alter table document_links force row level security;
create policy document_links_select on document_links for select using (user_id = auth.uid());
create policy document_links_insert on document_links for insert with check (user_id = auth.uid());
create policy document_links_update on document_links for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy document_links_delete on document_links for delete using (user_id = auth.uid());

grant select, insert, update, delete on documents, document_links to authenticated;

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
