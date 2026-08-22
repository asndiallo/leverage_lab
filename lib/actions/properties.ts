"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { firstError, money, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

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

export async function addProperty(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

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
  if (pErr || !property)
    return { error: pErr?.message ?? "Could not create property" };

  // default reserves (5% / 1%)
  await supabase
    .from("property_settings")
    .insert({ user_id: user.id, property_id: property.id });

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

// ---------------------------------------------------------------------------
// Reserve settings (vacancy / maintenance rates used by property_monthly_cashflow)
// ---------------------------------------------------------------------------
const propertySettingsSchema = z.object({
  property_id: z.string().uuid(),
  vacancy_reserve_rate: z.coerce
    .number()
    .min(0, "Must be 0 or greater")
    .max(100, "Must be 100 or less"),
  maintenance_reserve_rate: z.coerce
    .number()
    .min(0, "Must be 0 or greater")
    .max(100, "Must be 100 or less"),
});

export async function updatePropertySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = propertySettingsSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    vacancy_reserve_rate: String(formData.get("vacancy_reserve_rate") ?? ""),
    maintenance_reserve_rate: String(
      formData.get("maintenance_reserve_rate") ?? "",
    ),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase
    .from("property_settings")
    .update({
      vacancy_reserve_rate: v.vacancy_reserve_rate / 100,
      maintenance_reserve_rate: v.maintenance_reserve_rate / 100,
    })
    .eq("property_id", v.property_id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  return { ok: true };
}
