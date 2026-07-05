import { getProperties, getPortfolioYields, getLoans, getCashflowRange } from "@/lib/queries";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { PropertyCard } from "@/components/PropertyCard";
import { firstOfMonthISO, laterMonthISO } from "@/lib/format";
import type { MonthlyCashflow } from "@/types/database";

export const dynamic = "force-dynamic";

// The headline monthly figure for a property is its first "stabilized" month:
// the later of this month and the loan's first payment (when full PITI begins).
function stabilizedMonth(firstPaymentDate: string | null | undefined): string {
  const thisMonth = firstOfMonthISO(new Date());
  return firstPaymentDate ? laterMonthISO(thisMonth, firstOfMonthISO(firstPaymentDate)) : thisMonth;
}

export default async function PortfolioPage() {
  const [properties, yields] = await Promise.all([getProperties(), getPortfolioYields()]);
  const yieldsById = new Map(yields.map((y) => [y.property_id, y]));

  const rows = await Promise.all(
    properties.map(async (property) => {
      const loans = await getLoans(property.id);
      const firstPay = loans
        .map((l) => l.first_payment_date)
        .filter((d): d is string => !!d)
        .sort()[0];
      const [cf] = (await getCashflowRange(property.id, stabilizedMonth(firstPay), 1)) as MonthlyCashflow[];
      return {
        property,
        cashInvestedCents: yieldsById.get(property.id)?.total_cash_invested_cents ?? null,
        monthlyNetCents: cf?.net_cashflow_cents ?? null,
        isVacant: cf?.is_vacant ?? false,
      };
    }),
  );

  const totalCashInvested = rows.reduce((s, r) => s + (r.cashInvestedCents ?? 0), 0);
  const totalMonthlyNet = rows.reduce((s, r) => s + (r.monthlyNetCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <p className="text-sm text-muted">Predictive cash flow across your properties.</p>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          No properties yet. Data entry forms are coming in the next slice.
        </div>
      ) : (
        <>
          <PortfolioSummary
            propertyCount={properties.length}
            totalCashInvestedCents={totalCashInvested}
            totalMonthlyNetCents={totalMonthlyNet}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <PropertyCard key={r.property.id} {...r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
