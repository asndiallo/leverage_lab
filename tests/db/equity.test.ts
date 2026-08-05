import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestLoan,
  createTestMarketSnapshot,
  deleteTestProperty,
} from "../setup/fixtures";

describe("loan_balance_cents", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("loanbalance");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function balanceOf(loanId: string, asof: string) {
    const { data, error } = await user.client.rpc("loan_balance_cents", {
      p_loan_id: loanId,
      p_asof: asof,
    });
    if (error) throw error;
    return data as number;
  }

  it("is the full original amount before the first payment date", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      const loan = await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      expect(await balanceOf(loan.id, "2026-07-16")).toBe(30_185_300);
      expect(await balanceOf(loan.id, "2026-08-31")).toBe(30_185_300);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("matches the lender-validated first-payment paydown for 117 Willow Cove's real loan", async () => {
    // $301,853 @ 5.5%/360mo, first payment 2026-09-01. PMT = $1,713.89
    // (validated elsewhere against the real NFCU closing disclosure); month-1
    // interest = round(30185300 * 0.055/12) = 138350, so principal = 33039.
    const property = await createTestProperty(user.client, user.id);
    try {
      const loan = await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      const balance = await balanceOf(loan.id, "2026-09-01");
      expect(30_185_300 - balance).toBeCloseTo(33_039, -1); // within a cent
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("pays down to (near) zero by the end of the term", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      const loan = await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      const balance = await balanceOf(loan.id, "2056-08-01"); // 360th payment
      expect(balance).toBeLessThan(100); // a few cents of rounding drift, not dollars
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("amortizes straight-line when the rate is zero", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      const loan = await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 1_200_000,
        interest_rate: 0,
        term_months: 12,
        funding_date: "2026-01-01",
        first_payment_date: "2026-02-01",
      });
      expect(await balanceOf(loan.id, "2026-02-01")).toBe(1_100_000);
      expect(await balanceOf(loan.id, "2026-05-01")).toBe(800_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});

describe("property_loan_balance_cents", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("propertyloanbalance");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function balanceOf(propertyId: string, asof: string) {
    const { data, error } = await user.client.rpc(
      "property_loan_balance_cents",
      { p_property_id: propertyId, p_asof: asof },
    );
    if (error) throw error;
    return data as number;
  }

  it("is 0 before any loan has funded", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      await createTestLoan(user.client, user.id, property.id, {
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      expect(await balanceOf(property.id, "2026-06-01")).toBe(0);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("picks the most recently funded loan as of a historical date (refinance-safe)", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      await createTestLoan(user.client, user.id, property.id, {
        loan_type: "original",
        original_amount_cents: 30_000_000,
        funding_date: "2026-01-01",
        first_payment_date: "2026-02-01",
        status: "refinanced_out",
      });
      await createTestLoan(user.client, user.id, property.id, {
        loan_type: "refinance",
        original_amount_cents: 28_000_000,
        funding_date: "2027-01-01",
        first_payment_date: "2027-02-01",
        status: "active",
      });
      // Before the refi, only the original loan existed.
      const before = await balanceOf(property.id, "2026-06-01");
      expect(before).toBeGreaterThan(29_000_000);
      // After the refi, the new loan's fresh balance applies.
      const after = await balanceOf(property.id, "2027-01-01");
      expect(after).toBe(28_000_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});

describe("property_equity_series", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("equityseries");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function seriesFor(propertyId: string) {
    const { data, error } = await user.client.rpc("property_equity_series", {
      p_property_id: propertyId,
    });
    if (error) throw error;
    return data;
  }

  it("includes a purchase-day point even with no snapshots logged", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 29_550_000,
      purchase_date: "2026-07-16",
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      const series = await seriesFor(property.id);
      expect(series).toHaveLength(1);
      expect(series![0]).toMatchObject({
        snapshot_date: "2026-07-16",
        value_cents: 29_550_000,
        loan_balance_cents: 30_185_300,
        equity_cents: -635_300, // financed VA funding fee exceeds price
        source: "purchase",
      });
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("adds manually logged snapshots, ordered by date, with equity computed at each date", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 29_550_000,
      purchase_date: "2026-07-16",
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        interest_rate: 0.055,
        term_months: 360,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      await createTestMarketSnapshot(user.client, user.id, property.id, {
        snapshot_date: "2027-07-16",
        estimated_value_cents: 31_500_000,
        source: "zillow_estimate",
      });
      const series = await seriesFor(property.id);
      expect(series!.map((s) => s.snapshot_date)).toEqual([
        "2026-07-16",
        "2027-07-16",
      ]);
      const snapshot = series![1];
      expect(snapshot.value_cents).toBe(31_500_000);
      expect(snapshot.source).toBe("zillow_estimate");
      // A year of paydown, so the loan balance strictly decreased.
      expect(snapshot.loan_balance_cents).toBeLessThan(30_185_300);
      expect(snapshot.equity_cents).toBe(
        snapshot.value_cents - snapshot.loan_balance_cents,
      );
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("does not double-count a snapshot logged on the purchase date itself", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 29_550_000,
      purchase_date: "2026-07-16",
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 30_185_300,
        funding_date: "2026-07-16",
        first_payment_date: "2026-09-01",
      });
      await createTestMarketSnapshot(user.client, user.id, property.id, {
        snapshot_date: "2026-07-16",
        estimated_value_cents: 29_550_000,
      });
      const series = await seriesFor(property.id);
      expect(series).toHaveLength(1);
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});
