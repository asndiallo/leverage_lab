"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { uploadDocument } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton, inputClass } from "@/components/forms/formPrimitives";
import type { DocumentType } from "@/types/database";

const docTypes: DocumentType[] = [
  "receipt",
  "lease",
  "closing_disclosure",
  "tax_document",
  "insurance",
  "statement",
  "appraisal",
  "other",
];

export function DocumentUpload({
  propertyId,
  transactionId,
  properties,
  defaultType = "receipt",
  label = "Upload document",
}: {
  propertyId?: string;
  transactionId?: string;
  properties?: { id: string; address: string }[];
  defaultType?: DocumentType;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(uploadDocument, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand"
      >
        + {label}
      </button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-border bg-surface p-5">
      {propertyId && <input type="hidden" name="property_id" value={propertyId} />}
      {transactionId && <input type="hidden" name="transaction_id" value={transactionId} />}

      {!propertyId && properties && (
        <Field label="Property">
          <select name="property_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="File (PDF or image)">
        <input type="file" name="file" accept="application/pdf,image/*" required className="mt-1 block w-full text-sm" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select name="doc_type" defaultValue={defaultType} className={inputClass}>
            {docTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title (optional)">
          <input name="title" className={inputClass} />
        </Field>
      </div>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Upload" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
