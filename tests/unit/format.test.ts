import { describe, expect, it } from "vitest";
import {
  money,
  moneyWhole,
  moneySigned,
  percent,
  taxRatePer100,
  monthLabel,
  dateLabel,
  formatBytes,
  firstOfMonthISO,
  laterMonthISO,
  dollarsToCents,
} from "@/lib/format";

describe("money", () => {
  it("formats cents as USD with two decimals", () => {
    expect(money(171389)).toBe("$1,713.89");
  });
  it("formats zero", () => {
    expect(money(0)).toBe("$0.00");
  });
  it("formats negative amounts", () => {
    expect(money(-250)).toBe("-$2.50");
  });
  it("returns an em dash for null/undefined", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
  });
});

describe("moneyWhole", () => {
  it("formats cents as whole-dollar USD, rounding", () => {
    expect(moneyWhole(29_600_049)).toBe("$296,000");
  });
  it("rounds .5 up", () => {
    expect(moneyWhole(150)).toBe("$2"); // 1.5 -> 2
  });
  it("returns an em dash for null/undefined", () => {
    expect(moneyWhole(null)).toBe("—");
  });
});

describe("moneySigned", () => {
  it("prefixes positive amounts with +", () => {
    expect(moneySigned(150000)).toBe("+$1,500.00");
  });
  it("prefixes negative amounts with -", () => {
    expect(moneySigned(-150000)).toBe("-$1,500.00");
  });
  it("has no sign for exactly zero", () => {
    expect(moneySigned(0)).toBe("$0.00");
  });
  it("returns an em dash for null/undefined", () => {
    expect(moneySigned(undefined)).toBe("—");
  });
});

describe("percent", () => {
  it("converts a fraction to a percent string with 2 digits by default", () => {
    expect(percent(0.0519)).toBe("5.19%");
  });
  it("respects a custom digit count", () => {
    expect(percent(0.055, 4)).toBe("5.5000%");
  });
  it("returns an em dash for null/undefined", () => {
    expect(percent(null)).toBe("—");
  });
});

describe("taxRatePer100", () => {
  it("converts a per-dollar rate to a per-$100 display value", () => {
    expect(taxRatePer100(0.010769)).toBe("1.076900");
  });
});

describe("monthLabel", () => {
  it("formats a YYYY-MM-DD date string as 'Mon YYYY'", () => {
    expect(monthLabel("2026-10-15")).toBe("Oct 2026");
  });
  it("formats a Date object", () => {
    expect(monthLabel(new Date(2026, 0, 1))).toBe("Jan 2026");
  });
});

describe("dateLabel", () => {
  it("formats a YYYY-MM-DD date string", () => {
    expect(dateLabel("2026-07-09")).toBe("Jul 9, 2026");
  });
  it("formats a full ISO timestamp", () => {
    expect(dateLabel("2026-07-09T14:30:00Z")).toMatch(/Jul \d{1,2}, 2026/);
  });
  it("returns an em dash for null/undefined", () => {
    expect(dateLabel(null)).toBe("—");
    expect(dateLabel(undefined)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("formats sub-KB sizes in bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });
  it("formats KB sizes", () => {
    expect(formatBytes(151_552)).toBe("148 KB");
  });
  it("formats MB sizes with one decimal", () => {
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
  });
  it("returns an em dash for null/undefined", () => {
    expect(formatBytes(null)).toBe("—");
  });
});

describe("firstOfMonthISO", () => {
  it("returns the first of the month for a date string", () => {
    expect(firstOfMonthISO("2026-07-15")).toBe("2026-07-01");
  });
  it("returns the first of the month for a Date object", () => {
    expect(firstOfMonthISO(new Date(2026, 11, 25))).toBe("2026-12-01");
  });
  it("pads single-digit months", () => {
    expect(firstOfMonthISO("2026-01-20")).toBe("2026-01-01");
  });
});

describe("laterMonthISO", () => {
  it("returns the later of two YYYY-MM-01 strings", () => {
    expect(laterMonthISO("2026-01-01", "2026-06-01")).toBe("2026-06-01");
    expect(laterMonthISO("2026-06-01", "2026-01-01")).toBe("2026-06-01");
  });
  it("returns either when equal", () => {
    expect(laterMonthISO("2026-06-01", "2026-06-01")).toBe("2026-06-01");
  });
});

describe("dollarsToCents", () => {
  it("converts a plain number", () => {
    expect(dollarsToCents(1713.89)).toBe(171389);
  });
  it("converts a numeric string", () => {
    expect(dollarsToCents("1713.89")).toBe(171389);
  });
  it("strips currency formatting characters", () => {
    expect(dollarsToCents("$1,713.89")).toBe(171389);
  });
  it("rounds fractional cents to the nearest cent", () => {
    expect(dollarsToCents(1.006)).toBe(101);
    expect(dollarsToCents(1.004)).toBe(100);
  });
  it("returns 0 for non-numeric input", () => {
    expect(dollarsToCents("not a number")).toBe(0);
  });
  it("handles negative values", () => {
    expect(dollarsToCents("-42.50")).toBe(-4250);
  });
});
