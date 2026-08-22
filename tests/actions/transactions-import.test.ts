import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addTransaction,
  importTransactionsCsv,
  parseTransactionsFile,
} from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import { createTestProperty, deleteTestProperty } from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

function csvFile(content: string, name = "statement.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

describe("transaction CSV import Server Actions", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("txnimport");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  describe("parseTransactionsFile", () => {
    it("rejects the call when not signed in", async () => {
      actAsSignedOut();
      const result = await parseTransactionsFile(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          file: csvFile("Date,Description,Amount\n01/01/2026,Rent,900"),
        }),
      );
      expect(result.error).toBe("Not signed in");
    });

    it("rejects a missing file", async () => {
      await actAs(user);
      const result = await parseTransactionsFile(
        emptyActionState,
        buildFormData({ property_id: propertyId }),
      );
      expect(result.error).toMatch(/choose a csv/i);
    });

    it("surfaces a parse error instead of throwing when columns aren't recognized", async () => {
      await actAs(user);
      const result = await parseTransactionsFile(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          file: csvFile("Foo,Bar\n1,2"),
        }),
      );
      expect(result.error).toMatch(/couldn't find/i);
    });

    it("extracts rows with a guessed category, without saving anything", async () => {
      await actAs(user);
      const result = await parseTransactionsFile(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          file: csvFile(
            "Date,Description,Amount\n03/01/2026,Airbnb payout,1500.00",
          ),
        }),
      );
      expect(result.error).toBeUndefined();
      const parsed = result.parsedTransactions!;
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]).toMatchObject({
        txn_date: "2026-03-01",
        amount: "1500.00",
        suggested_category: "airbnb_income",
        is_duplicate: false,
      });

      const { data } = await user.client
        .from("transactions")
        .select("id")
        .eq("property_id", propertyId);
      expect(data).toEqual([]); // parsing alone must not write anything
    });

    it("flags a row as a possible duplicate when a matching date+amount already exists", async () => {
      await actAs(user);
      await addTransaction(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          txn_date: "2026-04-10",
          category: "insurance",
          amount: "120.00",
          paid_by: "owner",
          is_estimate: false,
        }),
      );

      const result = await parseTransactionsFile(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          file: csvFile(
            "Date,Description,Amount\n04/10/2026,Insurance premium,-120.00",
          ),
        }),
      );
      expect(result.error).toBeUndefined();
      expect(result.parsedTransactions!.rows[0].is_duplicate).toBe(true);
    });
  });

  describe("importTransactionsCsv", () => {
    it("rejects the call when not signed in", async () => {
      actAsSignedOut();
      const result = await importTransactionsCsv(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          rows: JSON.stringify([
            {
              txn_date: "2026-05-01",
              category: "rent",
              amount: "900",
              description: "",
            },
          ]),
        }),
      );
      expect(result.error).toBe("Not signed in");
    });

    it("rejects an empty row selection", async () => {
      await actAs(user);
      const result = await importTransactionsCsv(
        emptyActionState,
        buildFormData({ property_id: propertyId, rows: "[]" }),
      );
      expect(result.error).toMatch(/no transactions selected/i);
    });

    it("rejects a row missing a category", async () => {
      await actAs(user);
      const result = await importTransactionsCsv(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          rows: JSON.stringify([
            {
              txn_date: "2026-05-01",
              category: "",
              amount: "900",
              description: "",
            },
          ]),
        }),
      );
      expect(result.error).toBeTruthy();
    });

    it("bulk-inserts the selected rows as actual, owner-paid transactions", async () => {
      await actAs(user);
      const result = await importTransactionsCsv(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          rows: JSON.stringify([
            {
              txn_date: "2026-06-01",
              category: "airbnb_income",
              amount: "1500.00",
              description: "Airbnb payout",
            },
            {
              txn_date: "2026-06-05",
              category: "supplies",
              amount: "42.10",
              description: "Home Depot, Supplies run",
            },
          ]),
        }),
      );
      expect(result.error).toBeUndefined();
      expect(result.ok).toBe(true);

      const { data } = await user.client
        .from("transactions")
        .select("*")
        .eq("property_id", propertyId)
        .in("category", ["airbnb_income", "supplies"])
        .order("txn_date", { ascending: true });
      expect(data).toHaveLength(2);
      expect(data![0].amount_cents).toBe(150_000);
      expect(data![0].paid_by).toBe("owner");
      expect(data![0].is_estimate).toBe(false);
      expect(data![1].description).toBe("Home Depot, Supplies run");
    });
  });
});
