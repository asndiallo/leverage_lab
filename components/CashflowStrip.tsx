import { Badge } from "@/components/ui/Badge";
import { HorizonSelector } from "@/components/HorizonSelector";
import { money, moneySigned, monthLabel } from "@/lib/format";
import type { MonthlyCashflow, VacancyPeriod } from "@/types/database";

/** last calendar day of the month that a 'YYYY-MM-01' string falls in */
function monthEnd(firstOfMonth: string): string {
  const d = new Date(firstOfMonth + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
    end.getDate(),
  ).padStart(2, "0")}`;
}

function vacancyReasonFor(month: string, periods: VacancyPeriod[]): string | null {
  const mEnd = monthEnd(month);
  const p = periods.find(
    (v) => v.start_date <= mEnd && (!v.end_date || v.end_date >= month),
  );
  return p ? p.reason.replace(/_/g, " ") : null;
}

export function CashflowStrip({
  rows,
  horizon,
  vacancyPeriods = [],
}: {
  rows: MonthlyCashflow[];
  horizon: number;
  vacancyPeriods?: VacancyPeriod[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="font-medium">Cash flow</h2>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-muted sm:inline">
            <span className="mr-3 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-muted" /> projected
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-warn" /> vacant
            </span>
          </span>
          <HorizonSelector current={horizon} />
        </div>
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
              const reason = m.is_vacant ? vacancyReasonFor(m.month, vacancyPeriods) : null;
              return (
                <tr
                  key={m.month}
                  className={`border-t border-border ${m.is_projected ? "text-muted" : ""}`}
                >
                  <td className="px-5 py-2">
                    <span className="text-ink">{monthLabel(m.month)}</span>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {m.is_projected && <Badge variant="neutral">Est.</Badge>}
                      {m.is_vacant && (
                        <Badge variant="warn">{reason ? `Vacant · ${reason}` : "Vacant"}</Badge>
                      )}
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
