import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";
import { RentalUseForm } from "@/components/forms/RentalUseForm";
import { TotalRoomsForm } from "@/components/forms/TotalRoomsForm";
import { ScheduleEYearSelector } from "@/components/ScheduleEYearSelector";
import { deleteRentalUsePeriod } from "@/lib/actions";
import { dateLabel, money, moneySigned, percent } from "@/lib/format";
import type {
  RentalUsePeriod,
  ScheduleELineCodeOrIncome,
  ScheduleELineRow,
} from "@/types/database";

// IRS Schedule E line number + plain-English explanation for each line this
// engine produces. Kept here (not in the DB) since line numbers are a form
// detail that can shift year to year without changing what the number means.
const LINE_INFO: Record<
  ScheduleELineCodeOrIncome,
  { irsLine: string; explain: string }
> = {
  rents_received: {
    irsLine: "Line 3",
    explain:
      "Actual rent (and other rental income) received this year. Shown at full value, never prorated — it's real income from the rented portion only.",
  },
  insurance: {
    irsLine: "Line 9",
    explain:
      "Property insurance, prorated by rental-use %. Actual premiums paid this year if logged, otherwise your escrow schedule's insurance amount × 12.",
  },
  management_fees: {
    irsLine: "Line 11",
    explain:
      "Property management fees. Not prorated — assumed fully attributable to renting the property out, not the part you occupy.",
  },
  mortgage_interest: {
    irsLine: "Line 12",
    explain:
      "Mortgage interest paid this year — from tracked loan payments when logged, otherwise computed from your loan's amortization — prorated by rental-use %. Usually the single largest deduction.",
  },
  repairs: {
    irsLine: "Line 14",
    explain:
      "Repairs & maintenance actually paid this year, prorated by your rental-use %.",
  },
  supplies: {
    irsLine: "Line 15",
    explain: "Supplies bought for the property, prorated by rental-use %.",
  },
  taxes: {
    irsLine: "Line 16",
    explain:
      "Property tax for the year, computed from your county tax engine, prorated by rental-use %.",
  },
  utilities: {
    irsLine: "Line 17",
    explain:
      "Electric, water, and internet, prorated by rental-use %. Actual bills paid this year if logged, otherwise your tracked utility accounts' average monthly cost × 12.",
  },
  depreciation: {
    irsLine: "Line 18",
    explain:
      'The "paper loss": a non-cash deduction spreading your building\'s cost (plus any capital improvements) over 27.5 years, prorated by rental-use %. This is what can turn a cash-flow-positive rental into a loss on paper — it shelters real rental income from tax without costing you cash.',
  },
  hoa: {
    irsLine: "Line 19",
    explain:
      "HOA dues, prorated by rental-use %. Actual dues paid this year if logged, otherwise your escrow schedule's HOA amount × 12.",
  },
  other: {
    irsLine: "Line 19",
    explain: "Other miscellaneous operating costs, prorated by rental-use %.",
  },
};

// Display order matching the real Schedule E form layout.
const EXPENSE_ORDER: ScheduleELineCodeOrIncome[] = [
  "insurance",
  "hoa",
  "management_fees",
  "mortgage_interest",
  "repairs",
  "supplies",
  "taxes",
  "utilities",
  "depreciation",
  "other",
];

const SOURCE_BADGE = {
  actual: { label: "actual", variant: "outline" as const },
  computed: { label: "computed", variant: "secondary" as const },
  not_configured: { label: "set up rental %", variant: "warn" as const },
};

function LineLabel({
  code,
  label,
}: {
  code: ScheduleELineCodeOrIncome;
  label: string;
}) {
  const info = LINE_INFO[code];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {info && (
        <>
          <span className="text-muted-foreground text-[10px]">
            {info.irsLine}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info
                className="text-muted-foreground size-3.5 cursor-help"
                aria-label={info.explain}
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{info.explain}</TooltipContent>
          </Tooltip>
        </>
      )}
    </span>
  );
}

export function ScheduleE({
  propertyId,
  year,
  years,
  rows,
  rentalUsePeriods,
  currentRentalUsePercent,
  totalRooms,
  leasedUnitCount,
  autoPlacedInService,
}: {
  propertyId: string;
  year: number;
  years: number[];
  rows: ScheduleELineRow[];
  rentalUsePeriods: RentalUsePeriod[];
  currentRentalUsePercent: number | null;
  totalRooms: number | null;
  leasedUnitCount: number;
  autoPlacedInService: string | null;
}) {
  const income = rows.filter((r) => r.line_code === "rents_received");
  const expenses = [...rows]
    .filter((r) => r.line_code !== "rents_received")
    .sort(
      (a, b) =>
        EXPENSE_ORDER.indexOf(a.line_code) - EXPENSE_ORDER.indexOf(b.line_code),
    );

  const totalIncomeCents = income.reduce((s, r) => s + r.amount_cents, 0);
  const totalExpenseCents = expenses.reduce((s, r) => s + r.amount_cents, 0);
  const netCents = totalIncomeCents - totalExpenseCents;
  const needsSetup = rows.some((r) => r.source === "not_configured");

  const isManual = rentalUsePeriods.length > 0;
  const autoExplain =
    leasedUnitCount === 0
      ? "no leases yet"
      : totalRooms
        ? `auto: ${leasedUnitCount} of ${totalRooms} rooms leased, since ${dateLabel(autoPlacedInService)}`
        : `auto: full rental (any lease = 100%), since ${dateLabel(autoPlacedInService)} — set total rooms for a room-based %`;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="font-medium">Schedule E — {year}</h2>
          <p className="text-muted-foreground text-xs">
            Everything to report this property&apos;s rental activity, already
            prorated by rental-use %.
          </p>
        </div>
        <ScheduleEYearSelector years={years} current={year} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-xs">
        <div className="text-muted-foreground">
          Rental-use %:{" "}
          <span className="text-foreground font-medium">
            {currentRentalUsePercent == null
              ? "not set up"
              : percent(currentRentalUsePercent, 1)}
          </span>{" "}
          currently ·{" "}
          {isManual
            ? `manual (${rentalUsePeriods.length} period${rentalUsePeriods.length === 1 ? "" : "s"} logged)`
            : autoExplain}
        </div>
        <div className="flex items-center gap-2">
          <TotalRoomsForm propertyId={propertyId} totalRooms={totalRooms} />
          <RentalUseForm propertyId={propertyId} />
        </div>
      </div>
      {!isManual && (
        <p className="text-muted-foreground border-b px-5 py-2 text-xs">
          No manual override logged — rental-use % is auto-computed from your
          leases. Add an override above only if this doesn&apos;t match your
          actual layout (e.g. rooms aren&apos;t equal-sized).
        </p>
      )}

      {rentalUsePeriods.length > 0 && (
        <div className="border-b px-5 py-3">
          <table className="w-full text-xs">
            <caption className="sr-only">Rental-use % history</caption>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1 font-medium">Effective</th>
                <th className="py-1 font-medium">Rental-use %</th>
                <th className="py-1 font-medium">Method</th>
                <th className="py-1 font-medium">Notes</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rentalUsePeriods.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1.5">{dateLabel(p.effective_date)}</td>
                  <td className="py-1.5 font-mono tabular-nums">
                    {percent(p.rental_use_percent, 1)}
                  </td>
                  <td className="text-muted-foreground py-1.5">
                    {p.method.replace("_", " ")}
                  </td>
                  <td className="text-muted-foreground py-1.5">
                    {p.notes ?? "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    <ConfirmDeleteButton
                      action={deleteRentalUsePeriod}
                      hiddenFields={{ id: p.id, property_id: propertyId }}
                      title="Delete this rental-use period?"
                      triggerLabel="Delete period"
                      iconOnly
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Line</TableHead>
            <TableHead className="pr-5 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {income.map((r) => (
            <TableRow key={r.line_code}>
              <TableCell className="pl-5">
                <LineLabel code={r.line_code} label={r.label} />
              </TableCell>
              <TableCell className="pr-5 text-right font-mono tabular-nums">
                {money(r.amount_cents)}
              </TableCell>
            </TableRow>
          ))}
          {expenses.map((r) => (
            <TableRow key={r.line_code}>
              <TableCell className="pl-5">
                <span className="inline-flex items-center gap-2">
                  <LineLabel code={r.line_code} label={r.label} />
                  {r.source !== "actual" && (
                    <Badge variant={SOURCE_BADGE[r.source].variant}>
                      {SOURCE_BADGE[r.source].label}
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="pr-5 text-right font-mono tabular-nums">
                {money(r.amount_cents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-5 font-medium">Total income</TableCell>
            <TableCell className="pr-5 text-right font-mono font-medium tabular-nums">
              {money(totalIncomeCents)}
            </TableCell>
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-5 font-medium">Total expenses</TableCell>
            <TableCell className="pr-5 text-right font-mono font-medium tabular-nums">
              {money(totalExpenseCents)}
            </TableCell>
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-5 font-semibold">
              Net rental income / (loss)
            </TableCell>
            <TableCell
              className={`pr-5 text-right font-mono font-semibold tabular-nums ${
                netCents < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {moneySigned(netCents)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <div className="text-muted-foreground border-t px-5 py-3 text-xs">
        {needsSetup && (
          <p className="text-warn mb-1.5">
            Some lines are shown at face value (not prorated) because rental-use
            % isn&apos;t set up for {year} — set it above for an accurate
            number.
          </p>
        )}
        <p>
          Reference numbers for your own filing — not tax advice. Verify with
          your CPA/tax preparer before filing, especially depreciation and the
          land/building basis split.
        </p>
      </div>
    </Card>
  );
}
