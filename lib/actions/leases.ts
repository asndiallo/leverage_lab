"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { firstError, money, optionalEmail, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

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

export async function addLease(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

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
