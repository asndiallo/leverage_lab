import { createClient } from "@/lib/supabase/server";
import type { DocumentRecord } from "@/types/database";

export type DocumentWithProperty = DocumentRecord & {
  properties: { address: string; city: string; state: string } | null;
};

export type LinkedDocument = { link_id: string; doc: DocumentRecord };

export async function getPropertyDocuments(
  propertyId: string,
): Promise<DocumentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Documents linked to a transaction (with the link id, for unlinking). */
export async function getTransactionDocuments(
  txnId: string,
): Promise<LinkedDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("id, documents(*)")
    .eq("transaction_id", txnId);
  if (error) throw error;
  return (
    (data as unknown as { id: string; documents: DocumentRecord | null }[]) ??
    []
  )
    .filter((r) => r.documents)
    .map((r) => ({ link_id: r.id, doc: r.documents as DocumentRecord }));
}

/** Documents linked to a set of leases, keyed by lease id — batched so the
 * property page can fetch every lease's attached document(s) in one query
 * instead of one per lease. */
export async function getLeaseDocuments(
  leaseIds: string[],
): Promise<Record<string, LinkedDocument[]>> {
  if (leaseIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("id, lease_id, documents(*)")
    .in("lease_id", leaseIds);
  if (error) throw error;
  const map: Record<string, LinkedDocument[]> = {};
  for (const row of (data as unknown as {
    id: string;
    lease_id: string | null;
    documents: DocumentRecord | null;
  }[]) ?? []) {
    if (!row.lease_id || !row.documents) continue;
    (map[row.lease_id] ??= []).push({ link_id: row.id, doc: row.documents });
  }
  return map;
}

/** Property docs not linked to any transaction or lease (general/property-level). */
export async function getUnlinkedPropertyDocuments(
  propertyId: string,
): Promise<DocumentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_links(id)")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (
    (data as unknown as (DocumentRecord & {
      document_links: { id: string }[];
    })[]) ?? []
  ).filter((d) => (d.document_links?.length ?? 0) === 0);
}

/** Property docs not yet linked to this transaction — candidates to attach. */
export async function getLinkableDocuments(
  propertyId: string,
  txnId: string,
): Promise<DocumentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_links(transaction_id)")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (
    (data as unknown as (DocumentRecord & {
      document_links: { transaction_id: string | null }[];
    })[]) ?? []
  ).filter((d) => !d.document_links?.some((l) => l.transaction_id === txnId));
}

export async function getAllDocuments(): Promise<DocumentWithProperty[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, properties(address, city, state)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as DocumentWithProperty[]) ?? [];
}

/** Batch-sign storage paths → { path: signedUrl }. RLS scopes to the user. */
export async function getSignedUrlMap(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}
