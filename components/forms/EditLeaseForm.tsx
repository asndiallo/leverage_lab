"use client";

import { Pencil } from "lucide-react";
import { updateLease } from "@/lib/actions";
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
import type { Lease } from "@/types/database";
import type { LinkedDocument } from "@/lib/queries";

/** Edits an existing lease's terms. Attaching a new file here replaces
 * whatever document(s) are currently linked to the lease (see
 * updateLease) — the dialog surfaces that document by name up front so
 * it's clear what gets replaced, not just added alongside. */
export function EditLeaseForm({
  lease,
  documents = [],
}: {
  lease: Lease;
  documents?: LinkedDocument[];
}) {
  return (
    <FormDialogButton
      action={updateLease}
      title="Edit lease"
      description={
        documents.length > 0
          ? `Attaching a new file below replaces the current document: ${documents
              .map((d) => d.doc.file_name)
              .join(", ")}.`
          : undefined
      }
      submitLabel="Save changes"
      trigger={
        <Button type="button" variant="ghost" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
    >
      <input type="hidden" name="id" value={lease.id} />
      <input type="hidden" name="property_id" value={lease.property_id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Unit">
          <Input
            name="unit_identifier"
            required
            defaultValue={lease.unit_identifier}
          />
        </Field>
        <Field label="Tenant name">
          <Input
            name="tenant_name"
            required
            defaultValue={lease.tenant_name}
          />
        </Field>
        <Field label="Tenant email">
          <Input
            name="tenant_email"
            type="email"
            defaultValue={lease.tenant_email ?? ""}
          />
        </Field>
        <Field label="Monthly rent ($)">
          <Input
            name="rent_amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={(lease.rent_amount_cents / 100).toFixed(2)}
          />
        </Field>
        <Field label="Lease start">
          <Input
            name="lease_start"
            type="date"
            required
            defaultValue={lease.lease_start}
          />
        </Field>
        <Field label="Lease end (optional)">
          <Input
            name="lease_end"
            type="date"
            defaultValue={lease.lease_end ?? ""}
          />
        </Field>
        <Field label="Flat utility charge ($)">
          <Input
            name="flat_utility_charge"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(lease.flat_utility_charge_cents / 100).toFixed(2)}
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={lease.status}>
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
        <Checkbox
          name="utilities_included"
          defaultChecked={lease.utilities_included}
        />{" "}
        Utilities included in rent
      </label>
      <Field
        label={
          documents.length > 0
            ? "Replace lease document (optional)"
            : "Attach lease document (optional)"
        }
      >
        <Input type="file" accept="application/pdf,image/*" name="file" />
      </Field>
    </FormDialogButton>
  );
}
