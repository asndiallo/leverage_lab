-- =============================================================================
-- Leverage Lab — 0010: many-to-many document links
-- A single document (e.g. the Closing Disclosure) can back many transactions.
-- Replaces the single transaction_id/lease_id FKs on `documents` with a join
-- table. Documents still belong to one property; links attach them to entries.
-- =============================================================================

create table document_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  document_id    uuid not null references documents(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  lease_id       uuid references leases(id) on delete cascade,
  created_at     timestamptz not null default now(),

  -- each link targets exactly one entry
  constraint document_link_one_target check (num_nonnulls(transaction_id, lease_id) = 1)
);
-- no duplicate (document, target) links
create unique index document_links_txn_uniq
  on document_links(document_id, transaction_id) where transaction_id is not null;
create unique index document_links_lease_uniq
  on document_links(document_id, lease_id) where lease_id is not null;
create index document_links_document_idx on document_links(document_id);
create index document_links_transaction_idx on document_links(transaction_id);
create index document_links_lease_idx on document_links(lease_id);
create index document_links_user_idx on document_links(user_id);

-- Migrate the existing single-FK associations into link rows.
insert into document_links (user_id, document_id, transaction_id)
  select user_id, id, transaction_id from documents where transaction_id is not null;
insert into document_links (user_id, document_id, lease_id)
  select user_id, id, lease_id from documents where lease_id is not null;

alter table documents drop column if exists transaction_id;
alter table documents drop column if exists lease_id;

-- RLS + grants (owner-scoped, same shape as every other table).
alter table document_links enable row level security;
alter table document_links force row level security;
create policy document_links_select on document_links for select using (user_id = auth.uid());
create policy document_links_insert on document_links for insert with check (user_id = auth.uid());
create policy document_links_update on document_links for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy document_links_delete on document_links for delete using (user_id = auth.uid());

grant select, insert, update, delete on document_links to authenticated;
