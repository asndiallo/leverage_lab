"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { addProperty } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton, inputClass } from "./formPrimitives";

export function NewPropertyForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addProperty, emptyActionState);
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
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
      >
        + Add property
      </button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <h3 className="font-medium">New property</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Address">
          <input name="address" required className={inputClass} />
        </Field>
        <Field label="City">
          <input name="city" required className={inputClass} />
        </Field>
        <Field label="State">
          <input name="state" required maxLength={2} placeholder="TX" className={inputClass} />
        </Field>
        <Field label="ZIP">
          <input name="zip" required className={inputClass} />
        </Field>
        <Field label="CAD account (optional)">
          <input name="cad_account" className={inputClass} />
        </Field>
        <Field label="Parcel ID (optional)">
          <input name="parcel_id" className={inputClass} />
        </Field>
        <Field label="Purchase price ($)">
          <input name="purchase_price" type="number" step="0.01" min="0" required className={inputClass} />
        </Field>
        <Field label="Purchase date">
          <input name="purchase_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Type">
          <select name="property_type" defaultValue="single_family" className={inputClass}>
            <option value="single_family">single_family</option>
            <option value="duplex">duplex</option>
            <option value="triplex">triplex</option>
            <option value="fourplex">fourplex</option>
            <option value="townhouse">townhouse</option>
            <option value="condo">condo</option>
            <option value="other">other</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue="pending" className={inputClass}>
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="sold">sold</option>
          </select>
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-xs uppercase tracking-wide text-muted">Loan (optional)</div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Lender">
            <input name="lender" className={inputClass} />
          </Field>
          <Field label="Loan amount ($)">
            <input name="loan_amount" type="number" step="0.01" min="0" className={inputClass} />
          </Field>
          <Field label="Interest rate (e.g. 0.055)">
            <input name="interest_rate" type="number" step="0.0001" min="0" className={inputClass} />
          </Field>
          <Field label="Term (years)">
            <input name="term_years" type="number" step="1" min="1" defaultValue="30" className={inputClass} />
          </Field>
          <Field label="Funding date">
            <input name="funding_date" type="date" className={inputClass} />
          </Field>
          <Field label="First payment date">
            <input name="first_payment_date" type="date" className={inputClass} />
          </Field>
        </div>
      </div>

      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Add property" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
