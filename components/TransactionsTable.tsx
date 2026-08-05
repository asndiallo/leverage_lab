"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateLabel, money } from "@/lib/format";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { BulkDeleteBar } from "@/components/forms/BulkDeleteBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CategoryGroup } from "@/types/database";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { SortDirectionButton } from "@/components/forms/SortDirectionButton";
import type { TransactionWithCategory } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { deleteTransactions } from "@/lib/actions";
import { useSelection } from "@/lib/hooks/useSelection";

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

const PAGE_SIZE_OPTIONS = [6, 10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 6;

export function TransactionsTable({
  transactions,
}: {
  transactions: TransactionWithCategory[];
}) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  // Most recent first by default, matching the documents list.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const presentGroups = useMemo(() => {
    const set = new Set(
      transactions
        .map((t) => t.transaction_categories?.category_group)
        .filter(Boolean),
    );
    return (Object.keys(GROUP_LABELS) as CategoryGroup[]).filter((g) =>
      set.has(g),
    );
  }, [transactions]);

  const rows = useMemo(() => {
    const filtered =
      groupFilter === "all"
        ? transactions
        : transactions.filter(
            (t) => t.transaction_categories?.category_group === groupFilter,
          );

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
  const { selected, toggle, allSelected, toggleAll, clear } =
    useSelection(visibleIds);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  if (transactions.length === 0) {
    return (
      <Card className="text-muted-foreground px-5 py-6 text-sm">
        No transactions recorded yet.
      </Card>
    );
  }

  const propertyId = transactions[0].property_id;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Transactions</h2>
          <span className="text-muted-foreground text-xs">
            {rows.length} of {transactions.length}
          </span>
          <BulkDeleteBar
            count={selected.size}
            action={deleteTransactions}
            hiddenFields={{
              transaction_ids: [...selected].join(","),
              property_id: propertyId,
            }}
            itemLabel="transaction"
            onDeleted={clear}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={groupFilter}
            onValueChange={(v) => {
              setGroupFilter(v as GroupFilter);
              setPage(0);
            }}
          >
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

          <Select
            value={sortKey}
            onValueChange={(v) => {
              setSortKey(v as SortKey);
              setPage(0);
            }}
          >
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

          <SortDirectionButton
            sortDir={sortDir}
            onToggle={() => {
              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              setPage(0);
            }}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          No transactions match this filter.
        </p>
      ) : (
        <>
          <Table className="min-w-160">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
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
              {pagedRows.map((t) => {
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
                    <TableCell className="text-muted-foreground">
                      {dateLabel(t.txn_date)}
                    </TableCell>
                    <TableCell>
                      {t.transaction_categories?.label ?? t.category}
                      {t.is_estimate && (
                        <Badge variant="outline" className="ml-2">
                          Est.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.description}
                    </TableCell>
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
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground text-xs">
                Showing {currentPage * pageSize + 1}–
                {Math.min((currentPage + 1) * pageSize, rows.length)} of{" "}
                {rows.length}
              </span>
              <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                Rows per page
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-16" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-muted-foreground text-xs">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
