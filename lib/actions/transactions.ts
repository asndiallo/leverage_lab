"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
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

const updateTransactionSchema = transactionSchema.extend({ id: z.string().uuid() });

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

  const ids = String(formData.get("transaction_ids") ?? "").split(",").filter(Boolean);
  const propertyId = String(formData.get("property_id") ?? "");
  if (ids.length === 0) return { error: "No transactions selected" };

  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/");
  return { ok: true };
}
