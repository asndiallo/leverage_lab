import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * Builds a small synthetic PDF that mimics the *shape* lib/lease-parser.ts
 * depends on — labels and values as separate text-drawing calls, spread
 * across the same page numbers the real PandaDoc template uses (1, 2, 6,
 * plus a final "certificate" page) — without using any of the landlord's
 * real personal lease data. This exists to prove the pdf.js-integration
 * side of parseLeasePdf (page routing, coordinate matching, the
 * certificate-page regexes) against an actual PDF; the trickiest label/value
 * disambiguation edge cases (font-based exclusion, bullet markers, the
 * "Tenant (Full Legal Name):" fragmentation) are covered more precisely in
 * tests/unit/lease-parser.test.ts against hand-built text items, where the
 * exact font strings can be controlled directly instead of relying on how
 * pdf-lib/pdf.js happen to number fonts.
 *
 * The unused `decoy` font/glyph below exists only to consume pdf.js's first
 * font-id slot: pdf.js assigns standard-14 fonts ids two apart in order of
 * first use (f1, f3, f5, ...) on this pdf-lib output, so without a decoy,
 * `label` lands on f1 and `value` lands on f3 — colliding with
 * STATIC_TEMPLATE_FONTS in lib/lease-parser.ts and making every value look
 * like static template text. Burning the f1/f3 slots on the decoy pushes
 * `label` to f3 (correctly excluded, like a real label) and `value` to f5
 * (correctly kept).
 */
export async function buildSyntheticLeasePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const decoy = await pdf.embedFont(StandardFonts.Courier);
  const label = await pdf.embedFont(StandardFonts.HelveticaBold);
  const value = await pdf.embedFont(StandardFonts.Helvetica);

  const page1 = pdf.addPage([612, 792]);
  page1.drawText("a", { x: 5, y: 5, size: 1, font: decoy }); // see decoy note above
  const row = (y: number, labelText: string, valueText: string) => {
    page1.drawText(labelText, { x: 50, y, size: 11, font: label });
    page1.drawText(valueText, { x: 260, y: y + 1, size: 11, font: value });
  };
  row(700, "Landlord/Owner:", "Jane Landlord");
  row(670, "Tenant (Full Legal Name):", "John Q. Tenant");
  row(640, "Property Address:", "1 Fixture Ln, Testville, TX 78108");
  row(610, "Private Room:", "#1");
  row(580, "Lease Start Date:", "2026-01-15");
  row(550, "Initial Term Length (months):", "6");
  row(520, "Monthly Rent Amount:", "$900");
  page1.drawText(
    "A late fee of $__________ applies thereafter, the fee is presumed reasonable.",
    { x: 50, y: 490, size: 10, font: value },
  );
  page1.drawText("50", { x: 380, y: 492, size: 10, font: value });
  page1.drawText(
    "Accepted payment methods: __________, payable to __________.",
    { x: 50, y: 460, size: 10, font: value },
  );
  page1.drawText("Zelle", { x: 320, y: 460, size: 10, font: value });
  page1.drawText("Jane Landlord", { x: 50, y: 449, size: 10, font: value });
  row(420, "Security Deposit Amount:", "$200");

  const page2 = pdf.addPage([612, 792]);
  page2.drawText("Exceptions / Additional Charges:", {
    x: 50,
    y: 700,
    size: 11,
    font: label,
  });
  page2.drawText("None — all utilities included", {
    x: 260,
    y: 701,
    size: 11,
    font: value,
  });
  page2.drawText(
    "Overnight guests are limited to __________ consecutive nights.",
    { x: 50, y: 670, size: 10, font: value },
  );
  page2.drawText("2", { x: 300, y: 671, size: 10, font: value });
  page2.drawText("Property-wide alcohol/substance policy (if any): ____.", {
    x: 50,
    y: 640,
    size: 10,
    font: label,
  });
  page2.drawText("No smoking indoors", {
    x: 300,
    y: 641,
    size: 10,
    font: value,
  });

  pdf.addPage([612, 792]); // pages 3-5: filler, matching the real template's
  pdf.addPage([612, 792]); // page count so page6 below lands where
  pdf.addPage([612, 792]); // parseLeasePdf expects it.

  const page6 = pdf.addPage([612, 792]);
  page6.drawText("Assigned parking spot(s) / street parking rules:", {
    x: 50,
    y: 700,
    size: 10,
    font: label,
  });
  page6.drawText("Spot 4 only", { x: 300, y: 701, size: 10, font: value });

  const certificate = pdf.addPage([612, 792]);
  let y = 750;
  const line = (text: string, size = 10) => {
    certificate.drawText(text, { x: 50, y, size, font: value });
    y -= 16;
  };
  line("REF. NUMBER");
  line("FIXTURE-REF-0001");
  line("DOCUMENT COMPLETED BY ALL PARTIES ON");
  line("01 JAN 2026 00:00:00");
  line("SIGNER TIMESTAMP SIGNATURE");
  line("JOHN TENANT");
  line("EMAIL");
  line("john.tenant@example.test");
  line("SENT");
  line("01 JAN 2026 00:00:00");
  line("JANE LANDLORD");
  line("EMAIL");
  line("jane.landlord@example.test");
  line("SENT");
  line("01 JAN 2026 00:00:00");

  return pdf.save();
}
