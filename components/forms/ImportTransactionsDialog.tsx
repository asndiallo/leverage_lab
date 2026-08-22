"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { emptyActionState } from "@/lib/action-types";
import { importTransactionsCsv, parseTransactionsFile } from "@/lib/actions";
import type { ReviewTransactionRow } from "@/lib/csv-transaction-parser";
import { Field } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { CategorySelect, type CategoryOption } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReviewRow = ReviewTransactionRow & { include: boolean; category: string };

/** Two-phase "upload -> review extracted rows -> save" flow, the same shape
 * as ImportLeaseDialog: parsing (lib/csv-transaction-parser.ts) is
 * best-effort — column detection, date/amount parsing, and category
 * guessing from the description — so every row is shown here for review,
 * with likely duplicates (same date + amount as an existing transaction)
 * pre-unchecked rather than silently skipped or silently imported. */
export function ImportTransactionsDialog({
  propertyId,
  categories,
}: {
  propertyId: string;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setRows(null);
    setWarnings([]);
    setError(null);
    setBusy(false);
  }

  async function handleParse() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("property_id", propertyId);
    fd.set("file", file);
    const result = await parseTransactionsFile(emptyActionState, fd);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const parsed = result.parsedTransactions!;
    setWarnings(parsed.warnings);
    setRows(
      parsed.rows.map((r) => ({
        ...r,
        include: !r.is_duplicate,
        category: r.suggested_category,
      })),
    );
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows(
      (prev) =>
        prev?.map((r, i) => (i === index ? { ...r, ...patch } : r)) ?? null,
    );
  }

  async function handleSave() {
    if (!rows) return;
    const selected = rows.filter((r) => r.include);
    if (selected.length === 0) {
      setError("Select at least one transaction to import");
      return;
    }
    if (selected.some((r) => !r.category)) {
      setError("Every selected row needs a category");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("property_id", propertyId);
    fd.set(
      "rows",
      JSON.stringify(
        selected.map((r) => ({
          txn_date: r.txn_date,
          category: r.category,
          amount: r.amount,
          description: r.description,
        })),
      ),
    );
    const result = await importTransactionsCsv(emptyActionState, fd);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
  }

  const includedCount = rows?.filter((r) => r.include).length ?? 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
      title="Import transactions from CSV"
      description="Upload a bank or card statement export — matched categories and possible duplicates are shown below for review before saving."
      trigger={
        <Button variant="outline">
          <FileUp className="size-4" />
          Import transactions
        </Button>
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <Field label="Bank/card CSV export">
            <Input
              type="file"
              accept=".csv,text/csv"
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
              {busy ? "Reading…" : "Parse CSV"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-600 dark:text-amber-500">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No transactions found in that file.
            </p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_1fr_5.5rem] items-start gap-2 border-b pb-3 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={r.include}
                    onChange={(e) =>
                      updateRow(i, { include: e.target.checked })
                    }
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm" title={r.description}>
                      {r.description || "(no description)"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {r.txn_date}
                      {r.is_duplicate && (
                        <span className="text-amber-600 dark:text-amber-500">
                          {" "}
                          · possible duplicate
                        </span>
                      )}
                    </p>
                    <CategorySelect
                      categories={categories}
                      value={r.category}
                      onValueChange={(v) => updateRow(i, { category: v })}
                    />
                  </div>
                  <span className="pt-1.5 text-right text-sm tabular-nums">
                    ${r.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={reset}>
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || includedCount === 0}
              onClick={handleSave}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Importing…" : `Import ${includedCount}`}
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
