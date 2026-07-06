import { money, taxRatePer100 } from "@/lib/format";
import { HomesteadToggle } from "@/components/HomesteadToggle";
import type { TaxBreakdownRow } from "@/types/database";

export function TaxBreakdown({
  rows,
  year,
  propertyId,
  annualTaxCents,
  withHomesteadCents,
  homesteadFiled,
}: {
  rows: TaxBreakdownRow[];
  year: number | null;
  propertyId: string;
  annualTaxCents: number;
  withHomesteadCents: number;
  homesteadFiled: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.tax_cents, 0);
  const savings = annualTaxCents - withHomesteadCents;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-medium">Property tax{year ? ` — ${year}` : ""}</h2>
        <p className="text-xs text-muted">Guadalupe County · multi-jurisdiction</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-medium">Jurisdiction</th>
              <th className="px-5 py-2 text-right font-medium">Rate /$100</th>
              <th className="px-5 py-2 text-right font-medium">Taxable</th>
              <th className="px-5 py-2 text-right font-medium">Tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.jurisdiction_id} className="border-t border-border">
                <td className="px-5 py-2">{r.name}</td>
                <td className="px-5 py-2 text-right tabular-nums">{taxRatePer100(r.rate)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{money(r.taxable_cents)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{money(r.tax_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="px-5 py-2" colSpan={3}>
                Total
              </td>
              <td className="px-5 py-2 text-right tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs">
        <div className="text-muted">
          Homestead{" "}
          {homesteadFiled ? (
            <span className="font-medium text-positive">filed</span>
          ) : (
            "not yet filed"
          )}{" "}
          · effective TY2027. Projected savings once active:{" "}
          <span className="font-medium text-positive">{money(savings)}/yr</span> (~
          {money(withHomesteadCents)} vs {money(annualTaxCents)}).
        </div>
        <HomesteadToggle propertyId={propertyId} filed={homesteadFiled} />
      </div>
    </div>
  );
}
