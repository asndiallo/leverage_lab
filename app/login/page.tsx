"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/forms/formPrimitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            LL
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Leverage Lab</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{COPY[mode].title}</p>

        {sent ? (
          <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
            Check your email for a link.
            <span className="mt-1 block text-muted-foreground">
              Local dev: open Mailpit at{" "}
              <a className="text-primary underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
                127.0.0.1:54324
              </a>
              .
            </span>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onGoogle}
              disabled={loading}
              className="mt-6 w-full"
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </Button>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>

              {needsPassword && (
                <Field label="Password">
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </Field>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Working…" : COPY[mode].cta}
              </Button>
            </form>

            <div className="mt-4 flex flex-col gap-1.5 text-sm">
              {mode === "signin" && (
                <>
                  <button onClick={() => switchMode("forgot")} className="text-left text-muted-foreground hover:text-foreground">
                    Forgot password?
                  </button>
                  <button onClick={() => switchMode("magic")} className="text-left text-muted-foreground hover:text-foreground">
                    Email me a magic link instead
                  </button>
                  <button onClick={() => switchMode("signup")} className="text-left text-muted-foreground hover:text-foreground">
                    Don&apos;t have an account? Sign up
                  </button>
                </>
              )}
              {mode !== "signin" && (
                <button onClick={() => switchMode("signin")} className="text-left text-muted-foreground hover:text-foreground">
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
