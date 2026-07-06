// Formatting helpers. The DB computes in integer cents / numeric fractions;
// the UI only formats. Never do money math in JS floats.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** cents (integer) -> "$1,713.89" */
export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return USD.format(cents / 100);
}

/** cents (integer) -> "$296K"-style whole dollars, no cents */
export function moneyWhole(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return USD0.format(Math.round(cents / 100));
}

/** signed money with explicit +/- and sign-based intent, e.g. -$2,599.64 */
export function moneySigned(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const s = money(Math.abs(cents));
  return cents < 0 ? `-${s}` : cents > 0 ? `+${s}` : s;
}

/** numeric fraction -> "5.19%" (rate is already a fraction, e.g. 0.0519) */
export function percent(fraction: number | null | undefined, digits = 2): string {
  if (fraction == null) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** a tax rate stored per $1 -> "$1.076900 / $100" display */
export function taxRatePer100(ratePerDollar: number): string {
  return `${(ratePerDollar * 100).toFixed(6)}`;
}

/** 'YYYY-MM-DD' or Date -> "Oct 2026" */
export function monthLabel(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** 'YYYY-MM-DD' or full ISO timestamp -> "Jul 9, 2026" */
export function dateLabel(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date =
    typeof d === "string" ? new Date(/[TZ]/.test(d) ? d : d + "T00:00:00") : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** bytes -> "148 KB" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Date/string -> 'YYYY-MM-01' (first of that month). */
export function firstOfMonthISO(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** later of two 'YYYY-MM-01' strings (lexicographic compare is valid here). */
export function laterMonthISO(a: string, b: string): string {
  return a >= b ? a : b;
}

/** dollars string/number -> integer cents (for form submission). */
export function dollarsToCents(dollars: string | number): number {
  const n = typeof dollars === "string" ? Number(dollars.replace(/[^0-9.-]/g, "")) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
