"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/forms/formPrimitives";
import GoogleIcon from "@/components/GoogleIcon";

type Mode = "signin" | "signup" | "forgot" | "magic";

const COPY: Record<Mode, { title: string; cta: string }> = {
  signin: { title: "Sign in to your account.", cta: "Sign in" },
  signup: { title: "Create an account.", cta: "Create account" },
  forgot: { title: "Reset your password.", cta: "Send reset link" },
  magic: { title: "Sign in with a magic link.", cta: "Send magic link" },
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSent(false);
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google, so no further state change needed.
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) setError(error.message);
      else window.location.assign("/");
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      setLoading(false);
      if (error) setError(error.message);
      else window.location.assign("/");
      return;
    }

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      setLoading(false);
      if (error) setError(error.message);
      else setSent(true);
      return;
    }

    // magic link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  const needsPassword = mode === "signin" || mode === "signup";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Leverage Lab</h1>
        <p className="mt-1 text-sm text-muted">{COPY[mode].title}</p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-border bg-canvas p-4 text-sm">
            Check your email for a link.
            <span className="mt-1 block text-muted">
              Local dev: open Mailpit at{" "}
              <a className="text-brand underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
                127.0.0.1:54324
              </a>
              .
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-60"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </label>

              {needsPassword && (
                <label className="block text-sm font-medium">
                  Password
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className={inputClass}
                  />
                </label>
              )}

              {error && <p className="text-sm text-negative">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loading ? "Working…" : COPY[mode].cta}
              </button>
            </form>

            <div className="mt-4 flex flex-col gap-1.5 text-sm">
              {mode === "signin" && (
                <>
                  <button onClick={() => switchMode("forgot")} className="text-left text-muted hover:text-ink">
                    Forgot password?
                  </button>
                  <button onClick={() => switchMode("magic")} className="text-left text-muted hover:text-ink">
                    Email me a magic link instead
                  </button>
                  <button onClick={() => switchMode("signup")} className="text-left text-muted hover:text-ink">
                    Don&apos;t have an account? Sign up
                  </button>
                </>
              )}
              {mode !== "signin" && (
                <button onClick={() => switchMode("signin")} className="text-left text-muted hover:text-ink">
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
