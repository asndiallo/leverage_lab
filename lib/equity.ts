import type { EquitySeriesPoint } from "@/types/database";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function yearsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  return (end - start) / MS_PER_YEAR;
}

/** Compound annual growth rate between two positive values. CAGR is only
 * defined for a positive start value (you can't take a fractional root of a
 * non-positive base) — returns null rather than a misleading number for a
 * zero/negative start, or a non-positive time span. */
export function calculateCagr(
  startCents: number,
  endCents: number,
  startDate: string,
  endDate: string,
): number | null {
  if (startCents <= 0) return null;
  const years = yearsBetween(startDate, endDate);
  if (years <= 0) return null;
  return Math.pow(endCents / startCents, 1 / years) - 1;
}

export type EquityStats = {
  years: number;
  /** Property value CAGR (appreciation rate) — always computable, since
   * value is never non-positive. */
  valueCagr: number | null;
  /** Equity CAGR — null (not just a bad number) when equity was zero or
   * negative at the start of the series, e.g. a financed loan exceeding the
   * purchase price. CAGR is mathematically undefined there; report the plain
   * dollar change instead in that case. */
  equityCagr: number | null;
  totalEquityChangeCents: number;
  firstEquityCents: number;
  lastEquityCents: number;
};

/** Summary stats from a property_equity_series() result, oldest-to-newest.
 * Returns null if there are fewer than two points (nothing to compare). */
export function computeEquityStats(
  series: EquitySeriesPoint[],
): EquityStats | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];

  return {
    years: yearsBetween(first.snapshot_date, last.snapshot_date),
    valueCagr: calculateCagr(
      first.value_cents,
      last.value_cents,
      first.snapshot_date,
      last.snapshot_date,
    ),
    equityCagr: calculateCagr(
      first.equity_cents,
      last.equity_cents,
      first.snapshot_date,
      last.snapshot_date,
    ),
    totalEquityChangeCents: last.equity_cents - first.equity_cents,
    firstEquityCents: first.equity_cents,
    lastEquityCents: last.equity_cents,
  };
}
