import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { money, dateLabel } from "@/lib/format";
import type { TransactionWithCategory } from "@/lib/queries";

export function TransactionsTable({ transactions }: { transactions: TransactionWithCategory[] }) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
        No transactions recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-medium">Transactions</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-5 py-2 font-medium">Category</th>
              <th className="px-5 py-2 font-medium">Description</th>
              <th className="px-5 py-2 text-right font-medium">Amount</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const income = t.transaction_categories?.direction === "income";
              return (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-5 py-2 text-muted">{dateLabel(t.txn_date)}</td>
                  <td className="whitespace-nowrap px-5 py-2">
                    {t.transaction_categories?.label ?? t.category}
                    {t.is_estimate && (
                      <Badge variant="neutral" className="ml-2">
                        Est.
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-2 text-muted">{t.description}</td>
                  <td
                    className={`whitespace-nowrap px-5 py-2 text-right tabular-nums ${
                      income ? "text-positive" : "text-ink"
                    }`}
                  >
                    {income ? "+" : "−"}
                    {money(t.amount_cents)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 text-right">
                    <Link
                      href={`/properties/${t.property_id}/transactions/${t.id}`}
                      className="text-sm text-brand"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
