"use client";

import { useFormStatus } from "react-dom";

export const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function SubmitButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
