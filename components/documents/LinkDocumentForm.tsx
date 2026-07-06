"use client";

import { Link2 } from "lucide-react";
import { linkDocument } from "@/lib/actions";
import { Field } from "@/components/forms/formPrimitives";
import { FormDialogButton } from "@/components/forms/FormDialogButton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DocumentRecord } from "@/types/database";

export function LinkDocumentForm({
  propertyId,
  transactionId,
  candidates,
}: {
  propertyId: string;
  transactionId: string;
  candidates: DocumentRecord[];
}) {
  if (candidates.length === 0) return null;

  return (
    <FormDialogButton
      action={linkDocument}
      title="Link existing document"
      submitLabel="Link"
      trigger={
        <Button variant="outline">
          <Link2 className="size-4" />
          Link existing document
        </Button>
      }
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <Field label="Document">
        <Select name="document_id" required>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.title || d.file_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialogButton>
  );
}
