import { createClient } from "@/lib/supabase/server";
import type { TaxBreakdownRow } from "@/types/database";

/** Latest tax year that actually has adopted rates for this property. */
export async function getLatestTaxRateYear(id: string): Promise<number | null> {
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_tax_basis_cents", {
    p_property_id: id,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
