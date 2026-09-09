"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { firstError, money, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

// One certificate/appraisal year at a time — add or correct all of a
// property's jurisdiction rates for that year in one submission, since
// that's how the data actually arrives (a single county tax certificate
// listing every unit's rate for the year). Upserts on (jurisdiction_id,
// tax_year) so re-submitting the same year corrects it rather than erroring.
const taxYearSchema = z.object({
  property_id: z.string().uuid(),
  tax_year: z.coerce.number().int().min(2000).max(2100),
});

export async function addTaxYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = taxYearSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    tax_year: String(formData.get("tax_year") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { property_id, tax_year } = parsed.data;

  // Rate inputs are named rate_<jurisdiction_id> (see AddTaxYearForm) since
  // the set of jurisdictions is dynamic per property.
  const rows: { user_id: string; jurisdiction_id: string; tax_year: number; rate: number }[] =
    [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rate_")) continue;
    const raw = String(value).trim();
    if (raw === "") continue; // leaving a jurisdiction blank skips it, not a zero-rate row
    const parsedRate = z.coerce.number().nonnegative().safeParse(raw);
    if (!parsedRate.success) {
      return { error: `Invalid rate: "${raw}"` };
    }
    rows.push({
      user_id: user.id,
      jurisdiction_id: key.slice("rate_".length),
      tax_year,
      // Entered as $ per $100 of value (matches the tax certificate/UI
      // display) — tax_rates.rate is stored per $1 (see 0003's header).
      rate: parsedRate.data / 100,
    });
  }
  if (rows.length === 0) {
    return { error: "Enter at least one jurisdiction's rate" };
  }

  const { error } = await supabase
    .from("tax_rates")
    .upsert(rows, { onConflict: "jurisdiction_id,tax_year" });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${property_id}`);
  return { ok: true };
}

const assessedValueSchema = z.object({
  property_id: z.string().uuid(),
  tax_year: z.coerce.number().int().min(2000).max(2100),
  land_value: money,
  improvement_value: money,
  total_assessed: money,
  capped_assessed: money.optional(),
  source: z.enum(["county_record", "estimate"]),
  notes: z.string().optional().or(z.literal("")),
});

export async function addAssessedValue(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = assessedValueSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    tax_year: String(formData.get("tax_year") ?? ""),
    land_value: String(formData.get("land_value") ?? "0"),
    improvement_value: String(formData.get("improvement_value") ?? "0"),
    total_assessed: String(formData.get("total_assessed") ?? ""),
    capped_assessed: formData.get("capped_assessed")
      ? String(formData.get("capped_assessed"))
      : undefined,
    source: String(formData.get("source") ?? "county_record"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  // Same (property_id, tax_year, source) row = a correction; upsert rather
  // than erroring on the unique constraint (0003).
  const { error } = await supabase.from("assessed_values").upsert(
    {
      user_id: user.id,
      property_id: v.property_id,
      tax_year: v.tax_year,
      land_value_cents: dollarsToCents(v.land_value),
      improvement_value_cents: dollarsToCents(v.improvement_value),
      total_assessed_cents: dollarsToCents(v.total_assessed),
      capped_assessed_cents:
        v.capped_assessed != null ? dollarsToCents(v.capped_assessed) : null,
      source: v.source,
      notes: v.notes || null,
    },
    { onConflict: "property_id,tax_year,source" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  return { ok: true };
}
