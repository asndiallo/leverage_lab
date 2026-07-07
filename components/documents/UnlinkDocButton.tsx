"use client";

import { useFormState } from "react-dom";
import { unlinkDocument } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Button } from "@/components/ui/button";

export function UnlinkDocButton({
  linkId,
  propertyId,
  transactionId,
}: {
  linkId: string;
  propertyId: string;
  transactionId: string;
}) {
  const [, action] = useFormState(unlinkDocument, emptyActionState);
  return (
    <form action={action}>
      <input type="hidden" name="link_id" value={linkId} />
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
      >
        Unlink
      </Button>
    </form>
  );
}
