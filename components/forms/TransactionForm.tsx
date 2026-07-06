"use client";

import { Plus } from "lucide-react";
import { addTransaction } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
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
  return (
    <FormDialogButton
      action={addTransaction}
      title="New transaction"
      submitLabel="Add transaction"
      trigger={
        <Button variant="outline">
          <Plus className="size-4" />
          Add transaction
        </Button>
      }
    >
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
    </FormDialogButton>
  );
}
