"use client";

import { Settings2 } from "lucide-react";
import { updatePropertySettings } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Edits the property's real, persisted reserve assumptions
 * (property_settings.vacancy_reserve_rate / maintenance_reserve_rate) that
 * property_monthly_cashflow uses for every projected month — previously
 * only settable at property creation (defaulting to 5% / 1%), with no way
 * to revisit them afterward. */
export function ReserveSettingsDialog({
  propertyId,
  vacancyReserveRate,
  maintenanceReserveRate,
}: {
  propertyId: string;
  vacancyReserveRate: number;
  maintenanceReserveRate: number;
}) {
  return (
    <FormDialogButton
      action={updatePropertySettings}
      title="Reserve settings"
      description="Used for every projected month's cash flow — vacancy as a % of gross rent, maintenance as a % of purchase price per year."
      submitLabel="Save"
      trigger={
        <Button variant="ghost" size="sm">
          <Settings2 className="size-4" />
          Reserves
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vacancy reserve (%)">
          <Input
            name="vacancy_reserve_rate"
            type="number"
            step="0.1"
            min="0"
            max="100"
            required
            defaultValue={(vacancyReserveRate * 100).toFixed(2)}
          />
        </Field>
        <Field label="Maintenance reserve (%/yr)">
          <Input
            name="maintenance_reserve_rate"
            type="number"
            step="0.1"
            min="0"
            max="100"
            required
            defaultValue={(maintenanceReserveRate * 100).toFixed(2)}
          />
        </Field>
      </div>
    </FormDialogButton>
  );
}
