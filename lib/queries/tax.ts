import { createClient } from "@/lib/supabase/server";
import type { TaxBreakdownRow, TaxingJurisdiction } from "@/types/database";

/** Every taxing jurisdiction on record for the property (not year-specific —
 * used to build the "add a tax year" form's per-jurisdiction rate inputs). */
export async function getTaxingJurisdictions(
  id: string,
): Promise<TaxingJurisdiction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("taxing_jurisdictions")
    .select("*")
    .eq("property_id", id)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Latest tax year that actually has adopted rates for this property. */
export async function getLatestTaxRateYear(id: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_rates")
    .select("tax_year, taxing_jurisdictions!inner(property_id)")
    .eq("taxing_jurisdictions.property_id", id)
    .order("tax_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.tax_year ?? null;
}

export async function getTaxBreakdown(
  id: string,
  year: number,
): Promise<TaxBreakdownRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_tax_breakdown", {
    p_property_id: id,
    p_tax_year: year,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getHomesteadStatus(
  id: string,
): Promise<{ filed: boolean; count: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_exemptions")
    .select("applied")
    .eq("property_id", id)
    .eq("exemption_type", "homestead");
  if (error) throw error;
  const rows = data ?? [];
  return {
    filed: rows.length > 0 && rows.every((r) => r.applied),
    count: rows.length,
  };
}

export async function getTaxWithHomesteadCents(
  id: string,
  year: number,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "property_tax_with_homestead_cents",
    {
      p_property_id: id,
      p_tax_year: year,
    },
  );
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getTaxBasisCents(id: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_tax_basis_cents", {
    p_property_id: id,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
