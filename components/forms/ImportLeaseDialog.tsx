"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { emptyActionState } from "@/lib/action-types";
import { importLease, parseLeaseFile } from "@/lib/actions";
import type { ParsedLease } from "@/lib/lease-parser";
import { Field } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Two-phase "upload -> review extracted fields -> save" flow, distinct from
 * the single-shot FormDialogButton pattern because there's a parse step in
 * between that isn't itself the final submit. Parsing only understands this
 * landlord's own room-lease PandaDoc template (see lib/lease-parser.ts) —
 * every field here is editable specifically because that extraction is
 * best-effort, not because it's usually wrong. */
export function ImportLeaseDialog({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedLease | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setParsed(null);
    setError(null);
    setBusy(false);
  }

  function backToUpload() {
    setParsed(null);
    setError(null);
  }

  async function handleParse() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await parseLeaseFile(emptyActionState, fd);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setParsed(result.parsedLease ?? null);
  }

  async function handleSave(formData: FormData) {
    if (!file) return;
    formData.set("file", file);
    setBusy(true);
    setError(null);
    const result = await importLease(emptyActionState, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
      title="Import lease from PDF"
      description="Upload a signed lease from the room-rental template — extracted fields are shown below for review before saving."
      trigger={
        <Button variant="outline">
          <FileUp className="size-4" />
          Import lease
        </Button>
      }
    >
      {!parsed ? (
        <div className="space-y-4">
          <Field label="Lease PDF">
            <Input
              type="file"
              accept="application/pdf"
              className="pt-1.5"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!file || busy}
              onClick={handleParse}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Reading…" : "Parse PDF"}
            </Button>
          </div>
        </div>
      ) : (
        <form action={handleSave} className="space-y-4">
          <input type="hidden" name="property_id" value={propertyId} />
          {parsed.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-600 dark:text-amber-500">
              {parsed.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Unit">
              <Input
                name="unit_identifier"
                required
                defaultValue={parsed.unitIdentifier ?? ""}
                placeholder="master_bedroom"
              />
            </Field>
            <Field label="Tenant name">
              <Input
                name="tenant_name"
                required
                defaultValue={parsed.tenantName ?? ""}
              />
            </Field>
            <Field label="Tenant email">
              <Input
                name="tenant_email"
                type="email"
                defaultValue={parsed.tenantEmail ?? ""}
              />
            </Field>
            <Field label="Monthly rent ($)">
              <Input
                name="rent_amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={parsed.rentAmount ?? ""}
              />
            </Field>
            <Field label="Lease start">
              <Input
                name="lease_start"
                type="date"
                required
                defaultValue={parsed.leaseStart ?? ""}
              />
            </Field>
            <Field label="Lease end (optional)">
              <Input
                name="lease_end"
                type="date"
                defaultValue={parsed.leaseEnd ?? ""}
              />
            </Field>
            <Field label="Flat utility charge ($)">
              <Input
                name="flat_utility_charge"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
              />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="pending">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="ended">ended</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox name="utilities_included" defaultChecked /> Utilities
            included in rent
          </label>
          <Field label="Notes">
            <Textarea
              name="notes"
              rows={5}
              defaultValue={parsed.notes}
              className="text-xs"
            />
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={backToUpload}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Saving…" : "Save lease"}
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}
