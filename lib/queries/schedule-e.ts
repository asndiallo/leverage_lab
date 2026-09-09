import { createClient } from "@/lib/supabase/server";
import type { RentalUsePeriod, ScheduleELineRow } from "@/types/database";

export async function getRentalUsePeriods(
  propertyId: string,
): Promise<RentalUsePeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rental_use_periods")
    .select("*")
    .eq("property_id", propertyId)
    .order("effective_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentRentalUse(
  propertyId: string,
  asOf?: string,
): Promise<RentalUsePeriod | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_current_rental_use", {
    p_property_id: propertyId,
    ...(asOf ? { p_asof: asOf } : {}),
  });
  if (error) throw error;
  // The RPC returns a single (possibly all-null) row when nothing matches.
  return data && data.id ? data : null;
}

/** Manual-else-auto rental-use % as of a date (leases + total_rooms when no
 * manual rental_use_periods override exists) — what the UI shows as "current". */
export async function getCurrentRentalUsePercent(
  propertyId: string,
  asOf?: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "property_current_rental_use_percent",
    {
      p_property_id: propertyId,
      ...(asOf ? { p_asof: asOf } : {}),
    },
  );
  if (error) throw error;
  return data ?? null;
}

export async function getAutoPlacedInService(
  propertyId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "property_auto_placed_in_service",
    { p_property_id: propertyId },
  );
  if (error) throw error;
  return data ?? null;
}

export async function getScheduleE(
  propertyId: string,
  taxYear: number,
): Promise<ScheduleELineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_schedule_e", {
    p_property_id: propertyId,
    p_tax_year: taxYear,
  });
  if (error) throw error;
  return data ?? [];
}
