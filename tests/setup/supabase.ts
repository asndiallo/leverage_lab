import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars for tests — is `supabase start` running and .env.local populated?",
  );
}

// Bypasses RLS entirely (service_role) — used only for fixture setup/teardown,
// never to exercise application behavior itself.
export const adminClient: SupabaseClient<Database> = createClient(
  URL,
  SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

export type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
};

/** A fresh, confirmed auth user with a signed-in anon-key client (RLS applies normally). */
export async function createTestUser(prefix = "test"): Promise<TestUser> {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const password = "test-password-12345";

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("createTestUser: createUser returned no user");

  const client = createClient<Database>(URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId);
}

/** Sign in as an existing test user with a brand-new client instance. */
export async function signInAs(
  email: string,
  password: string,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}
