import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  getCategories,
  getVacancyPeriods,
  getHomesteadStatus,
  getTaxWithHomesteadCents,
  getPropertyMembers,
  getPendingInvites,
} from "@/lib/queries";
import { firstOfMonthISO, laterMonthISO } from "@/lib/format";
import { HeaderCard } from "@/components/HeaderCard";
import { MetricsRow } from "@/components/MetricsRow";
import { CashflowStrip } from "@/components/CashflowStrip";
import { TaxBreakdown } from "@/components/TaxBreakdown";
import { TransactionsTable } from "@/components/TransactionsTable";
import { LeaseForm } from "@/components/forms/LeaseForm";
import { ImportLeaseDialog } from "@/components/forms/ImportLeaseDialog";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { CoOwnersCard } from "@/components/forms/CoOwnersCard";

export const dynamic = "force-dynamic";

const HORIZONS = [12, 24, 60];

export default async function PropertyPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ horizon?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const property = await getProperty(params.id);
  if (!property) notFound();

  const horizon = HORIZONS.includes(Number(searchParams.horizon))
    ? Number(searchParams.horizon)
    : 12;

  const [
    loans,
    loanPayments,
    yields,
    taxBasisCents,
    taxYear,
    transactions,
    categories,
    vacancyPeriods,
    members,
    pendingInvites,
  ] = await Promise.all([
    getLoans(params.id),
    getLoanPayments(params.id),
    getPropertyYields(params.id),
    getTaxBasisCents(params.id),
    getLatestTaxRateYear(params.id),
    getTransactions(params.id),
    getCategories(),
    getVacancyPeriods(params.id),
    getPropertyMembers(params.id),
    getPendingInvites(params.id),
  ]);

  const homestead = await getHomesteadStatus(params.id);

  const loan = loans.find((l) => l.status === "active") ?? loans[0] ?? null;
  const loanPayment =
    loanPayments.find((p) => p.loan_id === loan?.id) ?? loanPayments[0] ?? null;

  // Start the projection at the "stabilized" month (first full-PITI payment).
  const firstPay = loans
    .map((l) => l.first_payment_date)
    .filter((d): d is string => !!d)
    .sort()[0];
  const startMonth = firstPay
    ? laterMonthISO(firstOfMonthISO(new Date()), firstOfMonthISO(firstPay))
    : firstOfMonthISO(new Date());

  const [escrow, cashflow, taxBreakdown, withHomesteadCents] =
    await Promise.all([
      getCurrentEscrow(params.id, startMonth),
      getCashflowRange(params.id, startMonth, horizon),
      taxYear ? getTaxBreakdown(params.id, taxYear) : Promise.resolve([]),
      taxYear
        ? getTaxWithHomesteadCents(params.id, taxYear)
        : Promise.resolve(0),
    ]);

  const annualTaxCents = taxBreakdown.reduce((s, r) => s + r.tax_cents, 0);
  const stabilizedNetCents = cashflow[0]?.net_cashflow_cents ?? null;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Portfolio
      </Link>

      <HeaderCard
        property={property}
        loan={loan}
        loanPayment={loanPayment}
        escrow={escrow}
      />

      <MetricsRow
        stabilizedNetCents={stabilizedNetCents}
        cashInvestedCents={yields?.total_cash_invested_cents ?? null}
        taxBasisCents={taxBasisCents}
        grossYield={yields?.gross_yield ?? null}
        annualTaxCents={annualTaxCents}
        taxYear={taxYear}
      />

      <div className="flex flex-wrap gap-3">
        <LeaseForm propertyId={params.id} />
        <ImportLeaseDialog propertyId={params.id} />
        <TransactionForm propertyId={params.id} categories={categories} />
      </div>

      <CoOwnersCard
        propertyId={params.id}
        members={members}
        pendingInvites={pendingInvites}
      />

      <CashflowStrip
        rows={cashflow}
        horizon={horizon}
        vacancyPeriods={vacancyPeriods}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaxBreakdown
          rows={taxBreakdown}
          year={taxYear}
          propertyId={params.id}
          annualTaxCents={annualTaxCents}
          withHomesteadCents={withHomesteadCents}
          homesteadFiled={homestead.filed}
        />
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
}
