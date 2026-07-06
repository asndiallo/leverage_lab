"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Link2 } from "lucide-react";
import { linkDocument } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton } from "@/components/forms/formPrimitives";
import { FormDialog } from "@/components/forms/FormDialog";
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
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(linkDocument, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (candidates.length === 0) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Link existing document"
      trigger={
        <Button variant="outline">
          <Link2 className="size-4" />
          Link existing document
        </Button>
      }
    >
      <form ref={ref} action={action} className="space-y-4">
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
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton label="Link" />
        </div>
      </form>
    </FormDialog>
  );
}
