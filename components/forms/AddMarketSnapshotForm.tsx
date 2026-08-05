"use client";

import { Plus } from "lucide-react";
import { addMarketSnapshot } from "@/lib/actions";
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

export function AddMarketSnapshotForm({ propertyId }: { propertyId: string }) {
  return (
    <FormDialogButton
      action={addMarketSnapshot}
      title="Log a value snapshot"
      description="Record a home-value estimate (from your lender, Zillow, an appraisal, etc.) to track equity and appreciation over time."
      submitLabel="Add snapshot"
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Log value snapshot
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date">
          <Input
            name="snapshot_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Estimated value ($)">
          <Input
            name="estimated_value"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </Field>
        <Field label="Source">
          <Select name="source" defaultValue="manual">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual / lender estimate</SelectItem>
              <SelectItem value="zillow_estimate">Zillow estimate</SelectItem>
              <SelectItem value="appraisal">Appraisal</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Input name="notes" placeholder="e.g. NFCU neighborhood estimate" />
        </Field>
      </div>
    </FormDialogButton>
  );
}
