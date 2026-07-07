import { StatTile } from "@/components/ui/StatTile";
import { money, moneySigned } from "@/lib/format";

export function PortfolioSummary({
  propertyCount,
  totalCashInvestedCents,
  totalMonthlyNetCents,
}: {
  propertyCount: number;
  totalCashInvestedCents: number;
  totalMonthlyNetCents: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile label="Properties" value={propertyCount} />
      <StatTile
        label="Total cash invested"
        value={money(totalCashInvestedCents)}
      />
      <StatTile
        label="Monthly cash flow"
        value={moneySigned(totalMonthlyNetCents)}
        tone={totalMonthlyNetCents < 0 ? "negative" : "positive"}
        sub="Stabilized, across portfolio"
      />
    </div>
  );
}
