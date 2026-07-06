import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";
import {
  createTestProperty,
  createTestLease,
  createTestLoan,
  createTestEscrow,
  createTestTransaction,
  deleteTestProperty,
} from "../setup/fixtures";

// property_monthly_cashflow's projected/historical split is relative to
// "today" at test-run time, so months are computed as offsets from the
// current month rather than hardcoded — safe to run on any date.
function monthISO(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const PAST_MONTH = monthISO(-6);
const FUTURE_MONTH = monthISO(6);

describe("property_monthly_cashflow", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("cashflow");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function cashflow(propertyId: string, month: string) {
    const { data, error } = await user.client.rpc("property_monthly_cashflow", {
      p_property_id: propertyId,
      p_month: month,
    });
    if (error) throw error;
    return data![0];
  }

  it("uses actual transactions for a historical month, ignoring lease terms and is_estimate flags", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 30_000_000,
    });
    try {
      // A lease covers the month with a DIFFERENT rent than the real
      // transactions — historical income must come from transactions only.
      await createTestLease(user.client, user.id, property.id, {
        rent_amount_cents: 999_999,
        lease_start: "2020-01-01",
        status: "active",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "rent",
        amount_cents: 150_000,
        txn_date: `${PAST_MONTH.slice(0, 7)}-05`,
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "late_fee",
        amount_cents: 5_000,
        txn_date: `${PAST_MONTH.slice(0, 7)}-06`,
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "principal_payment",
        amount_cents: 140_000,
        txn_date: `${PAST_MONTH.slice(0, 7)}-01`,
      });
      // Both is_estimate values must count for a historical month.
      await createTestTransaction(user.client, user.id, property.id, {
        category: "repairs_maintenance",
        amount_cents: 20_000,
        is_estimate: false,
        txn_date: `${PAST_MONTH.slice(0, 7)}-10`,
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "supplies",
        amount_cents: 5_000,
        is_estimate: true,
        txn_date: `${PAST_MONTH.slice(0, 7)}-11`,
      });

      const cf = await cashflow(property.id, PAST_MONTH);
      expect(cf.is_projected).toBe(false);
      expect(cf.is_vacant).toBe(false); // never vacant for a historical month
      expect(cf.gross_rent_cents).toBe(150_000);
      expect(cf.other_income_cents).toBe(5_000);
      expect(cf.income_total_cents).toBe(155_000);
      expect(cf.debt_service_cents).toBe(140_000); // actual, not computed
      expect(cf.operating_expense_cents).toBe(25_000); // both rows, regardless of is_estimate
      expect(cf.vacancy_reserve_cents).toBe(7_500); // 150,000 * 5% default
      expect(cf.maintenance_reserve_cents).toBe(25_000); // 30,000,000 * 1% / 12
      expect(cf.net_cashflow_cents).toBe(155_000 - 140_000 - 25_000 - 7_500 - 25_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("projects from lease terms and computed debt service for a future month", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 24_000_000,
    });
    try {
      await createTestLease(user.client, user.id, property.id, {
        rent_amount_cents: 140_000,
        flat_utility_charge_cents: 10_000,
        lease_start: "2020-01-01",
        status: "active",
      });
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 24_000_000,
        interest_rate: 0.06,
        term_months: 360,
        status: "active",
      });
      await createTestEscrow(user.client, user.id, property.id, {
        effective_date: "2020-01-01",
        monthly_tax_escrow_cents: 5_000,
        monthly_insurance_escrow_cents: 2_000,
        monthly_hoa_cents: 1_000,
      });
      // Only the is_estimate row should count for a projected month.
      await createTestTransaction(user.client, user.id, property.id, {
        category: "insurance",
        amount_cents: 3_000,
        is_estimate: true,
        txn_date: `${FUTURE_MONTH.slice(0, 7)}-01`,
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "hoa_dues",
        amount_cents: 999,
        is_estimate: false,
        txn_date: `${FUTURE_MONTH.slice(0, 7)}-01`,
      });

      const cf = await cashflow(property.id, FUTURE_MONTH);
      expect(cf.is_projected).toBe(true);
      expect(cf.is_vacant).toBe(false);
      expect(cf.gross_rent_cents).toBe(140_000);
      expect(cf.other_income_cents).toBe(10_000);
      expect(cf.debt_service_cents).toBe(143_892 + 8_000); // computed P&I + escrow
      expect(cf.operating_expense_cents).toBe(3_000); // estimate row only
      expect(cf.vacancy_reserve_cents).toBe(7_000); // 140,000 * 5%
      expect(cf.maintenance_reserve_cents).toBe(20_000); // 24,000,000 * 1% / 12
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("flags a projected month with no covering lease as vacant, with zero income", async () => {
    const property = await createTestProperty(user.client, user.id);
    try {
      // A lease that ends well before the projected month.
      await createTestLease(user.client, user.id, property.id, {
        rent_amount_cents: 100_000,
        lease_start: "2020-01-01",
        lease_end: "2020-06-30",
        status: "ended",
      });

      const cf = await cashflow(property.id, FUTURE_MONTH);
      expect(cf.is_projected).toBe(true);
      expect(cf.is_vacant).toBe(true);
      expect(cf.gross_rent_cents).toBe(0);
      expect(cf.other_income_cents).toBe(0);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("prefers actual loan/escrow transactions over computed debt service even in a projected month", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 24_000_000,
    });
    try {
      await createTestLoan(user.client, user.id, property.id, {
        original_amount_cents: 24_000_000,
        interest_rate: 0.06,
        term_months: 360,
        status: "active",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "principal_payment",
        amount_cents: 200_000, // deliberately different from the computed P&I
        is_estimate: true,
        txn_date: `${FUTURE_MONTH.slice(0, 7)}-01`,
      });

      const cf = await cashflow(property.id, FUTURE_MONTH);
      expect(cf.debt_service_cents).toBe(200_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});
