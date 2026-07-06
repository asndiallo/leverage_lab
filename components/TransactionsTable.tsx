import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/lib/queries";

export function TransactionsTable({ transactions }: { transactions: TransactionWithCategory[] }) {
  if (transactions.length === 0) {
    return (
      <Card className="px-5 py-6 text-sm text-muted-foreground">No transactions recorded yet.</Card>
    );
  }

  return (
    <Card className="gap-0 p-0">
      <div className="border-b px-5 py-3">
        <h2 className="font-medium">Transactions</h2>
      </div>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => {
            const income = t.transaction_categories?.direction === "income";
            return (
              <TableRow key={t.id}>
                <TableCell className="pl-5 text-muted-foreground">{dateLabel(t.txn_date)}</TableCell>
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
    </Card>
  );
}
