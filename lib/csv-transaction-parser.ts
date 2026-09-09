/**
 * Parses a bank/card statement CSV export into candidate transaction rows.
 * Bank exports vary in column naming and in how they represent sign (a
 * single signed "Amount" column vs. separate Debit/Credit columns), so this
 * matches on a set of common header aliases rather than one fixed format.
 * Category guessing is best-effort keyword matching on the description —
 * every row is reviewed and editable by the user before anything is saved,
 * the same way lib/lease-parser.ts treats its extraction as a starting
 * point, not a final answer.
 */

export type ParsedTransactionRow = {
  txn_date: string; // YYYY-MM-DD
  description: string;
  amount: string; // plain dollars, always positive, e.g. "42.50"
  suggested_category: string; // "" when no keyword matched
};

export type ReviewTransactionRow = ParsedTransactionRow & {
  is_duplicate: boolean;
};

export type ParsedTransactionsResult = {
  rows: ParsedTransactionRow[];
  warnings: string[];
};

const DATE_ALIASES = [
  "date",
  "transaction date",
  "posted date",
  "posting date",
];
const DESCRIPTION_ALIASES = [
  "description",
  "transaction description",
  "memo",
  "name",
  "payee",
  "merchant",
];
const AMOUNT_ALIASES = ["amount", "transaction amount"];
const DEBIT_ALIASES = ["debit", "withdrawal", "withdrawals"];
const CREDIT_ALIASES = ["credit", "deposit", "deposits"];
// Some exports (e.g. Capital One) use a single always-positive amount column
// plus a separate "Transaction Type" column ("Credit"/"Debit") for sign,
// rather than either a signed amount or separate debit/credit AMOUNT columns.
const TYPE_ALIASES = ["type", "transaction type"];

// income keywords are checked when the raw amount is positive (money in);
// expense keywords when it's negative (money out) — same description text
// ("water") could plausibly mean different things on either side.
const INCOME_KEYWORDS: [RegExp, string][] = [
  [/airbnb|vrbo|short.?term rental/i, "airbnb_income"],
  [/late fee/i, "late_fee"],
  [/utility reimb/i, "utility_reimbursement"],
  [/\brent\b/i, "rent"],
];

const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/electric|coned|edison|pg&e|reliant|duke energy/i, "utilities_electric"],
  [/water works|water utility|\bwater\b/i, "utilities_water"],
  [/internet|comcast|xfinity|spectrum|at&t|cox comm/i, "utilities_internet"],
  [/insurance/i, "insurance"],
  [/\bhoa\b/i, "hoa_dues"],
  [/repair|maintenance|handyman|plumb|hvac/i, "repairs_maintenance"],
  [/home depot|lowe'?s|supplies/i, "supplies"],
  [/property management|pm fee/i, "property_management"],
  [/mortgage|loan (?:pay|svc)/i, "interest_payment"],
];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h));
}

function normalizeDate(raw: string): string | undefined {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const [, mm, dd, y] = m;
    // 2-digit year (e.g. Capital One's MM/DD/YY exports) -> 20YY.
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return undefined;
}

/** Parses a money string into a signed number of dollars, handling a
 * leading "-", a "$" prefix, thousands separators, and accounting-style
 * parenthesized negatives (e.g. "($42.50)"). */
function parseSignedAmount(raw: string): number | undefined {
  let s = raw.trim();
  if (s === "") return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return negative ? -n : n;
}

function guessCategory(
  description: string,
  direction: "income" | "expense",
): string {
  const keywords = direction === "income" ? INCOME_KEYWORDS : EXPENSE_KEYWORDS;
  for (const [pattern, code] of keywords) {
    if (pattern.test(description)) return code;
  }
  return "";
}

export function parseTransactionsCsv(
  csvText: string,
): ParsedTransactionsResult {
  const lines = csvText
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { rows: [], warnings: ["The file is empty."] };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = findColumn(headers, DATE_ALIASES);
  const descriptionIdx = findColumn(headers, DESCRIPTION_ALIASES);
  const amountIdx = findColumn(headers, AMOUNT_ALIASES);
  const debitIdx = findColumn(headers, DEBIT_ALIASES);
  const creditIdx = findColumn(headers, CREDIT_ALIASES);
  const typeIdx = findColumn(headers, TYPE_ALIASES);

  if (
    dateIdx === -1 ||
    descriptionIdx === -1 ||
    (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)
  ) {
    return {
      rows: [],
      warnings: [
        'Couldn\'t find date, description, and amount columns — expected headers like "Date/Description/Amount" or "Date/Description/Debit/Credit".',
      ],
    };
  }

  const rows: ParsedTransactionRow[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const description = (cells[descriptionIdx] ?? "").trim();
    const txn_date = normalizeDate(cells[dateIdx] ?? "");

    let signedAmount: number | undefined;
    if (amountIdx !== -1) {
      signedAmount = parseSignedAmount(cells[amountIdx] ?? "");
      // A single always-positive amount column needs a separate Type column
      // to know direction (e.g. Capital One: "Transaction Amount" is never
      // negative; "Transaction Type" says Credit/Debit).
      if (signedAmount !== undefined && typeIdx !== -1) {
        const type = (cells[typeIdx] ?? "").trim().toLowerCase();
        if (type === "debit") signedAmount = -Math.abs(signedAmount);
        else if (type === "credit") signedAmount = Math.abs(signedAmount);
      }
    } else {
      const debit = parseSignedAmount(cells[debitIdx] ?? "") ?? 0;
      const credit = parseSignedAmount(cells[creditIdx] ?? "") ?? 0;
      signedAmount = credit !== 0 ? Math.abs(credit) : -Math.abs(debit);
    }

    if (!txn_date || signedAmount === undefined || signedAmount === 0) {
      warnings.push(`Row ${i + 1}: couldn't parse a date/amount — skipped.`);
      continue;
    }

    const direction: "income" | "expense" =
      signedAmount >= 0 ? "income" : "expense";

    rows.push({
      txn_date,
      description,
      amount: Math.abs(signedAmount).toFixed(2),
      suggested_category: guessCategory(description, direction),
    });
  }

  return { rows, warnings };
}
