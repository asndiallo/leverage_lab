import { Badge } from "@/components/ui/Badge";
import { money, moneySigned, monthLabel } from "@/lib/format";
import type { MonthlyCashflow } from "@/types/database";

export function CashflowStrip({ rows }: { rows: MonthlyCashflow[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-medium">Cash flow — next {rows.length} months</h2>
        <span className="text-xs text-muted">
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-muted" /> projected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-warn" /> vacant
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-medium">Month</th>
              <th className="px-5 py-2 text-right font-medium">Income</th>
              <th className="px-5 py-2 text-right font-medium">Debt service</th>
              <th className="px-5 py-2 text-right font-medium">Reserves</th>
              <th className="px-5 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const reserves = m.vacancy_reserve_cents + m.maintenance_reserve_cents;
              return (
                <tr
                  key={m.month}
                  className={`border-t border-border ${m.is_projected ? "text-muted" : ""}`}
                >
                  <td className="px-5 py-2">
                    <span className="text-ink">{monthLabel(m.month)}</span>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {m.is_projected && <Badge variant="neutral">Est.</Badge>}
                      {m.is_vacant && <Badge variant="warn">Vacant</Badge>}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{money(m.income_total_cents)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{money(m.debt_service_cents)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{money(reserves)}</td>
                  <td
                    className={`px-5 py-2 text-right font-semibold tabular-nums ${
                      m.net_cashflow_cents < 0 ? "text-negative" : "text-positive"
                    }`}
                  >
                    {moneySigned(m.net_cashflow_cents)}
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
