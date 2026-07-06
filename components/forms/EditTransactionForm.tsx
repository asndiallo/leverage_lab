"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Pencil } from "lucide-react";
import { updateTransaction } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { CategorySelect, type CategoryOption } from "./CategorySelect";
import { DeleteTransactionButton } from "./DeleteTransactionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  return (
    <div className="flex items-center gap-3">
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit transaction"
        trigger={
          <Button type="button" variant="outline">
            <Pencil className="size-4" />
            Edit
          </Button>
        }
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={txn.id} />
          <input type="hidden" name="property_id" value={txn.property_id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input name="txn_date" type="date" required defaultValue={txn.txn_date} />
            </Field>
            <Field label="Category">
              <CategorySelect categories={categories} defaultValue={txn.category} />
            </Field>
            <Field label="Amount ($)">
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={(txn.amount_cents / 100).toFixed(2)}
              />
            </Field>
            <Field label="Paid by">
              <Select name="paid_by" defaultValue={txn.paid_by}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">owner</SelectItem>
                  <SelectItem value="seller">seller</SelectItem>
                  <SelectItem value="tenant">tenant</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input name="description" defaultValue={txn.description ?? ""} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox name="is_estimate" defaultChecked={txn.is_estimate} /> This is an estimate
            (projected, not actual)
          </label>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton label="Save changes" />
          </div>
        </form>
      </FormDialog>
      <DeleteTransactionButton txnId={txn.id} propertyId={txn.property_id} />
    </div>
  );
}
