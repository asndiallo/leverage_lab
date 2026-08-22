/**
 * Client-side "what-if" projections layered on top of the real,
 * server-computed cash flow (property_monthly_cashflow in
 * 20260705000005_functions_views.sql). Nothing here is persisted or written
 * to the database — it recomputes a parallel monthly strip in memory from
 * the same baseline numbers already on the property page (the stabilized
 * projected month + the active loan), so scenario sliders can update
 * instantly without a round trip.
 *
 * Simplifications relative to the real SQL projection (acceptable for a
 * directional what-if tool, not a substitute for it):
 *   - Baseline income/expenses are held flat across the whole horizon
 *     (the real projection can vary month-to-month, e.g. a lease ending) —
 *     a scenario's income/refi overrides are the only source of change here.
 *   - Escrow (tax/insurance/HOA) is derived once as
 *     `baseline.debtServiceCents - baseline P&I` and held constant; a
 *     refinance changes only the P&I portion of debt service.
 */

export type ScenarioBaseline = {
  grossRentCents: number;
  otherIncomeCents: number;
  operatingExpenseCents: number;
  debtServiceCents: number;
  vacancyReserveCents: number;
  maintenanceReserveCents: number;
};

export type ScenarioLoan = {
  originalAmountCents: number;
  interestRate: number; // annual fraction, e.g. 0.055
  termMonths: number;
  firstPaymentDate: string | null; // 'YYYY-MM-DD'
  piOverrideCents: number | null;
};

export type RefiOverride = {
  newInterestRate: number;
  newTermMonths: number;
  effectiveMonth: number; // 0-indexed offset from the projection start month
  refiCostCents?: number; // one-time cost, subtracted in the effective month only
};

export type ScenarioOverrides = {
  newIncomeCents?: number; // replaces grossRent + otherIncome combined
  incomeEffectiveMonth?: number; // 0-indexed, defaults to 0
  refi?: RefiOverride;
  vacancyRateFraction?: number; // replaces the baseline-derived rate
  extraMonthlyExpenseCents?: number; // added to operatingExpenseCents every month (can be negative)
};

export type ScenarioMonth = {
  month: string; // 'YYYY-MM-01'
  incomeCents: number;
  debtServiceCents: number;
  operatingExpenseCents: number;
  vacancyReserveCents: number;
  maintenanceReserveCents: number;
  oneTimeCostCents: number;
  netCashflowCents: number;
};

/** Standard fully-amortizing monthly payment, in cents. Falls back to
 * straight-line if the rate is 0. Mirrors mortgage_monthly_pi in SQL — kept
 * in sync by testing both against the same real loan figures. */
export function monthlyPiCents(
  principalCents: number,
  annualRate: number,
  termMonths: number,
): number {
  if (!termMonths || termMonths <= 0) return 0;
  if (!annualRate) return Math.round(principalCents / termMonths);
  const r = annualRate / 12;
  return Math.round(
    (principalCents * r) / (1 - Math.pow(1 + r, -termMonths)),
  );
}

/** Remaining principal after `paymentsMade` monthly payments, amortizing
 * month-by-month (rather than the closed-form formula) so it matches a real
 * amortization schedule's rounding, not an idealized continuous one. */
export function remainingBalanceCents(
  originalAmountCents: number,
  annualRate: number,
  termMonths: number,
  paymentsMade: number,
): number {
  const n = Math.max(0, Math.min(paymentsMade, termMonths));
  if (n === 0) return originalAmountCents;
  if (n >= termMonths) return 0;
  const payment = monthlyPiCents(originalAmountCents, annualRate, termMonths);
  const monthlyRate = annualRate / 12;
  let balance = originalAmountCents;
  for (let i = 0; i < n; i++) {
    const interest = Math.round(balance * monthlyRate);
    balance = Math.max(balance - (payment - interest), 0);
  }
  return balance;
}

function addMonths(monthISO: string, n: number): string {
  const [y, m] = monthISO.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function projectScenario(
  startMonthISO: string,
  months: number,
  baseline: ScenarioBaseline,
  loan: ScenarioLoan | null,
  overrides: ScenarioOverrides,
): ScenarioMonth[] {
  const baselineVacancyRate =
    baseline.grossRentCents > 0
      ? baseline.vacancyReserveCents / baseline.grossRentCents
      : 0;
  const vacancyRate = overrides.vacancyRateFraction ?? baselineVacancyRate;

  const baselinePiCents = loan
    ? (loan.piOverrideCents ??
      monthlyPiCents(loan.originalAmountCents, loan.interestRate, loan.termMonths))
    : 0;
  const escrowCents = baseline.debtServiceCents - baselinePiCents;

  const incomeEffectiveMonth = overrides.incomeEffectiveMonth ?? 0;

  const rows: ScenarioMonth[] = [];
  for (let i = 0; i < months; i++) {
    const month = addMonths(startMonthISO, i);

    const incomeOverridden =
      overrides.newIncomeCents !== undefined && i >= incomeEffectiveMonth;
    const incomeCents = incomeOverridden
      ? overrides.newIncomeCents!
      : baseline.grossRentCents + baseline.otherIncomeCents;
    const grossRentForVacancyCents = incomeOverridden
      ? overrides.newIncomeCents!
      : baseline.grossRentCents;

    let debtServiceCents = baseline.debtServiceCents;
    let oneTimeCostCents = 0;
    const refi = overrides.refi;
    if (refi && loan && i >= refi.effectiveMonth) {
      const paymentsMadeAtRefi = monthsBetween(
        loan.firstPaymentDate ?? startMonthISO,
        addMonths(startMonthISO, refi.effectiveMonth),
      );
      const balanceAtRefi = remainingBalanceCents(
        loan.originalAmountCents,
        loan.interestRate,
        loan.termMonths,
        paymentsMadeAtRefi,
      );
      const newPiCents = monthlyPiCents(
        balanceAtRefi,
        refi.newInterestRate,
        refi.newTermMonths,
      );
      debtServiceCents = newPiCents + escrowCents;
      if (i === refi.effectiveMonth) oneTimeCostCents = refi.refiCostCents ?? 0;
    }

    const operatingExpenseCents =
      baseline.operatingExpenseCents + (overrides.extraMonthlyExpenseCents ?? 0);
    const vacancyReserveCents = Math.round(grossRentForVacancyCents * vacancyRate);
    const maintenanceReserveCents = baseline.maintenanceReserveCents;

    const netCashflowCents =
      incomeCents -
      debtServiceCents -
      operatingExpenseCents -
      vacancyReserveCents -
      maintenanceReserveCents -
      oneTimeCostCents;

    rows.push({
      month,
      incomeCents,
      debtServiceCents,
      operatingExpenseCents,
      vacancyReserveCents,
      maintenanceReserveCents,
      oneTimeCostCents,
      netCashflowCents,
    });
  }
  return rows;
}
