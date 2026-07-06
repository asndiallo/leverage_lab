"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { deleteTransaction } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";

export function DeleteTransactionButton({
  txnId,
  propertyId,
}: {
  txnId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState(deleteTransaction, emptyActionState);

  useEffect(() => {
    if (state.ok) router.push(`/properties/${propertyId}`);
  }, [state, router, propertyId]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this transaction? This cannot be undone.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={txnId} />
      <input type="hidden" name="property_id" value={propertyId} />
      <button className="rounded-lg border border-border px-3 py-1.5 text-sm text-negative hover:border-negative">
        Delete
      </button>
    </form>
  );
}
