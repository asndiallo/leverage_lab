import { StatTile } from "@/components/ui/StatTile";
import { money, moneySigned, percent } from "@/lib/format";

export function MetricsRow({
  stabilizedNetCents,
  cashInvestedCents,
  taxBasisCents,
  grossYield,
  cashOnCash,
  annualTaxCents,
  taxYear,
}: {
  stabilizedNetCents: number | null;
  cashInvestedCents: number | null;
  taxBasisCents: number;
  grossYield: number | null;
  cashOnCash: number | null;
  annualTaxCents: number;
  taxYear: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <StatTile
        label="Monthly cash flow"
        value={moneySigned(stabilizedNetCents)}
        tone={(stabilizedNetCents ?? 0) < 0 ? "negative" : "positive"}
        sub="Stabilized"
        help="Projected net cash flow for the first fully stabilized month (once the loan's first full payment is due): income minus debt service, operating expenses, and reserves (vacancy + maintenance allowances)."
      />
      <StatTile
        label="Cash invested"
        value={money(cashInvestedCents)}
        help="Total cash the owner put in: purchase price + owner-paid closing costs − original loan amount − seller/borrower credits, plus any owner-paid capital improvements since closing."
      />
      <StatTile
        label="Tax basis"
        value={money(taxBasisCents)}
        help="Purchase price + capital improvements − seller credits. An estimate used for property-tax exposure, not current market value."
      />
      <StatTile
        label="Gross yield"
        value={percent(grossYield)}
        sub="Annual rent / price"
        help="Annualized in-place rent (sum of active leases × 12) ÷ purchase price. A rough top-line measure before expenses, reserves, or financing — reads 0% if there's no active lease."
      />
      <StatTile
        label="Cash on cash"
        value={percent(cashOnCash)}
        tone={cashOnCash != null && cashOnCash < 0 ? "negative" : "ink"}
        sub="Trailing 12mo net / cash invested"
        help="Trailing-12-month net cash flow ÷ cash invested. Return on the actual cash put into the deal — with a small cash-invested base, this can swing to extreme percentages."
      />
      <StatTile
        label="Property tax"
        value={money(annualTaxCents)}
        sub={taxYear ? `${taxYear} / yr` : undefined}
        help="Sum of each taxing jurisdiction's rate applied to the assessed value for the year shown, after any exemptions."
      />
    </div>
  );
}
