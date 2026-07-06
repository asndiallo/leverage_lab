"use client";

import { useRouter } from "next/navigation";
import { deleteTransaction } from "@/lib/actions";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";

export function DeleteTransactionButton({
  txnId,
  propertyId,
}: {
  txnId: string;
  propertyId: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDeleteButton
      action={deleteTransaction}
      hiddenFields={{ id: txnId, property_id: propertyId }}
      title="Delete this transaction?"
      onDeleted={() => router.push(`/properties/${propertyId}`)}
    />
  );
}
