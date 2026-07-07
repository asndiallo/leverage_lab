"use client";

import { Plus } from "lucide-react";
import { addLease } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LeaseForm({ propertyId }: { propertyId: string }) {
  return (
    <FormDialogButton
      action={addLease}
      title="New lease"
      submitLabel="Add lease"
      trigger={
        <Button variant="outline">
          <Plus className="size-4" />
          Add lease
        </Button>
      }
    >
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
          <Input
            name="rent_amount"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </Field>
        <Field label="Lease start">
          <Input name="lease_start" type="date" required />
        </Field>
        <Field label="Lease end (optional)">
          <Input name="lease_end" type="date" />
        </Field>
        <Field label="Flat utility charge ($)">
          <Input
            name="flat_utility_charge"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
          />
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
      <label className="text-muted-foreground flex items-center gap-2 text-sm">
        <Checkbox name="utilities_included" /> Utilities included in rent
      </label>
    </FormDialogButton>
  );
}
