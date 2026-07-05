import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Magic-link callback. Supports both the PKCE `code` exchange and the
// `token_hash` verifyOtp flow, whichever the email link carries.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // Redirect on the SAME host the request arrived on (from the Host header), so
  // the session cookie — which is set for that host — is sent on the redirect.
  // Using request.url can yield a different host (localhost vs 127.0.0.1) and
  // silently drop the cookie.
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host")!;
  const base = `${proto}://${host}`;

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${base}${next}`);
  }

  return NextResponse.redirect(`${base}/login?error=link_invalid`);
}
