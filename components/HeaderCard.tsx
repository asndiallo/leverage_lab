import { Badge } from "@/components/ui/Badge";
import { money, percent, dateLabel } from "@/lib/format";
import type { Property, Loan, LoanPayment, EscrowSchedule, PropertyStatus } from "@/types/database";

const statusVariant: Record<PropertyStatus, "positive" | "warn" | "neutral"> = {
  active: "positive",
  pending: "warn",
  sold: "neutral",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  );
}

export function HeaderCard({
  property,
  loan,
  loanPayment,
  escrow,
}: {
  property: Property;
  loan: Loan | null;
  loanPayment: LoanPayment | null;
  escrow: EscrowSchedule | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{property.address}</h1>
          <p className="text-sm text-muted">
            {property.city}, {property.state} {property.zip}
          </p>
          {property.cad_account && (
            <p className="mt-1 text-xs text-muted">
              CAD {property.cad_account}
              {property.parcel_id ? ` · Parcel ${property.parcel_id}` : ""}
            </p>
          )}
        </div>
        <Badge variant={statusVariant[property.status]}>{property.status}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        <div>
          <Row label="Purchase price" value={money(property.purchase_price_cents)} />
          <Row label="Purchase date" value={dateLabel(property.purchase_date)} />
          {loan && (
            <>
              <Row label="Lender" value={loan.lender ?? "—"} />
              <Row
                label="Loan"
                value={`${money(loan.original_amount_cents)} · ${percent(loan.interest_rate)} · ${loan.term_months / 12}yr`}
              />
            </>
          )}
        </div>
        <div>
          {loanPayment && <Row label="Monthly P&I" value={money(loanPayment.monthly_pi_cents)} />}
          {escrow && (
            <>
              <Row label="Tax escrow" value={money(escrow.monthly_tax_escrow_cents)} />
              <Row label="Insurance escrow" value={money(escrow.monthly_insurance_escrow_cents)} />
              {escrow.monthly_hoa_cents > 0 && (
                <Row label="HOA" value={money(escrow.monthly_hoa_cents)} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
