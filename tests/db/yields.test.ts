import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";
import {
  createTestProperty,
  createTestPropertySettings,
  createTestLease,
  createTestLoan,
  createTestTransaction,
  deleteTestProperty,
} from "../setup/fixtures";

// v_property_yields: cash-invested, gross/net yield, cash-on-cash.
describe("v_property_yields", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("yields");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function yieldsFor(propertyId: string) {
    const { data, error } = await user.client
      .from("v_property_yields")
      .select("*")
      .eq("property_id", propertyId)
      .single();
    if (error) throw error;
    return data;
  }

  it("computes cash invested as price + owner closing costs - loan - credits + capital improvements", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 30_000_000,
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 24_000_000,
        loan_type: "original",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "closing_cost",
        amount_cents: 500_000,
        paid_by: "owner",
        txn_date: "2026-01-01",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "seller_credit",
        amount_cents: 100_000,
        txn_date: "2026-01-01",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "renovation",
        amount_cents: 300_000,
        paid_by: "owner",
        txn_date: "2026-02-01",
      });

      const y = await yieldsFor(property.id);
      // 30,000,000 + 500,000 - 24,000,000 - 100,000 = 6,400,000, + 300,000 capex
      expect(y!.total_cash_invested_cents).toBe(6_700_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("floors cash invested at zero when a financed loan exceeds the price (VA-style)", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 20_000_000,
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 20_500_000, // financed funding fee, loan > price
        loan_type: "original",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "closing_cost",
        amount_cents: 450_000,
        paid_by: "owner",
        txn_date: "2026-01-01",
      });

      const y = await yieldsFor(property.id);
      // 20,000,000 + 450,000 - 20,500,000 = -50,000 -> floored to 0, no capex on top
      expect(y!.total_cash_invested_cents).toBe(0);
      // and division-by-zero is guarded, not an error
      expect(y!.cash_on_cash).toBeNull();
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("only counts owner-paid transactions toward cash invested", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 10_000_000,
    });
    try {
      await createTestTransaction(user.client, user.id, property.id, {
        category: "closing_cost",
        amount_cents: 1_000_000,
        paid_by: "seller", // not the owner — must not count
        txn_date: "2026-01-01",
      });

      const y = await yieldsFor(property.id);
      expect(y!.total_cash_invested_cents).toBe(10_000_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("computes gross yield, net yield, and cash-on-cash from an active lease and TTM cashflow", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 10_000_000,
    });
    try {
      // Zero out reserves so the trailing-12-month sum is driven purely by
      // income/debt service, not by fixed monthly reserve deductions.
      await createTestPropertySettings(user.client, user.id, property.id, {
        vacancy_reserve_rate: 0,
        maintenance_reserve_rate: 0,
      });
      await createTestLease(user.client, user.id, property.id, {
        rent_amount_cents: 200_000,
        lease_start: "2020-01-01",
        status: "active",
      });

      const y = await yieldsFor(property.id);
      expect(y!.annual_rent_cents).toBe(200_000 * 12);
      expect(y!.total_cash_invested_cents).toBe(10_000_000);
      // Only the current (projected) month in the trailing 12 has any
      // activity — the other 11 historical months have no transactions and
      // zeroed-out reserves, so they contribute exactly 0.
      expect(y!.annual_net_cashflow_cents).toBe(200_000);
      expect(y!.gross_yield).toBeCloseTo(0.24, 4);
      expect(y!.net_yield).toBeCloseTo(0.02, 4);
      expect(y!.cash_on_cash).toBeCloseTo(0.02, 4);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("guards against division by zero when purchase price is zero", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 0,
    });
    try {
      const y = await yieldsFor(property.id);
      expect(y!.gross_yield).toBeNull();
      expect(y!.net_yield).toBeNull();
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});
