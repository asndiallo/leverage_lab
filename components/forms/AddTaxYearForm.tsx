"use client";

import { Plus } from "lucide-react";
import { addTaxYear } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaxingJurisdiction } from "@/types/database";

export function AddTaxYearForm({
  propertyId,
  jurisdictions,
}: {
  propertyId: string;
  jurisdictions: TaxingJurisdiction[];
}) {
  return (
    <FormDialogButton
      action={addTaxYear}
      title="Add a tax year"
      description="Enter every jurisdiction's rate off one certificate — resubmitting the same year corrects it. Rates are $ per $100 of value, same as the certificate."
      submitLabel="Save"
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Add tax year
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tax year">
          <Input
            name="tax_year"
            type="number"
            step="1"
            required
            defaultValue={new Date().getFullYear()}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {jurisdictions.map((j) => (
          <Field key={j.id} label={`${j.name} ($/$100)`}>
            <Input name={`rate_${j.id}`} type="number" step="0.000001" min="0" />
          </Field>
        ))}
      </div>
      {jurisdictions.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No taxing jurisdictions on record for this property yet.
        </p>
      )}
    </FormDialogButton>
  );
}
