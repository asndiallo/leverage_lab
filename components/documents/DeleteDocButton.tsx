"use client";

import { useFormState } from "react-dom";
import { deleteDocument } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";

export function DeleteDocButton({ documentId }: { documentId: string }) {
  const [, action] = useFormState(deleteDocument, emptyActionState);
  return (
    <form action={action}>
      <input type="hidden" name="document_id" value={documentId} />
      <button className="text-xs text-muted hover:text-negative">Delete</button>
    </form>
  );
}
