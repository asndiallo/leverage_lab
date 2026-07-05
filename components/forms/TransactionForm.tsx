"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { addTransaction } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton, inputClass } from "./formPrimitives";
import type { CategoryGroup } from "@/types/database";

type Category = { code: string; label: string; category_group: CategoryGroup };

const groupLabels: Record<CategoryGroup, string> = {
  income: "Income",
  operating_expense: "Operating expense",
  capital_improvement: "Capital improvement",
  loan: "Loan",
  closing: "Closing",
};

export function TransactionForm({
  propertyId,
  categories,
}: {
  propertyId: string;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addTransaction, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  const grouped = useMemo(() => {
    const by = new Map<CategoryGroup, Category[]>();
    for (const c of categories) {
      const arr = by.get(c.category_group) ?? [];
      arr.push(c);
      by.set(c.category_group, arr);
    }
    return by;
  }, [categories]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand"
      >
        + Add transaction
      </button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h3 className="font-medium">New transaction</h3>
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input name="txn_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Category">
          <select name="category" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select…
            </option>
            {[...grouped.entries()].map(([group, items]) => (
              <optgroup key={group} label={groupLabels[group]}>
                {items.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Amount ($)">
          <input name="amount" type="number" step="0.01" min="0" required className={inputClass} />
        </Field>
        <Field label="Paid by">
          <select name="paid_by" defaultValue="owner" className={inputClass}>
            <option value="owner">owner</option>
            <option value="seller">seller</option>
            <option value="tenant">tenant</option>
          </select>
        </Field>
        <Field label="Description">
          <input name="description" className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="is_estimate" /> This is an estimate (projected, not actual)
      </label>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Add transaction" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
