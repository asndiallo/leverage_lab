import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  deleteTransactions,
} from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import { createTestProperty, deleteTestProperty } from "../setup/fixtures";
import { actAs } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

describe("transaction Server Actions", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("txnactions");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("creates a transaction with dollars converted to integer cents", async () => {
    await actAs(user);
    const result = await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-03-01",
        category: "rent",
        amount: "1713.89",
        paid_by: "owner",
        is_estimate: false,
      }),
    );
    expect(result.error).toBeUndefined();

    const { data } = await user.client
      .from("transactions")
      .select("*")
      .eq("property_id", propertyId)
      .eq("category", "rent");
    expect(data).toHaveLength(1);
    expect(data![0].amount_cents).toBe(171_389);
    expect(data![0].is_estimate).toBe(false);
  });

  it("rejects a negative amount", async () => {
    await actAs(user);
    const result = await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-03-01",
        category: "rent",
        amount: "-100",
        paid_by: "owner",
        is_estimate: false,
      }),
    );
    expect(result.error).toBeTruthy();
  });

  it("updates an existing transaction in place", async () => {
    await actAs(user);
    const created = await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-04-01",
        category: "utilities_electric",
        amount: "100",
        paid_by: "owner",
        is_estimate: true,
      }),
    );
    expect(created.error).toBeUndefined();
    const { data: row } = await user.client
      .from("transactions")
      .select("id")
      .eq("property_id", propertyId)
      .eq("category", "utilities_electric")
      .single();

    const updated = await updateTransaction(
      emptyActionState,
      buildFormData({
        id: row!.id,
        property_id: propertyId,
        txn_date: "2026-04-02",
        category: "utilities_water",
        amount: "250",
        paid_by: "tenant",
        is_estimate: false,
        description: "corrected",
      }),
    );
    expect(updated.error).toBeUndefined();

    const { data: after } = await user.client
      .from("transactions")
      .select("*")
      .eq("id", row!.id)
      .single();
    expect(after!.category).toBe("utilities_water");
    expect(after!.amount_cents).toBe(25_000);
    expect(after!.paid_by).toBe("tenant");
    expect(after!.description).toBe("corrected");
  });

  it("deletes a transaction", async () => {
    await actAs(user);
    await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-05-01",
        category: "supplies",
        amount: "42",
        paid_by: "owner",
        is_estimate: false,
      }),
    );
    const { data: row } = await user.client
      .from("transactions")
      .select("id")
      .eq("property_id", propertyId)
      .eq("category", "supplies")
      .single();

    const result = await deleteTransaction(
      emptyActionState,
      buildFormData({
        id: row!.id,
        property_id: propertyId,
      }),
    );
    expect(result.error).toBeUndefined();

    const { data: after } = await user.client
      .from("transactions")
      .select("id")
      .eq("id", row!.id);
    expect(after).toEqual([]);
  });

  it("bulk-deletes multiple transactions in one call", async () => {
    await actAs(user);
    const a = await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-06-01",
        category: "insurance",
        amount: "10",
        paid_by: "owner",
        is_estimate: false,
      }),
    );
    const b = await addTransaction(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        txn_date: "2026-06-02",
        category: "hoa_dues",
        amount: "20",
        paid_by: "owner",
        is_estimate: false,
      }),
    );
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();

    const { data: rows } = await user.client
      .from("transactions")
      .select("id")
      .eq("property_id", propertyId)
      .in("category", ["insurance", "hoa_dues"]);
    expect(rows).toHaveLength(2);
    const ids = rows!.map((r) => r.id);

    const result = await deleteTransactions(
      emptyActionState,
      buildFormData({
        transaction_ids: ids.join(","),
        property_id: propertyId,
      }),
    );
    expect(result.error).toBeUndefined();

    const { data: after } = await user.client
      .from("transactions")
      .select("id")
      .in("id", ids);
    expect(after).toEqual([]);
  });

  it("rejects a bulk delete with no ids selected", async () => {
    await actAs(user);
    const result = await deleteTransactions(
      emptyActionState,
      buildFormData({
        transaction_ids: "",
        property_id: propertyId,
      }),
    );
    expect(result.error).toBe("No transactions selected");
  });
});
