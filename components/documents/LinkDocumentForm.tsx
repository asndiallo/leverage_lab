"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { linkDocument } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { inputClass, SubmitButton } from "@/components/forms/formPrimitives";
import type { DocumentRecord } from "@/types/database";

export function LinkDocumentForm({
  propertyId,
  transactionId,
  candidates,
}: {
  propertyId: string;
  transactionId: string;
  candidates: DocumentRecord[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(linkDocument, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (candidates.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand"
      >
        Link existing document
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <label className="block text-sm">
        <span className="text-muted">Document</span>
        <select name="document_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select…
          </option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || d.file_name}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p className="w-full text-sm text-negative">{state.error}</p>}
      <SubmitButton label="Link" />
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
        Cancel
      </button>
    </form>
  );
}
