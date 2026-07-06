import { createClient } from "@/lib/supabase/server";
import type {
  Property,
  Loan,
  EscrowSchedule,
  PropertyYields,
  MonthlyCashflow,
  TaxBreakdownRow,
  Transaction,
  CategoryGroup,
  TransactionDirection,
  DocumentRecord,
} from "@/types/database";

export type DocumentWithProperty = DocumentRecord & {
  properties: { address: string; city: string; state: string } | null;
};

export type LinkedDocument = { link_id: string; doc: DocumentRecord };

// A transaction joined to its category metadata (group/direction/label).
export type TransactionWithCategory = Transaction & {
  transaction_categories: {
    category_group: CategoryGroup;
    direction: TransactionDirection;
    label: string;
  } | null;
};

export async function getCategories(): Promise<
  { code: string; label: string; category_group: CategoryGroup }[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transaction_categories")
    .select("code, label, category_group")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProperties(): Promise<Property[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProperty(id: string): Promise<Property | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPortfolioYields(): Promise<PropertyYields[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("v_property_yields").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getPropertyYields(id: string): Promise<PropertyYields | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_property_yields")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLoans(id: string): Promise<Loan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("property_id", id)
    .order("funding_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLoanPayments(
  id: string,
): Promise<import("@/types/database").LoanPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_loan_payment")
    .select("*")
    .eq("property_id", id);
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentEscrow(
  id: string,
  asof: string,
): Promise<EscrowSchedule | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_current_escrow", {
    p_property_id: id,
    p_asof: asof,
  });
  if (error) throw error;
  // RPC returning a composite yields the row object (or null-ish with null id).
  const row = data as EscrowSchedule | null;
  return row && row.id ? row : null;
}

export async function getCashflowRange(
  id: string,
  start: string,
  months: number,
): Promise<MonthlyCashflow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_cashflow_range", {
    p_property_id: id,
    p_start: start,
    p_months: months,
  });
  if (error) throw error;
  return data ?? [];
}

/** Latest tax year that actually has adopted rates for this property. */
export async function getLatestTaxRateYear(id: string): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tax_rates")
    .select("tax_year, taxing_jurisdictions!inner(property_id)")
    .eq("taxing_jurisdictions.property_id", id)
    .order("tax_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.tax_year ?? null;
}

export async function getTaxBreakdown(id: string, year: number): Promise<TaxBreakdownRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_tax_breakdown", {
    p_property_id: id,
    p_tax_year: year,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getTaxBasisCents(id: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_tax_basis_cents", { p_property_id: id });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getTransactions(id: string): Promise<TransactionWithCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, transaction_categories(category_group, direction, label)")
    .eq("property_id", id)
    .order("txn_date", { ascending: true });
  if (error) throw error;
  return (data as unknown as TransactionWithCategory[]) ?? [];
}

export async function getTransaction(txnId: string): Promise<TransactionWithCategory | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, transaction_categories(category_group, direction, label)")
    .eq("id", txnId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as TransactionWithCategory) ?? null;
}

// --- Documents -------------------------------------------------------------

export async function getPropertyDocuments(propertyId: string): Promise<DocumentRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Documents linked to a transaction (with the link id, for unlinking). */
export async function getTransactionDocuments(txnId: string): Promise<LinkedDocument[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("document_links")
    .select("id, documents(*)")
    .eq("transaction_id", txnId);
  if (error) throw error;
  return ((data as unknown as { id: string; documents: DocumentRecord | null }[]) ?? [])
    .filter((r) => r.documents)
    .map((r) => ({ link_id: r.id, doc: r.documents as DocumentRecord }));
}

/** Property docs not linked to any transaction or lease (general/property-level). */
export async function getUnlinkedPropertyDocuments(propertyId: string): Promise<DocumentRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_links(id)")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as (DocumentRecord & { document_links: { id: string }[] })[]) ?? [])
    .filter((d) => (d.document_links?.length ?? 0) === 0);
}

/** Property docs not yet linked to this transaction — candidates to attach. */
export async function getLinkableDocuments(
  propertyId: string,
  txnId: string,
): Promise<DocumentRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_links(transaction_id)")
    .eq("property_id", propertyId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as (DocumentRecord & {
    document_links: { transaction_id: string | null }[];
  })[]) ?? []).filter((d) => !d.document_links?.some((l) => l.transaction_id === txnId));
}

export async function getAllDocuments(): Promise<DocumentWithProperty[]> {
  const supabase = createClient();
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
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}
