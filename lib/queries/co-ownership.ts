import { createClient } from "@/lib/supabase/server";
import type { PropertyInvite } from "@/types/database";

export type PropertyMemberWithEmail = { user_id: string; email: string; created_at: string };

export async function getPropertyMembers(propertyId: string): Promise<PropertyMemberWithEmail[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("property_members_with_email", {
    p_property_id: propertyId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getPendingInvites(propertyId: string): Promise<PropertyInvite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("property_invites")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
