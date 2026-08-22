import { describe, expect, it } from "vitest";
import {
  monthlyPiCents,
  remainingBalanceCents,
  projectScenario,
  type ScenarioBaseline,
  type ScenarioLoan,
} from "@/lib/scenario";

describe("monthlyPiCents", () => {
  it("matches the real 117 Willow Cove VA loan figure ($301,853 @ 5.5%/30yr -> $1,713.89)", () => {
    expect(monthlyPiCents(301_853_00, 0.055, 360)).toBe(171_389);
  });

  it("falls back to straight-line amortization when the rate is 0", () => {
    expect(monthlyPiCents(120_000, 0, 12)).toBe(10_000);
  });

  it("returns 0 for a non-positive term", () => {
    expect(monthlyPiCents(100_000, 0.05, 0)).toBe(0);
  });
});

describe("remainingBalanceCents", () => {
  it("returns the original amount when no payments have been made", () => {
    expect(remainingBalanceCents(301_853_00, 0.055, 360, 0)).toBe(301_853_00);
  });

  it("returns 0 once the full term has been paid", () => {
    expect(remainingBalanceCents(301_853_00, 0.055, 360, 360)).toBe(0);
  });

  it("decreases monotonically as more payments are made", () => {
    const after12 = remainingBalanceCents(301_853_00, 0.055, 360, 12);
    const after60 = remainingBalanceCents(301_853_00, 0.055, 360, 60);
    expect(after12).toBeLessThan(301_853_00);
    expect(after60).toBeLessThan(after12);
  });

  it("amortizes a 0% loan in a straight line", () => {
    // $12,000 over 12 months at 0% = $1,000/mo of pure principal
    expect(remainingBalanceCents(1_200_000, 0, 12, 6)).toBe(600_000);
  });
});

describe("projectScenario", () => {
  const baseline: ScenarioBaseline = {
    grossRentCents: 171_389 * 0, // unused directly below; overridden per test
    otherIncomeCents: 0,
    operatingExpenseCents: 20_000,
    debtServiceCents: 171_389 + 50_000, // P&I + $500 escrow
    vacancyReserveCents: 9_000, // 5% of a $180,000 gross rent baseline
    maintenanceReserveCents: 15_000,
  };
  const rentBaseline: ScenarioBaseline = {
    ...baseline,
    grossRentCents: 180_000,
  };
  const loan: ScenarioLoan = {
    originalAmountCents: 301_853_00,
    interestRate: 0.055,
    termMonths: 360,
    firstPaymentDate: "2026-08-01",
    piOverrideCents: null,
  };

  it("with no overrides, reproduces the same baseline every month", () => {
    const rows = projectScenario("2026-08-01", 3, rentBaseline, loan, {});
    for (const row of rows) {
      expect(row.incomeCents).toBe(180_000);
      expect(row.debtServiceCents).toBe(rentBaseline.debtServiceCents);
      expect(row.operatingExpenseCents).toBe(20_000);
      expect(row.vacancyReserveCents).toBe(9_000);
      expect(row.maintenanceReserveCents).toBe(15_000);
      expect(row.oneTimeCostCents).toBe(0);
    }
    expect(rows.map((r) => r.month)).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("applies a new income figure from the effective month onward, recomputing the vacancy reserve off it", () => {
    const rows = projectScenario("2026-08-01", 3, rentBaseline, loan, {
      newIncomeCents: 200_000,
      incomeEffectiveMonth: 1,
    });
    expect(rows[0].incomeCents).toBe(180_000);
    expect(rows[0].vacancyReserveCents).toBe(9_000);
    expect(rows[1].incomeCents).toBe(200_000);
    expect(rows[1].vacancyReserveCents).toBe(10_000); // 5% of 200,000
    expect(rows[2].incomeCents).toBe(200_000);
  });

  it("keeps debt service at baseline before a refinance's effective month, then recomputes P&I on the remaining balance at the new rate", () => {
    const rows = projectScenario("2026-08-01", 4, rentBaseline, loan, {
      refi: { newInterestRate: 0.045, newTermMonths: 360, effectiveMonth: 2 },
    });
    expect(rows[0].debtServiceCents).toBe(rentBaseline.debtServiceCents);
    expect(rows[1].debtServiceCents).toBe(rentBaseline.debtServiceCents);

    const escrowCents = rentBaseline.debtServiceCents - 171_389;
    const balanceAtRefi = remainingBalanceCents(
      301_853_00,
      0.055,
      360,
      2, // 2 payments made by month index 2 (2026-10), from first_payment_date 2026-08
    );
    const expectedNewPi = monthlyPiCents(balanceAtRefi, 0.045, 360);
    expect(rows[2].debtServiceCents).toBe(expectedNewPi + escrowCents);
    expect(rows[2].debtServiceCents).toBeLessThan(
      rentBaseline.debtServiceCents,
    ); // lower rate -> lower payment
    expect(rows[3].debtServiceCents).toBe(expectedNewPi + escrowCents); // stays refinanced afterward
  });

  it("subtracts a one-time refinance cost only in the effective month", () => {
    const rows = projectScenario("2026-08-01", 3, rentBaseline, loan, {
      refi: {
        newInterestRate: 0.045,
        newTermMonths: 360,
        effectiveMonth: 1,
        refiCostCents: 500_000,
      },
    });
    expect(rows[0].oneTimeCostCents).toBe(0);
    expect(rows[1].oneTimeCostCents).toBe(500_000);
    expect(rows[2].oneTimeCostCents).toBe(0);
  });

  it("overrides the vacancy rate for the whole horizon when given explicitly", () => {
    const rows = projectScenario("2026-08-01", 2, rentBaseline, loan, {
      vacancyRateFraction: 0.1,
    });
    for (const row of rows) expect(row.vacancyReserveCents).toBe(18_000); // 10% of 180,000
  });

  it("adds a flat monthly expense delta (positive or negative) to every month", () => {
    const rows = projectScenario("2026-08-01", 2, rentBaseline, loan, {
      extraMonthlyExpenseCents: -5_000,
    });
    for (const row of rows) expect(row.operatingExpenseCents).toBe(15_000);
  });

  it("handles a null loan (paid off / no active loan) without throwing", () => {
    const noLoanBaseline: ScenarioBaseline = {
      ...rentBaseline,
      debtServiceCents: 50_000, // escrow only
    };
    const rows = projectScenario("2026-08-01", 2, noLoanBaseline, null, {
      refi: { newInterestRate: 0.045, newTermMonths: 360, effectiveMonth: 0 },
    });
    // no loan to refinance -> refi override is a no-op, baseline debt service holds
    expect(rows[0].debtServiceCents).toBe(50_000);
    expect(rows[1].debtServiceCents).toBe(50_000);
  });
});
