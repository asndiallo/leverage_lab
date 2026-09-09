"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { firstError, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

const rentalUsePeriodSchema = z.object({
  property_id: z.string().uuid(),
  effective_date: z.string().min(1, "Date is required"),
  rental_use_percent: z.coerce.number().min(0).max(100),
  method: z.enum(["square_footage", "room_count", "other"]),
  notes: z.string().optional().or(z.literal("")),
});

// rental_use_percent is entered in the UI as a whole-number percent (0-100)
// for readability but stored as a 0-1 fraction, same convention as every
// other rate/percentage column in this schema (see 0001's header).
export async function addRentalUsePeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = rentalUsePeriodSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    effective_date: String(formData.get("effective_date") ?? ""),
    rental_use_percent: String(formData.get("rental_use_percent") ?? ""),
    method: String(formData.get("method") ?? "square_footage"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("rental_use_periods").insert({
    user_id: user.id,
    property_id: v.property_id,
    effective_date: v.effective_date,
    rental_use_percent: v.rental_use_percent / 100,
    method: v.method,
    notes: v.notes || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  return { ok: true };
}

const totalRoomsSchema = z.object({
  property_id: z.string().uuid(),
  total_rooms: z.coerce.number().int().positive(),
});

// Unlocks auto-computed rental-use % from lease coverage (leased rooms /
// total_rooms) instead of the flat 100%-if-any-lease default — a separate
// action from updatePropertySettings so setting it doesn't force re-entering
// the vacancy/maintenance reserve rates too.
export async function updateTotalRooms(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = totalRoomsSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    total_rooms: String(formData.get("total_rooms") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase
    .from("property_settings")
    .update({ total_rooms: v.total_rooms })
    .eq("property_id", v.property_id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  return { ok: true };
}

export async function deleteRentalUsePeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const { error } = await supabase
    .from("rental_use_periods")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}
