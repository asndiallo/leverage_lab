"use client";

import { useFormState } from "react-dom";
import { setHomesteadFiled } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";

export function HomesteadToggle({
  propertyId,
  filed,
}: {
  propertyId: string;
  filed: boolean;
}) {
  const [, action] = useFormState(setHomesteadFiled, emptyActionState);
  return (
    <form action={action}>
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="filed" value={filed ? "false" : "true"} />
      <button className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs hover:border-brand">
        {filed ? "Mark as not filed" : "Mark homestead filed"}
      </button>
    </form>
  );
}
