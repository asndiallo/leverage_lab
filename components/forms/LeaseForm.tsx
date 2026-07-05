"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { addLease } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton, inputClass } from "./formPrimitives";

export function LeaseForm({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addLease, emptyActionState);
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
        + Add lease
      </button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h3 className="font-medium">New lease</h3>
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Unit">
          <input name="unit_identifier" required placeholder="master_bedroom" className={inputClass} />
        </Field>
        <Field label="Tenant name">
          <input name="tenant_name" required className={inputClass} />
        </Field>
        <Field label="Tenant email">
          <input name="tenant_email" type="email" className={inputClass} />
        </Field>
        <Field label="Monthly rent ($)">
          <input name="rent_amount" type="number" step="0.01" min="0" required className={inputClass} />
        </Field>
        <Field label="Lease start">
          <input name="lease_start" type="date" required className={inputClass} />
        </Field>
        <Field label="Lease end (optional)">
          <input name="lease_end" type="date" className={inputClass} />
        </Field>
        <Field label="Flat utility charge ($)">
          <input name="flat_utility_charge" type="number" step="0.01" min="0" defaultValue="0" className={inputClass} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue="active" className={inputClass}>
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="ended">ended</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="utilities_included" /> Utilities included in rent
      </label>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Add lease" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
