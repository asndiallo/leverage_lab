import { describe, expect, it } from "vitest";
import { calculateCagr, computeEquityStats } from "@/lib/equity";
import type { EquitySeriesPoint } from "@/types/database";

function point(
  snapshot_date: string,
  value_cents: number,
  loan_balance_cents: number,
  source: EquitySeriesPoint["source"] = "manual",
): EquitySeriesPoint {
  return {
    id: source === "purchase" ? null : "00000000-0000-0000-0000-000000000000",
    snapshot_date,
    value_cents,
    loan_balance_cents,
    equity_cents: value_cents - loan_balance_cents,
    source,
  };
}

describe("calculateCagr", () => {
  it("computes standard doubling over exactly one year", () => {
    // years-between uses a 365.25-day average year (the standard CAGR
    // convention, so leap-year timing doesn't skew the rate), so a calendar
    // year is ~0.75 days short of that — expect ~100%, not exactly 100%.
    expect(
      calculateCagr(10_000_00, 20_000_00, "2025-01-01", "2026-01-01"),
    ).toBeCloseTo(1.0, 2);
  });

  it("computes appreciation over a multi-year span", () => {
    // $295,500 -> $315,000 over exactly 2 years
    const cagr = calculateCagr(
      29_550_000,
      31_500_000,
      "2026-07-16",
      "2028-07-16",
    );
    expect(cagr).toBeCloseTo(0.0324, 3); // ~3.24%/yr
  });

  it("returns null for a non-positive start value", () => {
    expect(calculateCagr(0, 10_000_00, "2025-01-01", "2026-01-01")).toBeNull();
    expect(
      calculateCagr(-635_300, 10_000_00, "2025-01-01", "2026-01-01"),
    ).toBeNull();
  });

  it("returns null when the end date isn't after the start date", () => {
    expect(
      calculateCagr(10_000_00, 20_000_00, "2026-01-01", "2026-01-01"),
    ).toBeNull();
    expect(
      calculateCagr(10_000_00, 20_000_00, "2026-01-01", "2025-01-01"),
    ).toBeNull();
  });

  it("handles a value decline (negative CAGR)", () => {
    const cagr = calculateCagr(
      20_000_00,
      18_000_00,
      "2025-01-01",
      "2026-01-01",
    );
    expect(cagr).toBeLessThan(0);
    expect(cagr).toBeCloseTo(-0.1, 3);
  });
});

describe("computeEquityStats", () => {
  it("returns null with fewer than two points", () => {
    expect(computeEquityStats([])).toBeNull();
    expect(
      computeEquityStats([point("2026-07-16", 29_550_000, 30_185_300)]),
    ).toBeNull();
  });

  it("computes value CAGR and dollar equity change over the full series", () => {
    const series = [
      point("2026-07-16", 29_550_000, 30_185_300, "purchase"), // equity -635,300
      point("2027-07-16", 31_500_000, 29_500_000, "zillow_estimate"), // equity 2,000,000
    ];
    const stats = computeEquityStats(series)!;
    expect(stats.years).toBeCloseTo(1, 2);
    expect(stats.valueCagr).toBeCloseTo(31_500_000 / 29_550_000 - 1, 4);
    expect(stats.totalEquityChangeCents).toBe(2_000_000 - -635_300);
    expect(stats.firstEquityCents).toBe(-635_300);
    expect(stats.lastEquityCents).toBe(2_000_000);
  });

  it("leaves equityCagr null when equity starts non-positive (financed VA funding fee)", () => {
    const series = [
      point("2026-07-16", 29_550_000, 30_185_300, "purchase"), // equity -635,300
      point("2027-07-16", 31_500_000, 29_500_000, "zillow_estimate"), // equity 2,000,000
    ];
    const stats = computeEquityStats(series)!;
    expect(stats.equityCagr).toBeNull();
    // but the dollar change is still meaningful and reported
    expect(stats.totalEquityChangeCents).toBe(2_635_300);
  });

  it("computes equityCagr once both endpoints are positive", () => {
    const series = [
      point("2026-07-16", 29_550_000, 28_000_000, "purchase"), // equity 1,550,000
      point("2027-07-16", 31_500_000, 27_000_000, "zillow_estimate"), // equity 4,500,000
    ];
    const stats = computeEquityStats(series)!;
    expect(stats.equityCagr).toBeCloseTo(4_500_000 / 1_550_000 - 1, 2);
  });

  it("uses only the first and last point when more than two are given", () => {
    const series = [
      point("2026-07-16", 29_550_000, 30_185_300, "purchase"),
      point("2027-01-16", 30_000_000, 29_800_000, "manual"), // ignored for the endpoints
      point("2027-07-16", 31_500_000, 29_500_000, "zillow_estimate"),
    ];
    const stats = computeEquityStats(series)!;
    expect(stats.firstEquityCents).toBe(-635_300);
    expect(stats.lastEquityCents).toBe(2_000_000);
  });
});
