import { money, taxRatePer100 } from "@/lib/format";
import type { TaxBreakdownRow } from "@/types/database";

export function TaxBreakdown({ rows, year }: { rows: TaxBreakdownRow[]; year: number | null }) {
  const total = rows.reduce((s, r) => s + r.tax_cents, 0);
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
      <p className="border-t border-border px-5 py-3 text-xs text-muted">
        Homestead not yet filed — you plan to apply after closing. Once filed, the SCUCISD $140K,
        City $5K, County 1% (min $5K), and Lateral Roads 1%+$3K exemptions take effect for tax year
        2027.
      </p>
    </div>
  );
}
