"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { firstError, money, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

const snapshotSchema = z.object({
  property_id: z.string().uuid(),
  snapshot_date: z.string().min(1, "Date is required"),
  estimated_value: money,
  source: z.enum(["zillow_estimate", "appraisal", "manual"]),
  notes: z.string().optional().or(z.literal("")),
});

export async function addMarketSnapshot(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = snapshotSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    snapshot_date: String(formData.get("snapshot_date") ?? ""),
    estimated_value: String(formData.get("estimated_value") ?? ""),
    source: String(formData.get("source") ?? "manual"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("market_snapshots").insert({
    user_id: user.id,
    property_id: v.property_id,
    snapshot_date: v.snapshot_date,
    estimated_value_cents: dollarsToCents(v.estimated_value),
    source: v.source,
    notes: v.notes || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  return { ok: true };
}

export async function deleteMarketSnapshot(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const { error } = await supabase
    .from("market_snapshots")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}
