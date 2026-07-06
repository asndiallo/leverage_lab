"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { deleteTransactions } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";
import { money, dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/lib/queries";
import type { CategoryGroup } from "@/types/database";

type SortKey = "date" | "amount" | "category";
type GroupFilter = CategoryGroup | "all";

const GROUP_LABELS: Record<CategoryGroup, string> = {
  income: "Income",
  operating_expense: "Operating expense",
  capital_improvement: "Capital improvement",
  loan: "Loan",
  closing: "Closing",
};

const SORT_LABELS: Record<SortKey, string> = {
  date: "Date",
  amount: "Amount",
  category: "Category",
};

export function TransactionsTable({ transactions }: { transactions: TransactionWithCategory[] }) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  // Most recent first by default, matching the documents list.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const presentGroups = useMemo(() => {
    const set = new Set(transactions.map((t) => t.transaction_categories?.category_group).filter(Boolean));
    return (Object.keys(GROUP_LABELS) as CategoryGroup[]).filter((g) => set.has(g));
  }, [transactions]);

  const rows = useMemo(() => {
    const filtered =
      groupFilter === "all"
        ? transactions
        : transactions.filter((t) => t.transaction_categories?.category_group === groupFilter);

    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") return sign * (a.amount_cents - b.amount_cents);
      if (sortKey === "category") {
        const aLabel = a.transaction_categories?.label ?? a.category;
        const bLabel = b.transaction_categories?.label ?? b.category;
        return sign * aLabel.localeCompare(bLabel);
      }
      return sign * a.txn_date.localeCompare(b.txn_date);
    });
  }, [transactions, groupFilter, sortKey, sortDir]);

  const visibleIds = useMemo(() => rows.map((t) => t.id), [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  if (transactions.length === 0) {
    return (
      <Card className="px-5 py-6 text-sm text-muted-foreground">No transactions recorded yet.</Card>
    );
  }

  const propertyId = transactions[0].property_id;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Transactions</h2>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{selected.size} selected</span>
              <ConfirmDeleteButton
                action={deleteTransactions}
                hiddenFields={{ transaction_ids: [...selected].join(","), property_id: propertyId }}
                title={`Delete ${selected.size} transaction${selected.size === 1 ? "" : "s"}?`}
                triggerLabel={`Delete ${selected.size}`}
                onDeleted={() => setSelected(new Set())}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as GroupFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {presentGroups.map((g) => (
                <SelectItem key={g} value={g}>
                  {GROUP_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No transactions match this filter.</p>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={() =>
                    setSelected(allVisibleSelected ? new Set() : new Set(visibleIds))
                  }
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => {
              const income = t.transaction_categories?.direction === "income";
              return (
                <TableRow key={t.id}>
                  <TableCell className="pl-5">
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                      aria-label={`Select transaction on ${dateLabel(t.txn_date)}`}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dateLabel(t.txn_date)}</TableCell>
                  <TableCell>
                    {t.transaction_categories?.label ?? t.category}
                    {t.is_estimate && (
                      <Badge variant="outline" className="ml-2">
                        Est.
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.description}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono tabular-nums",
                      income ? "text-positive" : "text-foreground",
                    )}
                  >
                    {income ? "+" : "−"}
                    {money(t.amount_cents)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Link
                      href={`/properties/${t.property_id}/transactions/${t.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
