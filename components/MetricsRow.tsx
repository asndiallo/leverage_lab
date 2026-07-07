import { StatTile } from "@/components/ui/StatTile";
import { money, moneySigned, percent } from "@/lib/format";

export function MetricsRow({
  stabilizedNetCents,
  cashInvestedCents,
  taxBasisCents,
  grossYield,
  annualTaxCents,
  taxYear,
}: {
  stabilizedNetCents: number | null;
  cashInvestedCents: number | null;
  taxBasisCents: number;
  grossYield: number | null;
  annualTaxCents: number;
  taxYear: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile
        label="Monthly cash flow"
        value={moneySigned(stabilizedNetCents)}
        tone={(stabilizedNetCents ?? 0) < 0 ? "negative" : "positive"}
        sub="Stabilized"
      />
      <StatTile label="Cash invested" value={money(cashInvestedCents)} />
      <StatTile label="Tax basis" value={money(taxBasisCents)} />
      <StatTile
        label="Gross yield"
        value={percent(grossYield)}
        sub="Annual rent / price"
      />
      <StatTile
        label="Property tax"
        value={money(annualTaxCents)}
        sub={taxYear ? `${taxYear} / yr` : undefined}
      />
    </div>
  );
}
