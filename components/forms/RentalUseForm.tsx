"use client";

import { Plus } from "lucide-react";
import { addRentalUsePeriod } from "@/lib/actions";
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

export function RentalUseForm({ propertyId }: { propertyId: string }) {
  return (
    <FormDialogButton
      action={addRentalUsePeriod}
      title="Set rental-use %"
      description="What share of the property is rented out, effective from this date? A pure rental is 100%; a house hack is whatever share of rooms/sqft you don't personally occupy. Log a new entry whenever it changes (a roommate joins/leaves, or you move out entirely)."
      submitLabel="Save"
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Set rental-use %
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Effective date">
          <Input
            name="effective_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Rental-use %">
          <Input
            name="rental_use_percent"
            type="number"
            step="0.1"
            min="0"
            max="100"
            placeholder="e.g. 50 or 100"
            required
          />
        </Field>
        <Field label="How you figured it">
          <Select name="method" defaultValue="square_footage">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="square_footage">Square footage</SelectItem>
              <SelectItem value="room_count">Room count</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Input
            name="notes"
            placeholder="e.g. 3 of 4 bedrooms rented, 1,850/2,400 sqft"
          />
        </Field>
      </div>
    </FormDialogButton>
  );
}
