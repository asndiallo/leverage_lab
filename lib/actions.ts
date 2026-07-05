"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dollarsToCents } from "@/lib/format";
import type { ActionState } from "@/lib/action-types";
import type { TransactionCategoryCode } from "@/types/database";

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

const optionalEmail = z.string().email().optional().or(z.literal(""));
const money = z.coerce.number().nonnegative();

// ---------------------------------------------------------------------------
// Lease
// ---------------------------------------------------------------------------
const leaseSchema = z
  .object({
    property_id: z.string().uuid(),
    unit_identifier: z.string().min(1, "Unit is required"),
    tenant_name: z.string().min(1, "Tenant name is required"),
    tenant_email: optionalEmail,
    rent_amount: money,
    lease_start: z.string().min(1, "Start date is required"),
    lease_end: z.string().optional().or(z.literal("")),
    flat_utility_charge: money.optional(),
    utilities_included: z.boolean(),
    status: z.enum(["pending", "active", "ended"]),
  })
  .refine((v) => !v.lease_end || v.lease_end >= v.lease_start, {
    message: "Lease end must be on or after the start date",
  });

export async function addLease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = leaseSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    unit_identifier: String(formData.get("unit_identifier") ?? ""),
    tenant_name: String(formData.get("tenant_name") ?? ""),
    tenant_email: String(formData.get("tenant_email") ?? ""),
    rent_amount: String(formData.get("rent_amount") ?? ""),
    lease_start: String(formData.get("lease_start") ?? ""),
    lease_end: String(formData.get("lease_end") ?? ""),
    flat_utility_charge: String(formData.get("flat_utility_charge") ?? "0"),
    utilities_included: formData.get("utilities_included") === "on",
    status: String(formData.get("status") ?? "pending"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("leases").insert({
    user_id: user.id,
    property_id: v.property_id,
    unit_identifier: v.unit_identifier,
    tenant_name: v.tenant_name,
    tenant_email: v.tenant_email || null,
    rent_amount_cents: dollarsToCents(v.rent_amount),
    lease_start: v.lease_start,
    lease_end: v.lease_end || null,
    utilities_included: v.utilities_included,
    flat_utility_charge_cents: dollarsToCents(v.flat_utility_charge ?? 0),
    status: v.status,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

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

// ---------------------------------------------------------------------------
// New property (+ its purchase loan, escrow, and default settings)
// ---------------------------------------------------------------------------
const propertySchema = z.object({
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "Use the 2-letter state code"),
  zip: z.string().min(1, "ZIP is required"),
  cad_account: z.string().optional().or(z.literal("")),
  parcel_id: z.string().optional().or(z.literal("")),
  purchase_price: money,
  purchase_date: z.string().min(1, "Purchase date is required"),
  property_type: z.enum([
    "single_family",
    "duplex",
    "triplex",
    "fourplex",
    "townhouse",
    "condo",
    "other",
  ]),
  status: z.enum(["pending", "active", "sold"]),
  // loan (optional block)
  lender: z.string().optional().or(z.literal("")),
  loan_amount: money.optional(),
  interest_rate: z.coerce.number().min(0).optional(),
  term_years: z.coerce.number().int().positive().optional(),
  funding_date: z.string().optional().or(z.literal("")),
  first_payment_date: z.string().optional().or(z.literal("")),
});

export async function addProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = propertySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { data: property, error: pErr } = await supabase
    .from("properties")
    .insert({
      user_id: user.id,
      address: v.address,
      city: v.city,
      state: v.state.toUpperCase(),
      zip: v.zip,
      cad_account: v.cad_account || null,
      parcel_id: v.parcel_id || null,
      purchase_price_cents: dollarsToCents(v.purchase_price),
      purchase_date: v.purchase_date,
      property_type: v.property_type,
      status: v.status,
    })
    .select("id")
    .single();
  if (pErr || !property) return { error: pErr?.message ?? "Could not create property" };

  // default reserves (5% / 1%)
  await supabase.from("property_settings").insert({ user_id: user.id, property_id: property.id });

  // optional loan
  if (v.loan_amount && v.interest_rate != null && v.term_years) {
    const { error: lErr } = await supabase.from("loans").insert({
      user_id: user.id,
      property_id: property.id,
      loan_type: "original",
      lender: v.lender || null,
      original_amount_cents: dollarsToCents(v.loan_amount),
      interest_rate: v.interest_rate,
      rate_type: "fixed",
      term_months: v.term_years * 12,
      funding_date: v.funding_date || null,
      first_payment_date: v.first_payment_date || null,
      status: "active",
    });
    if (lErr) return { error: lErr.message };
  }

  revalidatePath("/");
  return { ok: true };
}
