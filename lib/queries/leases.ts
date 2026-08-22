import { createClient } from "@/lib/supabase/server";
import type { Lease } from "@/types/database";

export async function getLeases(propertyId: string): Promise<Lease[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leases")
    .select("*")
    .eq("property_id", propertyId)
    .order("lease_start", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
