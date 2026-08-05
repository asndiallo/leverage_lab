import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  buildNotes,
  isBlank,
  normalizeNameTokens,
  parseLeasePdf,
  parseSigners,
  pickTenantEmail,
  stripMoney,
  valueNearLabel,
  type Item,
  type ParsedLease,
} from "@/lib/lease-parser";
import { buildSyntheticLeasePdf } from "../fixtures/lease-pdf";

function item(str: string, x: number, y: number, font = "value"): Item {
  return { str, x, y, font };
}

describe("isBlank", () => {
  it("treats empty and whitespace-only strings as blank", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
  });
  it("treats underscore placeholder runs as blank, with or without a trailing period", () => {
    expect(isBlank("____")).toBe(true);
    expect(isBlank("__________.")).toBe(true);
  });
  it("treats bullet markers as blank", () => {
    expect(isBlank("•")).toBe(true);
    expect(isBlank("••")).toBe(true);
  });
  it("does not treat real content as blank", () => {
    expect(isBlank("N")).toBe(false);
    expect(isBlank("_x_")).toBe(false);
    expect(isBlank("$650")).toBe(false);
  });
});

describe("valueNearLabel", () => {
  it("returns the value item on the same row as the label", () => {
    const items = [
      item("Landlord/Owner:", 50, 656),
      item("Jane Doe", 141, 659),
    ];
    expect(valueNearLabel(items, "Landlord/Owner:")).toBe("Jane Doe");
  });

  it("returns undefined when the label isn't present", () => {
    const items = [item("Jane Doe", 141, 659)];
    expect(valueNearLabel(items, "Landlord/Owner:")).toBeUndefined();
  });

  it("returns undefined when nothing else is on the label's row", () => {
    const items = [item("Landlord/Owner:", 50, 656)];
    expect(valueNearLabel(items, "Landlord/Owner:")).toBeUndefined();
  });

  it("ignores blank underscore placeholders on the same row", () => {
    const items = [
      item("Landlord/Owner:", 50, 656),
      item("________________", 137, 656),
      item("Jane Doe", 141, 659),
    ];
    expect(valueNearLabel(items, "Landlord/Owner:")).toBe("Jane Doe");
  });

  it("supports a value on the line below the label via offsetLines", () => {
    const items = [
      item("payable to __________.", 54, 170),
      item("ACH Direct Debit, Zelle", 320, 170),
      item("Jane Doe", 57, 160),
    ];
    expect(valueNearLabel(items, "payable to", { offsetLines: 1 })).toBe(
      "Jane Doe",
    );
  });

  it("excludes items within tolerance of the target row but on static-template fonts", () => {
    // Reproduces the real bug this filter fixes: a label fragmented across
    // multiple items (all on static fonts) plus a bullet marker, sharing a
    // row with the actual filled-in value.
    const items = [
      item("•", 68, 240, "g_d0_f1"),
      item(
        "Property-wide alcohol/substance policy (if any): ____.",
        82,
        240,
        "g_d0_f1",
      ),
      item("no illegal drug use", 290, 242, "g_d0_f5"),
    ];
    expect(
      valueNearLabel(items, "Property-wide alcohol/substance policy"),
    ).toBe("no illegal drug use");
  });

  it("excludes a label word that got split onto its own item mid-word", () => {
    // Mirrors "Tenant (Full Legal Name):" coming back as three items
    // ("Tenant (Full Legal" / "N" / "ame):") around a font switch.
    const items = [
      item("Tenant (Full Legal", 54, 630, "g_d0_f1"),
      item("N", 140, 630, "g_d0_f3"),
      item("ame):", 147, 630, "g_d0_f1"),
      item("Andrew Stevie Roldan", 179, 632, "g_d0_f10"),
    ];
    expect(valueNearLabel(items, "Tenant (Full Legal")).toBe(
      "Andrew Stevie Roldan",
    );
  });

  it("joins multiple value items on the same row in x order", () => {
    const items = [
      item("Tenant (Full Legal Name):", 54, 630),
      item("Stevie", 220, 630, "value"),
      item("Andrew", 179, 632, "value"),
    ];
    expect(valueNearLabel(items, "Tenant (Full Legal Name):")).toBe(
      "Andrew Stevie",
    );
  });

  it("includes a value right at the row tolerance boundary and excludes just past it", () => {
    const items = [item("Label:", 50, 100)];
    expect(
      valueNearLabel([...items, item("in range", 100, 106)], "Label:"),
    ).toBe("in range");
    expect(
      valueNearLabel([...items, item("out of range", 100, 107)], "Label:"),
    ).toBeUndefined();
  });
});

describe("stripMoney", () => {
  it("strips a leading dollar sign", () => {
    expect(stripMoney("$650")).toBe("650");
  });
  it("leaves a plain number alone", () => {
    expect(stripMoney("75")).toBe("75");
  });
  it("strips thousands separators", () => {
    expect(stripMoney("$1,234.56")).toBe("1234.56");
  });
  it("returns undefined for undefined input", () => {
    expect(stripMoney(undefined)).toBeUndefined();
  });
  it("returns undefined when there are no digits at all", () => {
    expect(stripMoney("N/A")).toBeUndefined();
  });
});

describe("normalizeNameTokens", () => {
  it("uppercases and tokenizes on whitespace", () => {
    expect(normalizeNameTokens("Andrew Stevie Roldan")).toEqual(
      new Set(["ANDREW", "STEVIE", "ROLDAN"]),
    );
  });
  it("strips punctuation (hyphens/apostrophes fold words together)", () => {
    expect(normalizeNameTokens("Mary-Jane O'Brien")).toEqual(
      new Set(["MARYJANE", "OBRIEN"]),
    );
  });
  it("collapses repeated whitespace", () => {
    expect(normalizeNameTokens("Jane   Doe")).toEqual(new Set(["JANE", "DOE"]));
  });
});

const CERT_TEXT = [
  "REF. NUMBER",
  "FAKE-REF-1",
  "SIGNER TIMESTAMP SIGNATURE",
  "JOHN Q TENANT",
  "EMAIL",
  "john@example.test",
  "SENT",
  "01 JAN 2026 00:00:00",
  "JANE LANDLORD",
  "EMAIL",
  "jane@example.test",
  "SENT",
  "01 JAN 2026 00:00:00",
  "",
].join("\n");

describe("parseSigners", () => {
  it("extracts every SIGNER/EMAIL block from certificate-page text", () => {
    expect(parseSigners(CERT_TEXT)).toEqual([
      { name: "JOHN Q TENANT", email: "john@example.test" },
      { name: "JANE LANDLORD", email: "jane@example.test" },
    ]);
  });
  it("does not treat the column header as a signer", () => {
    const signers = parseSigners(CERT_TEXT);
    expect(signers.find((s) => s.name.includes("SIGNATURE"))).toBeUndefined();
  });
  it("returns an empty array when there are no signer blocks", () => {
    expect(parseSigners("nothing to see here")).toEqual([]);
  });
});

describe("pickTenantEmail", () => {
  const signers = [
    { name: "JOHN Q TENANT", email: "john@example.test" },
    { name: "JANE LANDLORD", email: "jane@example.test" },
  ];

  it("picks the signer with the most name-token overlap", () => {
    expect(pickTenantEmail(signers, "John Quincy Tenant")).toBe(
      "john@example.test",
    );
  });
  it("handles a tenant name shorter than the signer's (partial overlap still wins)", () => {
    expect(pickTenantEmail(signers, "Tenant")).toBe("john@example.test");
  });
  it("returns undefined when no signer shares any name token", () => {
    expect(pickTenantEmail(signers, "Someone Else Entirely")).toBeUndefined();
  });
  it("returns undefined with no signers", () => {
    expect(pickTenantEmail([], "John Q Tenant")).toBeUndefined();
  });
  it("returns undefined with no tenant name", () => {
    expect(pickTenantEmail(signers, undefined)).toBeUndefined();
  });
});

describe("addMonthsClamped", () => {
  it("clamps to the last day of a shorter target month", () => {
    expect(addMonthsClamped("2026-08-31", 6)).toBe("2027-02-28");
  });
  it("clamps to Feb 29 in a leap target year", () => {
    expect(addMonthsClamped("2027-08-31", 6)).toBe("2028-02-29");
  });
  it("clamps Jan 31 + 1 month to a non-leap February", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("wraps into the next calendar year", () => {
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("returns the same date for 0 months", () => {
    expect(addMonthsClamped("2026-06-15", 0)).toBe("2026-06-15");
  });
  it("keeps the same day for a full 12-month term", () => {
    expect(addMonthsClamped("2026-06-15", 12)).toBe("2027-06-15");
  });
});

describe("buildNotes", () => {
  const base: ParsedLease = { notes: "", warnings: [] };

  it("returns an empty string when there's nothing to summarize", () => {
    expect(buildNotes(base)).toBe("");
  });

  it("includes only the fields that are set, each on its own line", () => {
    expect(
      buildNotes({
        ...base,
        securityDeposit: "300",
        lateFee: "75",
      }),
    ).toBe("Security deposit: $300\nLate fee: $75");
  });

  it("formats every supported field", () => {
    const notes = buildNotes({
      ...base,
      securityDeposit: "300",
      lateFee: "75",
      paymentMethods: "Zelle",
      payableTo: "Jane Doe",
      overnightGuestNights: "3",
      utilitiesExceptions: "None",
      substancePolicy: "No smoking",
      parkingRules: "Spot 4",
      propertyAddress: "1 Main St",
      documentRef: "ABC-123",
      completedAt: "01 JAN 2026",
    });
    expect(notes.split("\n")).toEqual([
      "Security deposit: $300",
      "Late fee: $75",
      "Accepted payment: Zelle",
      "Payable to: Jane Doe",
      "Overnight guests: 3 consecutive nights/mo max",
      "Utility exceptions: None",
      "Alcohol/substance policy: No smoking",
      "Parking: Spot 4",
      "PDF property address: 1 Main St",
      "PandaDoc ref: ABC-123",
      "Signed by all parties: 01 JAN 2026",
    ]);
  });
});

describe("parseLeasePdf (synthetic fixture)", () => {
  it("extracts every field from a generated PDF with no warnings", async () => {
    const bytes = await buildSyntheticLeasePdf();
    const result = await parseLeasePdf(bytes);

    expect(result.warnings).toEqual([]);
    expect(result.landlordName).toBe("Jane Landlord");
    expect(result.tenantName).toBe("John Q. Tenant");
    expect(result.tenantEmail).toBe("john.tenant@example.test");
    expect(result.propertyAddress).toBe("1 Fixture Ln, Testville, TX 78108");
    expect(result.unitIdentifier).toBe("#1");
    expect(result.leaseStart).toBe("2026-01-15");
    expect(result.termMonths).toBe(6);
    expect(result.leaseEnd).toBe("2026-07-15");
    expect(result.rentAmount).toBe("900");
    expect(result.lateFee).toBe("50");
    expect(result.securityDeposit).toBe("200");
    expect(result.paymentMethods).toBe("Zelle");
    expect(result.payableTo).toBe("Jane Landlord");
    expect(result.utilitiesExceptions).toBe("None — all utilities included");
    expect(result.overnightGuestNights).toBe("2");
    expect(result.substancePolicy).toBe("No smoking indoors");
    expect(result.parkingRules).toBe("Spot 4 only");
    expect(result.documentRef).toBe("FIXTURE-REF-0001");
  });

  it("surfaces a warning per missing required field instead of throwing", async () => {
    // Six blank pages (parseLeasePdf always reads pages 1, 2 and 6) with
    // none of the labels this template looks for.
    const { PDFDocument } = await import("pdf-lib");
    const empty = await PDFDocument.create();
    for (let i = 0; i < 6; i++) empty.addPage();
    const bytes = await empty.save();

    const result = await parseLeasePdf(bytes);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.tenantName).toBeUndefined();
  });
});
