import type { Session } from "@supabase/supabase-js";

// Mirrors @supabase/ssr's cookie format exactly (see node_modules/@supabase/ssr
// dist/main/cookies.js and SupabaseClient.js's defaultStorageKey): the cookie
// name is derived from the first label of the Supabase URL's hostname, and the
// value is "base64-" + base64url(JSON.stringify(session)).
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
export const AUTH_COOKIE_NAME = `sb-${projectRef}-auth-token`;

export function sessionToCookieValue(session: Session): string {
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}
