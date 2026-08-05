import { extractText, getDocumentProxy } from "unpdf";

/**
 * Parses an Amazon "Order Details" print-to-PDF (the page at
 * amazon.com/gp/css/summary/print.html?orderID=...). Unlike the PandaDoc
 * lease template, this is a plain HTML page printed to PDF, so pdf.js
 * extracts its text in normal reading order — no coordinate matching
 * needed, just line-based parsing of a fairly regular structure:
 *
 *   Order placed <date> Order # <order-number>
 *   Ship to / <name> / <street> / <city, state zip> / <country>
 *   Order Summary
 *   Item(s) Subtotal: $X
 *   [Shipping & Handling / promo / coupon / gift-card lines, order varies]
 *   Total before tax: $X
 *   Estimated tax to be
 *   collected:
 *   $X
 *   [FSA/HSA annotation, sometimes]
 *   Grand Total: $X
 *   <one item block per line item> ... Back to top
 */

export type InvoiceItem = {
  title: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number; // unitPriceCents * quantity
  shareCents: number; // this item's pro-rata share of costBasisCents
};

export type ExcludedItem = {
  title: string;
  unitPriceCents: number;
  reason: string;
};

export type ParsedInvoice = {
  orderNumber?: string;
  orderDate?: string; // YYYY-MM-DD
  shipToAddress?: string; // "<street>, <city, state zip>"
  itemsSubtotalCents?: number;
  totalBeforeTaxCents?: number;
  taxCents?: number;
  grandTotalCents?: number;
  refundTotalCents?: number;
  /** The true pre-payment-method cost of the order (totalBeforeTax + tax) —
   * the basis used for expense records, regardless of how it was actually
   * paid (gift card / rewards points don't make an expense non-deductible,
   * and "Grand Total" nets those out so it understates true cost). Excludes
   * refunded items (see `excludedItems`), which were bought but not kept. */
  costBasisCents?: number;
  items: InvoiceItem[];
  /** Line items found but deliberately left out of `items` — e.g. returned
   * and refunded, so they're not a real deductible expense. Surfaced
   * separately (not just as a warning string) so a UI can list them. */
  excludedItems: ExcludedItem[];
  warnings: string[];
};

// A block is refunded if any of its lines contain one of these phrases —
// Amazon's wording for a return varies ("Refunded", "Return complete", ...)
// and sentences are sometimes combined onto one line ("Your return is in
// transit. Your refund has been issued."), so these match as substrings
// rather than requiring a line to be exactly one fixed phrase.
const REFUND_MARKERS = [
  /^Refunded$/,
  /Refund complete/,
  /Return complete/,
  /Your return is in transit/,
  /Your refund has been issued/,
  /When will I get my refund\?/,
];

// Page header/footer artifacts pdf.js sometimes interleaves at page breaks
// (a repeated timestamp/"Order Details"/"Page X of Y"/print URL, sometimes
// glued directly onto the URL with no separator — "Page 2 of 3https://…").
// Matched as substrings/prefixes, not whole-line equality, for that reason.
// Stripped
// up front so they can never land inside an item title.
const PAGE_CHROME_LINE = [
  /^Order Details$/,
  /^Page \d+ of \d+/,
  /^https?:\/\//,
  /amazon\.com\/gp\/css\/summary\/print\.html/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}, .*[AP]M/,
];

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December";

function toCents(raw: string): number {
  return Math.round(parseFloat(raw.replace(/[^0-9.]/g, "")) * 100);
}

function parseOrderDate(month: string, day: string, year: string): string {
  const monthIndex = MONTH_NAMES.split("|").indexOf(month);
  const d = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
  return d.toISOString().slice(0, 10);
}

// Lines that mark the *end* of an item's title within its block (everything
// from the block's start up to the first of these is the title).
const ITEM_METADATA_MARKERS = [
  /^Sold by:/,
  /^Supplied by:/,
  /^Condition:/,
  /^Return or replace items:/,
  /^Return items:/,
  /^Auto-delivered:/,
  /^FSA or HSA eligible/,
];

// Lines at the *start* of a block that aren't part of the title either (a
// shipment-group heading, shared by every item in that shipment).
const BLOCK_LEADING_NOISE = [/^Delivered /, /^Arriving /, /^Your package /];

function parseItemBlock(lines: string[]): {
  title: string;
  quantity: number;
  refunded: boolean;
} {
  const refunded = lines.some((l) => REFUND_MARKERS.some((re) => re.test(l)));
  let i = 0;
  while (
    i < lines.length &&
    (BLOCK_LEADING_NOISE.some((re) => re.test(lines[i])) ||
      REFUND_MARKERS.some((re) => re.test(lines[i])))
  ) {
    i++;
  }
  let quantity = 1;
  if (i < lines.length && /^\d+$/.test(lines[i])) {
    quantity = Number(lines[i]);
    i++;
  }
  const titleLines: string[] = [];
  for (; i < lines.length; i++) {
    if (ITEM_METADATA_MARKERS.some((re) => re.test(lines[i]))) break;
    if (REFUND_MARKERS.some((re) => re.test(lines[i]))) continue;
    titleLines.push(lines[i]);
  }
  return { title: titleLines.join(" ").trim(), quantity, refunded };
}

/**
 * pdf.js detaches `bytes`' backing ArrayBuffer as a side effect of parsing
 * (it transfers ownership internally rather than copying) — after this
 * call, `bytes.byteLength` is 0 and the buffer is unusable for anything
 * else, including re-uploading the original file. Callers that need the
 * raw bytes for something in addition to parsing (e.g. storing the
 * original PDF) must read/copy them separately, not reuse this argument.
 */
export async function parseAmazonInvoice(
  bytes: Uint8Array,
): Promise<ParsedInvoice> {
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
  const { text: rawText } = await extractText(pdf, { mergePages: true });
  const text = rawText
    .split("\n")
    .filter((l) => !PAGE_CHROME_LINE.some((re) => re.test(l.trim())))
    .join("\n");

  const warnings: string[] = [];

  const orderMatch = text.match(
    new RegExp(
      `Order placed (${MONTH_NAMES}) (\\d{1,2}), (\\d{4}) Order # (\\S+)`,
    ),
  );
  const orderNumber = orderMatch?.[4];
  const orderDate = orderMatch
    ? parseOrderDate(orderMatch[1], orderMatch[2], orderMatch[3])
    : undefined;
  if (!orderNumber) warnings.push('Could not find "Order #".');
  if (!orderDate) warnings.push("Could not find the order date.");

  const shipToMatch = text.match(
    /Ship to\n[^\n]+\n([^\n]+)\n([^\n]+, [A-Z]{2} \d{5}(?:-\d{4})?)\n/,
  );
  const shipToAddress = shipToMatch
    ? `${shipToMatch[1]}, ${shipToMatch[2]}`
    : undefined;
  if (!shipToAddress) warnings.push('Could not find the "Ship to" address.');

  const itemsSubtotalCents = text.match(/Item\(s\) Subtotal:\s*\$?([\d,.]+)/)
    ? toCents(text.match(/Item\(s\) Subtotal:\s*\$?([\d,.]+)/)![1])
    : undefined;
  const totalBeforeTaxCents = text.match(/Total before tax:\s*\$?([\d,.]+)/)
    ? toCents(text.match(/Total before tax:\s*\$?([\d,.]+)/)![1])
    : undefined;
  const taxMatch = text.match(/Estimated tax to be\ncollected:\n\$?([\d,.]+)/);
  const taxCents = taxMatch ? toCents(taxMatch[1]) : 0;
  const grandTotalMatch = text.match(/Grand Total:\s*\$?([\d,.]+)/);
  const grandTotalCents = grandTotalMatch
    ? toCents(grandTotalMatch[1])
    : undefined;
  const refundTotalMatch = text.match(/Refund Total\s*\$?([\d,.]+)/);
  const refundTotalCents = refundTotalMatch
    ? toCents(refundTotalMatch[1])
    : undefined;

  if (itemsSubtotalCents === undefined)
    warnings.push('Could not find "Item(s) Subtotal".');
  if (totalBeforeTaxCents === undefined)
    warnings.push('Could not find "Total before tax".');
  if (grandTotalCents === undefined)
    warnings.push('Could not find "Grand Total".');

  // Net of any refund — this is what should actually hit the books, not the
  // full original purchase amount (see excludedItems below).
  const costBasisCents =
    totalBeforeTaxCents !== undefined
      ? totalBeforeTaxCents + taxCents - (refundTotalCents ?? 0)
      : undefined;

  // Item listing starts at the first shipment heading after Grand Total (not
  // immediately after it — an "FSA or HSA eligible: (inc. tax and
  // shipping) $X" annotation can sit between the two and isn't an item).
  const afterGrandTotal = grandTotalMatch
    ? text.slice(text.indexOf(grandTotalMatch[0]) + grandTotalMatch[0].length)
    : "";
  const firstHeadingIdx = afterGrandTotal.search(/^(Delivered|Arriving) /m);
  const itemSection =
    firstHeadingIdx === -1
      ? ""
      : afterGrandTotal.slice(firstHeadingIdx).split(/^Back to top$/m)[0];

  const items: InvoiceItem[] = [];
  const excludedItems: ExcludedItem[] = [];
  let block: string[] = [];
  for (const line of itemSection.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const priceMatch = trimmed.match(/^\$([\d,.]+)$/);
    if (priceMatch) {
      const { title, quantity, refunded } = parseItemBlock(block);
      const unitPriceCents = toCents(priceMatch[1]);
      if (title && refunded) {
        excludedItems.push({ title, unitPriceCents, reason: "Refunded" });
        warnings.push(
          `Excluded refunded item: "${title}" ($${(unitPriceCents / 100).toFixed(2)}) — not counted as an expense.`,
        );
      } else if (title) {
        items.push({
          title,
          quantity,
          unitPriceCents,
          lineTotalCents: unitPriceCents * quantity,
          shareCents: 0, // filled in below once every item is known
        });
      } else {
        warnings.push(`Found a $${priceMatch[1]} line with no item title.`);
      }
      block = [];
    } else {
      block.push(trimmed);
    }
  }
  if (items.length === 0 && excludedItems.length === 0)
    warnings.push("Could not find any line items.");
  if (refundTotalCents !== undefined && excludedItems.length === 0) {
    warnings.push(
      `Order shows a $${(refundTotalCents / 100).toFixed(2)} refund but no item was ` +
        `recognized as refunded — check manually, a refunded item may be counted as an expense.`,
    );
  }

  const lineTotalSum = items.reduce((sum, it) => sum + it.lineTotalCents, 0);
  const excludedSum = excludedItems.reduce(
    (sum, it) => sum + it.unitPriceCents,
    0,
  );
  if (
    itemsSubtotalCents !== undefined &&
    lineTotalSum + excludedSum !== itemsSubtotalCents
  ) {
    warnings.push(
      `Parsed item total ($${((lineTotalSum + excludedSum) / 100).toFixed(2)}) doesn't match ` +
        `Item(s) Subtotal ($${(itemsSubtotalCents / 100).toFixed(2)}) — check manually.`,
    );
  }

  // Distribute the true cost basis (goods + shipping + tax, net of
  // promotions, but ignoring how it was paid) pro-rata across items by their
  // share of the item subtotal, so the shares always sum to costBasisCents
  // exactly (last item absorbs any rounding remainder).
  if (costBasisCents !== undefined && lineTotalSum > 0) {
    let allocated = 0;
    items.forEach((item, i) => {
      if (i === items.length - 1) {
        item.shareCents = costBasisCents - allocated;
      } else {
        item.shareCents = Math.round(
          (item.lineTotalCents / lineTotalSum) * costBasisCents,
        );
        allocated += item.shareCents;
      }
    });
  } else {
    items.forEach((item) => {
      item.shareCents = item.lineTotalCents;
    });
  }

  return {
    orderNumber,
    orderDate,
    shipToAddress,
    itemsSubtotalCents,
    totalBeforeTaxCents,
    taxCents,
    grandTotalCents,
    refundTotalCents,
    costBasisCents,
    items,
    excludedItems,
    warnings,
  };
}
