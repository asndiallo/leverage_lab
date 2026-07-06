"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

// Mark the property's homestead exemptions filed / not filed.
export async function setHomesteadFiled(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const propertyId = String(formData.get("property_id") ?? "");
  const filed = String(formData.get("filed") ?? "") === "true";
  const { error } = await supabase
    .from("tax_exemptions")
    .update({ applied: filed })
    .eq("property_id", propertyId)
    .eq("exemption_type", "homestead");
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}
