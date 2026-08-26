"use client";

import { deleteLease } from "@/lib/actions";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";

export function DeleteLeaseButton({
  leaseId,
  propertyId,
  hasDocuments,
}: {
  leaseId: string;
  propertyId: string;
  hasDocuments: boolean;
}) {
  return (
    <ConfirmDeleteButton
      action={deleteLease}
      hiddenFields={{ id: leaseId, property_id: propertyId }}
      title="Delete this lease?"
      description={
        hasDocuments
          ? "This also deletes the document(s) attached to this lease. This cannot be undone."
          : "This cannot be undone."
      }
      iconOnly
    />
  );
}
