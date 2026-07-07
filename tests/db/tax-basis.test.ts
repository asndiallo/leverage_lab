import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import {
  createTestProperty,
  createTestTransaction,
  deleteTestProperty,
} from "../setup/fixtures";

// property_tax_basis_cents = purchase_price + capital improvements - seller credits.
describe("property_tax_basis_cents", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("taxbasis");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("is just the purchase price with no adjustments", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 30_000_000,
    });
    try {
      const { data, error } = await user.client.rpc(
        "property_tax_basis_cents",
        {
          p_property_id: property.id,
        },
      );
      if (error) throw error;
      expect(data).toBe(30_000_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("adds capital improvements and subtracts seller credits", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 30_000_000,
    });
    try {
      await createTestTransaction(user.client, user.id, property.id, {
        category: "renovation",
        amount_cents: 500_000, // +$5,000
        txn_date: "2026-03-01",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "seller_credit",
        amount_cents: 200_000, // -$2,000
        txn_date: "2026-01-01",
      });
      // Operating expenses must NOT affect basis.
      await createTestTransaction(user.client, user.id, property.id, {
        category: "repairs_maintenance",
        amount_cents: 999_999,
        txn_date: "2026-02-01",
      });

      const { data, error } = await user.client.rpc(
        "property_tax_basis_cents",
        {
          p_property_id: property.id,
        },
      );
      if (error) throw error;
      expect(data).toBe(30_000_000 + 500_000 - 200_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });

  it("sums multiple capital improvements across different categories", async () => {
    const property = await createTestProperty(user.client, user.id, {
      purchase_price_cents: 10_000_000,
    });
    try {
      await createTestTransaction(user.client, user.id, property.id, {
        category: "renovation",
        amount_cents: 300_000,
        txn_date: "2026-02-01",
      });
      await createTestTransaction(user.client, user.id, property.id, {
        category: "appliance",
        amount_cents: 50_000,
        txn_date: "2026-02-15",
      });

      const { data, error } = await user.client.rpc(
        "property_tax_basis_cents",
        {
          p_property_id: property.id,
        },
      );
      if (error) throw error;
      expect(data).toBe(10_000_000 + 300_000 + 50_000);
    } finally {
      await deleteTestProperty(property.id);
    }
  });
});
