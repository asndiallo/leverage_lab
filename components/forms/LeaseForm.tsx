"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Plus } from "lucide-react";
import { addLease } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="New lease"
      trigger={
        <Button variant="outline">
          <Plus className="size-4" />
          Add lease
        </Button>
      }
    >
      <form ref={ref} action={action} className="space-y-4">
        <input type="hidden" name="property_id" value={propertyId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Unit">
            <Input name="unit_identifier" required placeholder="master_bedroom" />
          </Field>
          <Field label="Tenant name">
            <Input name="tenant_name" required />
          </Field>
          <Field label="Tenant email">
            <Input name="tenant_email" type="email" />
          </Field>
          <Field label="Monthly rent ($)">
            <Input name="rent_amount" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="Lease start">
            <Input name="lease_start" type="date" required />
          </Field>
          <Field label="Lease end (optional)">
            <Input name="lease_end" type="date" />
          </Field>
          <Field label="Flat utility charge ($)">
            <Input name="flat_utility_charge" type="number" step="0.01" min="0" defaultValue="0" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="active">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="ended">ended</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox name="utilities_included" /> Utilities included in rent
        </label>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton label="Add lease" />
        </div>
      </form>
    </FormDialog>
  );
}
