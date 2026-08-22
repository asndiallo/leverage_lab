import { describe, expect, it } from "vitest";
import { parseTransactionsCsv } from "@/lib/csv-transaction-parser";

describe("parseTransactionsCsv", () => {
  it("parses a single signed-amount export, splitting income from expenses by sign", () => {
    const csv = [
      "Date,Description,Amount",
      "01/15/2026,Airbnb payout,1250.00",
      "01/20/2026,City Water Utility,-85.40",
    ].join("\n");

    const { rows, warnings } = parseTransactionsCsv(csv);
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
        txn_date: "2026-01-15",
        description: "Airbnb payout",
        amount: "1250.00",
        suggested_category: "airbnb_income",
      },
      {
        txn_date: "2026-01-20",
        description: "City Water Utility",
        amount: "85.40",
        suggested_category: "utilities_water",
      },
    ]);
  });

  it("parses a debit/credit column export", () => {
    const csv = [
      "Date,Description,Debit,Credit",
      "2026-02-01,Rent deposit,,900.00",
      "2026-02-03,HOA Dues,150.00,",
    ].join("\n");

    const { rows } = parseTransactionsCsv(csv);
    expect(rows).toEqual([
      {
        txn_date: "2026-02-01",
        description: "Rent deposit",
        amount: "900.00",
        suggested_category: "rent",
      },
      {
        txn_date: "2026-02-03",
        description: "HOA Dues",
        amount: "150.00",
        suggested_category: "hoa_dues",
      },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = [
      "Date,Description,Amount",
      '01/05/2026,"Home Depot, Supplies run",-42.10',
    ].join("\n");

    const { rows } = parseTransactionsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Home Depot, Supplies run");
    expect(rows[0].suggested_category).toBe("supplies");
  });

  it("handles accounting-style parenthesized negatives and $ / thousands separators", () => {
    const csv = [
      "Date,Description,Amount",
      '03/01/2026,Insurance premium,"($1,200.00)"',
    ].join("\n");

    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].amount).toBe("1200.00");
    expect(rows[0].suggested_category).toBe("insurance");
  });

  it("leaves suggested_category empty when nothing matches", () => {
    const csv = ["Date,Description,Amount", "03/01/2026,ACME Corp,-19.99"].join(
      "\n",
    );
    const { rows } = parseTransactionsCsv(csv);
    expect(rows[0].suggested_category).toBe("");
  });

  it("skips rows with an unparseable date or amount, warning instead of throwing", () => {
    const csv = [
      "Date,Description,Amount",
      "not-a-date,Mystery row,10.00",
      "03/05/2026,Zero amount,0",
      "03/06/2026,Good row,25.00",
    ].join("\n");

    const { rows, warnings } = parseTransactionsCsv(csv);
    expect(rows).toEqual([
      {
        txn_date: "2026-03-06",
        description: "Good row",
        amount: "25.00",
        suggested_category: "",
      },
    ]);
    expect(warnings).toHaveLength(2);
  });

  it("reports a fatal warning and no rows when required columns are missing", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    const { rows, warnings } = parseTransactionsCsv(csv);
    expect(rows).toEqual([]);
    expect(warnings[0]).toMatch(/couldn't find/i);
  });

  it("returns empty rows and a warning for an empty file", () => {
    const { rows, warnings } = parseTransactionsCsv("");
    expect(rows).toEqual([]);
    expect(warnings).toEqual(["The file is empty."]);
  });
});
