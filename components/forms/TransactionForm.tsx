"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Plus } from "lucide-react";
import { addTransaction } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { CategorySelect, type CategoryOption } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TransactionForm({
  propertyId,
  categories,
}: {
  propertyId: string;
  categories: CategoryOption[];
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

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="New transaction"
      trigger={
        <Button variant="outline">
          <Plus className="size-4" />
          Add transaction
        </Button>
      }
    >
      <form ref={ref} action={action} className="space-y-4">
        <input type="hidden" name="property_id" value={propertyId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input name="txn_date" type="date" required />
          </Field>
          <Field label="Category">
            <CategorySelect categories={categories} />
          </Field>
          <Field label="Amount ($)">
            <Input name="amount" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="Paid by">
            <Select name="paid_by" defaultValue="owner">
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
            <Input name="description" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox name="is_estimate" /> This is an estimate (projected, not actual)
        </label>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton label="Add transaction" />
        </div>
      </form>
    </FormDialog>
  );
}
