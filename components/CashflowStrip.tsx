import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HorizonSelector } from "@/components/HorizonSelector";
import { money, moneySigned, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthlyCashflow, VacancyPeriod } from "@/types/database";

/** last calendar day of the month that a 'YYYY-MM-01' string falls in */
function monthEnd(firstOfMonth: string): string {
  const d = new Date(firstOfMonth + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
    end.getDate(),
  ).padStart(2, "0")}`;
}

function vacancyReasonFor(
  month: string,
  periods: VacancyPeriod[],
): string | null {
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
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="font-medium">Cash flow</h2>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground hidden text-xs sm:inline">
            <span className="mr-3 inline-flex items-center gap-1">
              <span className="bg-muted-foreground/50 inline-block size-2 rounded-full" />{" "}
              projected
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="bg-warn inline-block size-2 rounded-full" />{" "}
              vacant
            </span>
          </span>
          <HorizonSelector current={horizon} />
        </div>
      </div>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Month</TableHead>
            <TableHead className="text-right">Income</TableHead>
            <TableHead className="text-right">Debt service</TableHead>
            <TableHead className="text-right">Reserves</TableHead>
            <TableHead className="pr-5 text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const reserves =
              m.vacancy_reserve_cents + m.maintenance_reserve_cents;
            const reason = m.is_vacant
              ? vacancyReasonFor(m.month, vacancyPeriods)
              : null;
            return (
              <TableRow
                key={m.month}
                className={cn(m.is_projected && "text-muted-foreground")}
              >
                <TableCell className="pl-5">
                  <span className="text-foreground">{monthLabel(m.month)}</span>
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {m.is_projected && <Badge variant="outline">Est.</Badge>}
                    {m.is_vacant && (
                      <Badge variant="warn">
                        {reason ? `Vacant · ${reason}` : "Vacant"}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {money(m.income_total_cents)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {money(m.debt_service_cents)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {money(reserves)}
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-5 text-right font-mono font-semibold tabular-nums",
                    m.net_cashflow_cents < 0
                      ? "text-negative"
                      : "text-positive",
                  )}
                >
                  {moneySigned(m.net_cashflow_cents)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
