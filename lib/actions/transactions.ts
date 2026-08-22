"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { parseTransactionsCsv } from "@/lib/csv-transaction-parser";
import { firstError, money, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";
import type { TransactionCategoryCode } from "@/types/database";

const transactionSchema = z.object({
  property_id: z.string().uuid(),
  txn_date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  amount: money,
  description: z.string().optional().or(z.literal("")),
  paid_by: z.enum(["owner", "seller", "tenant"]),
  is_estimate: z.boolean(),
});

export async function addTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = transactionSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    txn_date: String(formData.get("txn_date") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    paid_by: String(formData.get("paid_by") ?? "owner"),
    is_estimate: formData.get("is_estimate") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    property_id: v.property_id,
    txn_date: v.txn_date,
    category: v.category as TransactionCategoryCode,
    amount_cents: dollarsToCents(v.amount),
    description: v.description || null,
    paid_by: v.paid_by,
    is_estimate: v.is_estimate,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  return { ok: true };
}

const updateTransactionSchema = transactionSchema.extend({
  id: z.string().uuid(),
});

export async function updateTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = updateTransactionSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    property_id: String(formData.get("property_id") ?? ""),
    txn_date: String(formData.get("txn_date") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    paid_by: String(formData.get("paid_by") ?? "owner"),
    is_estimate: formData.get("is_estimate") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase
    .from("transactions")
    .update({
      txn_date: v.txn_date,
      category: v.category as TransactionCategoryCode,
      amount_cents: dollarsToCents(v.amount),
      description: v.description || null,
      paid_by: v.paid_by,
      is_estimate: v.is_estimate,
    })
    .eq("id", v.id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath(`/properties/${v.property_id}/transactions/${v.id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransactions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const ids = String(formData.get("transaction_ids") ?? "")
    .split(",")
    .filter(Boolean);
  const propertyId = String(formData.get("property_id") ?? "");
  if (ids.length === 0) return { error: "No transactions selected" };

  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/");
  return { ok: true };
}

/** Extracts candidate rows from an uploaded bank CSV export without saving
 * anything — the caller shows them in an editable table (category, amount,
 * an include checkbox) and submits via importTransactionsCsv once reviewed.
 * Rows whose (date, amount) already exists for this property are flagged
 * as possible duplicates so the review UI can default them to excluded. */
export async function parseTransactionsFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const propertyId = String(formData.get("property_id") ?? "");
  if (!propertyId) return { error: "Missing property" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a CSV to parse" };
  if (file.size > 5 * 1024 * 1024) return { error: "File exceeds 5 MB" };

  const text = await file.text();
  const { rows, warnings } = parseTransactionsCsv(text);
  if (rows.length === 0) {
    return { error: warnings[0] ?? "No transactions found in that file" };
  }

  const dates = rows.map((r) => r.txn_date).sort();
  const { data: existing, error } = await supabase
    .from("transactions")
    .select("txn_date, amount_cents")
    .eq("property_id", propertyId)
    .gte("txn_date", dates[0])
    .lte("txn_date", dates[dates.length - 1]);
  if (error) return { error: error.message };

  const existingKeys = new Set(
    (existing ?? []).map((t) => `${t.txn_date}:${t.amount_cents}`),
  );
  const reviewRows = rows.map((r) => ({
    ...r,
    is_duplicate: existingKeys.has(`${r.txn_date}:${dollarsToCents(r.amount)}`),
  }));

  return { ok: true, parsedTransactions: { rows: reviewRows, warnings } };
}

const importRowSchema = z.object({
  txn_date: z.string().min(1),
  category: z.string().min(1, "Every selected row needs a category"),
  amount: money,
  description: z.string().optional().or(z.literal("")),
});

const importTransactionsCsvSchema = z.object({
  property_id: z.string().uuid(),
  rows: z.array(importRowSchema).min(1, "No transactions selected"),
});

/** Bulk-inserts the (reviewed/edited) rows from parseTransactionsFile as
 * actual, owner-paid transactions. */
export async function importTransactionsCsv(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  let rowsRaw: unknown;
  try {
    rowsRaw = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "Invalid import payload" };
  }

  const parsed = importTransactionsCsvSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    rows: rowsRaw,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("transactions").insert(
    v.rows.map((r) => ({
      user_id: user.id,
      property_id: v.property_id,
      txn_date: r.txn_date,
      category: r.category as TransactionCategoryCode,
      amount_cents: dollarsToCents(r.amount),
      description: r.description || null,
      paid_by: "owner" as const,
      is_estimate: false,
    })),
  );
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  return { ok: true };
}
