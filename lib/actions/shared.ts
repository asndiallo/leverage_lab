import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-types";

// Not itself a Server Action (no "use server" here — a "use server" file may
// only export async functions), just the bits every action in lib/actions/*
// shares.

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export const optionalEmail = z.string().email().optional().or(z.literal(""));
export const money = z.coerce.number().nonnegative();

type SupabaseServerClient = ReturnType<typeof createClient>;

type AuthResult =
  | { ok: true; supabase: SupabaseServerClient; user: User }
  | { ok: false; error: string };

/**
 * Every action starts by resolving the signed-in user and bailing out with
 * the same error shape if there isn't one. Callers do:
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return { error: auth.error };
 *   const { supabase, user } = auth;
 *
 * (an explicit `ok` discriminant, not `"error" in auth` — every field in
 * ActionState is optional, so `in`-narrowing a union against it doesn't
 * reliably discriminate)
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  return { ok: true, supabase, user };
}
