"use client";

import { useActionState } from "react";
import { setHomesteadFiled } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Button } from "@/components/ui/button";

export function HomesteadToggle({
  propertyId,
  filed,
}: {
  propertyId: string;
  filed: boolean;
}) {
  const [, action] = useActionState(setHomesteadFiled, emptyActionState);
  return (
    <form action={action}>
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="filed" value={filed ? "false" : "true"} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="whitespace-nowrap"
      >
        {filed ? "Mark as not filed" : "Mark homestead filed"}
      </Button>
    </form>
  );
}
