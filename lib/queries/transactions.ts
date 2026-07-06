import { createClient } from "@/lib/supabase/server";
import type { Transaction, CategoryGroup, TransactionDirection } from "@/types/database";

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
