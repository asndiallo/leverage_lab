"use client";

import { Upload } from "lucide-react";
import { uploadDocument } from "@/lib/actions";
import { Field } from "@/components/forms/formPrimitives";
import { FormDialogButton } from "@/components/forms/FormDialogButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_TYPES } from "@/lib/constants";
import type { DocumentType } from "@/types/database";

export function DocumentUpload({
  propertyId,
  transactionId,
  properties,
  defaultType = "receipt",
  label = "Upload document",
}: {
  propertyId?: string;
  transactionId?: string;
  properties?: { id: string; address: string }[];
  defaultType?: DocumentType;
  label?: string;
}) {
  return (
    <FormDialogButton
      action={uploadDocument}
      title={label}
      submitLabel="Upload"
      trigger={
        <Button variant="outline">
          <Upload className="size-4" />
          {label}
        </Button>
      }
    >
      {propertyId && (
        <input type="hidden" name="property_id" value={propertyId} />
      )}
      {transactionId && (
        <input type="hidden" name="transaction_id" value={transactionId} />
      )}

      {!propertyId && properties && (
        <Field label="Property">
          <Select name="property_id" required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="File (PDF or image)">
        <Input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          required
          className="pt-1.5"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select name="doc_type" defaultValue={defaultType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Title (optional)">
          <Input name="title" />
        </Field>
      </div>
    </FormDialogButton>
  );
}
