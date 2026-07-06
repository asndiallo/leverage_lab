"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { updateTransaction } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton, inputClass } from "./formPrimitives";
import { CategorySelect, type CategoryOption } from "./CategorySelect";
import { DeleteTransactionButton } from "./DeleteTransactionButton";
import type { TransactionWithCategory } from "@/lib/queries";

export function EditTransactionForm({
  txn,
  categories,
}: {
  txn: TransactionWithCategory;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(updateTransaction, emptyActionState);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-brand"
        >
          Edit
        </button>
        <DeleteTransactionButton txnId={txn.id} propertyId={txn.property_id} />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h3 className="font-medium">Edit transaction</h3>
      <input type="hidden" name="id" value={txn.id} />
      <input type="hidden" name="property_id" value={txn.property_id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input name="txn_date" type="date" required defaultValue={txn.txn_date} className={inputClass} />
        </Field>
        <Field label="Category">
          <CategorySelect categories={categories} defaultValue={txn.category} />
        </Field>
        <Field label="Amount ($)">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={(txn.amount_cents / 100).toFixed(2)}
            className={inputClass}
          />
        </Field>
        <Field label="Paid by">
          <select name="paid_by" defaultValue={txn.paid_by} className={inputClass}>
            <option value="owner">owner</option>
            <option value="seller">seller</option>
            <option value="tenant">tenant</option>
          </select>
        </Field>
        <Field label="Description">
          <input name="description" defaultValue={txn.description ?? ""} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="is_estimate" defaultChecked={txn.is_estimate} /> This is an
        estimate (projected, not actual)
      </label>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Save changes" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
