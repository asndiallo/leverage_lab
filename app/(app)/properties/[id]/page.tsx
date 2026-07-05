import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProperty,
  getLoans,
  getLoanPayments,
  getCurrentEscrow,
  getPropertyYields,
  getTaxBasisCents,
  getLatestTaxRateYear,
  getTaxBreakdown,
  getCashflowRange,
  getTransactions,
} from "@/lib/queries";
import { firstOfMonthISO, laterMonthISO } from "@/lib/format";
import { HeaderCard } from "@/components/HeaderCard";
import { MetricsRow } from "@/components/MetricsRow";
import { CashflowStrip } from "@/components/CashflowStrip";
import { TaxBreakdown } from "@/components/TaxBreakdown";
import { TransactionsTable } from "@/components/TransactionsTable";

export const dynamic = "force-dynamic";

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const property = await getProperty(params.id);
  if (!property) notFound();

  const [loans, loanPayments, yields, taxBasisCents, taxYear, transactions] = await Promise.all([
    getLoans(params.id),
    getLoanPayments(params.id),
    getPropertyYields(params.id),
    getTaxBasisCents(params.id),
    getLatestTaxRateYear(params.id),
    getTransactions(params.id),
  ]);

  const loan = loans.find((l) => l.status === "active") ?? loans[0] ?? null;
  const loanPayment = loanPayments.find((p) => p.loan_id === loan?.id) ?? loanPayments[0] ?? null;

  // Start the projection at the "stabilized" month (first full-PITI payment).
  const firstPay = loans
    .map((l) => l.first_payment_date)
    .filter((d): d is string => !!d)
    .sort()[0];
  const startMonth = firstPay
    ? laterMonthISO(firstOfMonthISO(new Date()), firstOfMonthISO(firstPay))
    : firstOfMonthISO(new Date());

  const [escrow, cashflow, taxBreakdown] = await Promise.all([
    getCurrentEscrow(params.id, startMonth),
    getCashflowRange(params.id, startMonth, 12),
    taxYear ? getTaxBreakdown(params.id, taxYear) : Promise.resolve([]),
  ]);

  const annualTaxCents = taxBreakdown.reduce((s, r) => s + r.tax_cents, 0);
  const stabilizedNetCents = cashflow[0]?.net_cashflow_cents ?? null;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Portfolio
      </Link>

      <HeaderCard property={property} loan={loan} loanPayment={loanPayment} escrow={escrow} />

      <MetricsRow
        stabilizedNetCents={stabilizedNetCents}
        cashInvestedCents={yields?.total_cash_invested_cents ?? null}
        taxBasisCents={taxBasisCents}
        grossYield={yields?.gross_yield ?? null}
        annualTaxCents={annualTaxCents}
        taxYear={taxYear}
      />

      <CashflowStrip rows={cashflow} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaxBreakdown rows={taxBreakdown} year={taxYear} />
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
}
