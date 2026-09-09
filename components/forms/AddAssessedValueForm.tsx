"use client";

import { Plus } from "lucide-react";
import { addAssessedValue } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AddAssessedValueForm({ propertyId }: { propertyId: string }) {
  return (
    <FormDialogButton
      action={addAssessedValue}
      title="Add an assessed value"
      description="From your county appraisal notice — resubmitting the same year (and source) corrects it. The land/improvement split drives the depreciation basis on Schedule E."
      submitLabel="Save"
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Add assessed value
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
        <Field label="Source">
          <Select name="source" defaultValue="county_record">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="county_record">
                County record (certified)
              </SelectItem>
              <SelectItem value="estimate">Estimate</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Land value ($)">
          <Input name="land_value" type="number" step="0.01" min="0" required />
        </Field>
        <Field label="Improvement value ($)">
          <Input
            name="improvement_value"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </Field>
        <Field label="Total assessed ($)">
          <Input
            name="total_assessed"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </Field>
        <Field label="Capped/homestead value ($, optional)">
          <Input name="capped_assessed" type="number" step="0.01" min="0" />
        </Field>
        <Field label="Notes (optional)" className="sm:col-span-2">
          <Input
            name="notes"
            placeholder="e.g. Certified 2027 value (Guadalupe CAD)"
          />
        </Field>
      </div>
    </FormDialogButton>
  );
}
