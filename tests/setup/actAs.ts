import type { TestUser } from "./supabase";
import { setSessionCookie } from "./mockNext";
import { AUTH_COOKIE_NAME, sessionToCookieValue } from "./authCookie";

/** Make lib/actions.ts's createClient() (mocked next/headers) authenticate as
 * this test user for subsequent Server Action calls in the current test. */
export async function actAs(user: TestUser) {
  const {
    data: { session },
  } = await user.client.auth.getSession();
  if (!session) throw new Error(`actAs: ${user.email} has no active session`);
  setSessionCookie({
    name: AUTH_COOKIE_NAME,
    value: sessionToCookieValue(session),
  });
}

export function actAsSignedOut() {
  setSessionCookie(null);
}
