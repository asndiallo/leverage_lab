"use client";

import { Home } from "lucide-react";
import { updateTotalRooms } from "@/lib/actions";
import { Field } from "./formPrimitives";
import { FormDialogButton } from "./FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TotalRoomsForm({
  propertyId,
  totalRooms,
}: {
  propertyId: string;
  totalRooms: number | null;
}) {
  return (
    <FormDialogButton
      action={updateTotalRooms}
      title="Total rooms"
      description="How many bedrooms does the whole property have? With this set, rental-use % auto-computes as (rooms you've leased out) / (total rooms) from your leases — no need to log it manually."
      submitLabel="Save"
      trigger={
        <Button variant="ghost" size="sm">
          <Home className="size-4" />
          {totalRooms ? `${totalRooms} total rooms` : "Set total rooms"}
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <Field label="Total bedrooms/rooms">
        <Input
          name="total_rooms"
          type="number"
          step="1"
          min="1"
          required
          defaultValue={totalRooms ?? undefined}
        />
      </Field>
    </FormDialogButton>
  );
}
