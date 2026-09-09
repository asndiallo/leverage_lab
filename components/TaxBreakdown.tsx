import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, taxRatePer100 } from "@/lib/format";
import { HomesteadToggle } from "@/components/HomesteadToggle";
import { AddTaxYearForm } from "@/components/forms/AddTaxYearForm";
import { AddAssessedValueForm } from "@/components/forms/AddAssessedValueForm";
import type { TaxBreakdownRow, TaxingJurisdiction } from "@/types/database";

export function TaxBreakdown({
  rows,
  year,
  propertyId,
  annualTaxCents,
  withHomesteadCents,
  homesteadFiled,
  jurisdictions,
}: {
  rows: TaxBreakdownRow[];
  year: number | null;
  propertyId: string;
  annualTaxCents: number;
  withHomesteadCents: number;
  homesteadFiled: boolean;
  jurisdictions: TaxingJurisdiction[];
}) {
  const total = rows.reduce((s, r) => s + r.tax_cents, 0);
  const savings = annualTaxCents - withHomesteadCents;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="font-medium">
            Property tax{year ? ` — ${year}` : ""}
          </h2>
          <p className="text-muted-foreground text-xs">
            Guadalupe County · multi-jurisdiction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddAssessedValueForm propertyId={propertyId} />
          <AddTaxYearForm propertyId={propertyId} jurisdictions={jurisdictions} />
        </div>
      </div>
      {rows.length === 0 && (
        <p className="text-muted-foreground border-b px-5 py-3 text-xs">
          No tax rates on record for {year ?? "this year"} yet — add them
          above once your county certificate arrives.
        </p>
      )}
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Jurisdiction</TableHead>
            <TableHead className="text-right">Rate /$100</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="pr-5 text-right">Tax</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.jurisdiction_id}>
              <TableCell className="pl-5">{r.name}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {taxRatePer100(r.rate)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {money(r.taxable_cents)}
              </TableCell>
              <TableCell className="pr-5 text-right font-mono tabular-nums">
                {money(r.tax_cents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-5 font-semibold" colSpan={3}>
              Total
            </TableCell>
            <TableCell className="pr-5 text-right font-mono font-semibold tabular-nums">
              {money(total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs">
        <div className="text-muted-foreground">
          Homestead{" "}
          {homesteadFiled ? (
            <span className="text-positive font-medium">filed</span>
          ) : (
            "not yet filed"
          )}{" "}
          · effective TY2027. Projected savings once active:{" "}
          <span className="text-positive font-medium">{money(savings)}/yr</span>{" "}
          (~
          {money(withHomesteadCents)} vs {money(annualTaxCents)}).
        </div>
        <HomesteadToggle propertyId={propertyId} filed={homesteadFiled} />
      </div>
    </Card>
  );
}
