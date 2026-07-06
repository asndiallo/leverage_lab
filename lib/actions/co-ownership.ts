"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

// Invite a co-owner (e.g. a spouse) to a property, or revoke a pending
// invite. There's no automated invite email (Resend's sandbox sender can't
// reach anyone but the account owner until a custom domain is verified), so
// the inviter copies the link themselves and sends it however they like.
export async function inviteCoOwner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const propertyId = String(formData.get("property_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = z.string().email().safeParse(email);
  if (!propertyId || !parsed.success) return { error: "Enter a valid email address" };

  const { data: invite, error } = await supabase
    .from("property_invites")
    .insert({ property_id: propertyId, email, invited_by: user.id })
    .select("token")
    .single();
  if (error || !invite) return { error: error?.message ?? "Could not create invite" };

  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  const inviteUrl = `${proto}://${host}/invites/${invite.token}`;

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true, inviteUrl };
}

export async function revokeInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const inviteId = String(formData.get("invite_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const { error } = await supabase
    .from("property_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}
