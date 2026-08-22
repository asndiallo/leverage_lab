"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, moneySigned, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  projectScenario,
  type ScenarioBaseline,
  type ScenarioLoan,
} from "@/lib/scenario";
import type { MonthlyCashflow } from "@/types/database";

function Toggle({
  label,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        {label}
      </label>
      {checked && (
        <div className="grid grid-cols-2 gap-3 pl-6 sm:grid-cols-4">
          {children}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label className="text-muted-foreground flex flex-col gap-1 text-xs">
      {label}
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="text-foreground"
      />
    </label>
  );
}

/** "What-if" scenarios computed entirely client-side from the property's
 * real baseline numbers (see lib/scenario.ts) — nothing here is saved.
 * Adjusting a lever recomputes the comparison table instantly. */
export function ScenarioExplorer({
  startMonthISO,
  horizon,
  cashflow,
  loan,
}: {
  startMonthISO: string;
  horizon: number;
  cashflow: MonthlyCashflow[];
  loan: ScenarioLoan | null;
}) {
  const baselineMonth = cashflow[0];

  const [incomeOn, setIncomeOn] = useState(false);
  const [newIncome, setNewIncome] = useState(
    baselineMonth
      ? (baselineMonth.gross_rent_cents + baselineMonth.other_income_cents) /
          100
      : 0,
  );
  const [incomeMonth, setIncomeMonth] = useState(0);

  const [refiOn, setRefiOn] = useState(false);
  const [refiRate, setRefiRate] = useState(loan ? loan.interestRate * 100 : 5);
  const [refiTermYears, setRefiTermYears] = useState(
    loan ? loan.termMonths / 12 : 30,
  );
  const [refiMonth, setRefiMonth] = useState(0);
  const [refiCost, setRefiCost] = useState(0);

  const [vacancyOn, setVacancyOn] = useState(false);
  const baselineVacancyRatePct =
    baselineMonth && baselineMonth.gross_rent_cents > 0
      ? (baselineMonth.vacancy_reserve_cents / baselineMonth.gross_rent_cents) *
        100
      : 5;
  const [vacancyRate, setVacancyRate] = useState(baselineVacancyRatePct);

  const [expenseOn, setExpenseOn] = useState(false);
  const [expenseDelta, setExpenseDelta] = useState(0);

  const scenarioRows = useMemo(() => {
    if (!baselineMonth) return [];
    const baseline: ScenarioBaseline = {
      grossRentCents: baselineMonth.gross_rent_cents,
      otherIncomeCents: baselineMonth.other_income_cents,
      operatingExpenseCents: baselineMonth.operating_expense_cents,
      debtServiceCents: baselineMonth.debt_service_cents,
      vacancyReserveCents: baselineMonth.vacancy_reserve_cents,
      maintenanceReserveCents: baselineMonth.maintenance_reserve_cents,
    };
    return projectScenario(startMonthISO, horizon, baseline, loan, {
      newIncomeCents: incomeOn ? Math.round(newIncome * 100) : undefined,
      incomeEffectiveMonth: incomeOn
        ? Math.max(0, Math.min(incomeMonth, horizon - 1))
        : undefined,
      refi:
        refiOn && loan
          ? {
              newInterestRate: refiRate / 100,
              newTermMonths: Math.round(refiTermYears * 12),
              effectiveMonth: Math.max(0, Math.min(refiMonth, horizon - 1)),
              refiCostCents: Math.round(refiCost * 100),
            }
          : undefined,
      vacancyRateFraction: vacancyOn ? vacancyRate / 100 : undefined,
      extraMonthlyExpenseCents: expenseOn
        ? Math.round(expenseDelta * 100)
        : undefined,
    });
  }, [
    baselineMonth,
    startMonthISO,
    horizon,
    loan,
    incomeOn,
    newIncome,
    incomeMonth,
    refiOn,
    refiRate,
    refiTermYears,
    refiMonth,
    refiCost,
    vacancyOn,
    vacancyRate,
    expenseOn,
    expenseDelta,
  ]);

  if (!baselineMonth) return null;

  const baselineTotal = cashflow.reduce((s, m) => s + m.net_cashflow_cents, 0);
  const scenarioTotal = scenarioRows.reduce(
    (s, m) => s + m.netCashflowCents,
    0,
  );
  const anyActive = incomeOn || refiOn || vacancyOn || expenseOn;

  return (
    <Card className="gap-0 p-0">
      <div className="border-b px-5 py-3">
        <h2 className="font-medium">What-if scenarios</h2>
        <p className="text-muted-foreground text-xs">
          Adjust assumptions below to see how they&apos;d change the {horizon}
          -month projection — nothing here is saved.
        </p>
      </div>

      <div className="space-y-4 border-b px-5 py-4">
        <Toggle
          label="Change monthly income"
          checked={incomeOn}
          onCheckedChange={setIncomeOn}
        >
          <NumberField
            label="New monthly income ($)"
            value={newIncome}
            onChange={setNewIncome}
            step="0.01"
          />
          <NumberField
            label="Effective in (months)"
            value={incomeMonth}
            onChange={setIncomeMonth}
          />
        </Toggle>

        <Toggle
          label="Model a refinance"
          checked={refiOn}
          onCheckedChange={setRefiOn}
        >
          {loan ? (
            <>
              <NumberField
                label="New rate (%)"
                value={refiRate}
                onChange={setRefiRate}
                step="0.01"
              />
              <NumberField
                label="New term (years)"
                value={refiTermYears}
                onChange={setRefiTermYears}
              />
              <NumberField
                label="Effective in (months)"
                value={refiMonth}
                onChange={setRefiMonth}
              />
              <NumberField
                label="One-time cost ($)"
                value={refiCost}
                onChange={setRefiCost}
                step="0.01"
              />
            </>
          ) : (
            <p className="text-muted-foreground col-span-full text-xs">
              No active loan on this property to refinance.
            </p>
          )}
        </Toggle>

        <Toggle
          label="Override vacancy reserve rate"
          checked={vacancyOn}
          onCheckedChange={setVacancyOn}
        >
          <NumberField
            label="Vacancy rate (%)"
            value={vacancyRate}
            onChange={setVacancyRate}
            step="0.1"
          />
        </Toggle>

        <Toggle
          label="Adjust monthly expenses"
          checked={expenseOn}
          onCheckedChange={setExpenseOn}
        >
          <NumberField
            label="+/- per month ($)"
            value={expenseDelta}
            onChange={setExpenseDelta}
            step="0.01"
          />
        </Toggle>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-sm">
        <span className="text-muted-foreground">
          {horizon}-month total net cash flow
        </span>
        <span className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-muted-foreground">{money(baselineTotal)}</span>
          {anyActive && (
            <>
              <span>→</span>
              <span className="font-semibold">{money(scenarioTotal)}</span>
              <span
                className={cn(
                  scenarioTotal - baselineTotal < 0
                    ? "text-negative"
                    : "text-positive",
                )}
              >
                ({moneySigned(scenarioTotal - baselineTotal)})
              </span>
            </>
          )}
        </span>
      </div>

      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Month</TableHead>
            <TableHead className="text-right">Baseline net</TableHead>
            <TableHead className="text-right">Scenario net</TableHead>
            <TableHead className="pr-5 text-right">Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cashflow.map((base, i) => {
            const scenario = scenarioRows[i];
            const delta = scenario.netCashflowCents - base.net_cashflow_cents;
            return (
              <TableRow key={base.month}>
                <TableCell className="pl-5">{monthLabel(base.month)}</TableCell>
                <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                  {money(base.net_cashflow_cents)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  {money(scenario.netCashflowCents)}
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-5 text-right font-mono tabular-nums",
                    delta === 0
                      ? "text-muted-foreground"
                      : delta < 0
                        ? "text-negative"
                        : "text-positive",
                  )}
                >
                  {delta === 0 ? "—" : moneySigned(delta)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
