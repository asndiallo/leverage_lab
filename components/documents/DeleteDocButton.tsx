"use client";

import { deleteDocument } from "@/lib/actions";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";

export function DeleteDocButton({ documentId }: { documentId: string }) {
  return (
    <ConfirmDeleteButton
      action={deleteDocument}
      hiddenFields={{ document_id: documentId }}
      title="Delete this document?"
      iconOnly
    />
  );
}
