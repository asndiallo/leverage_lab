import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { addProperty, addLease } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { createTestUser, deleteTestUser, type TestUser } from "../setup/supabase";
import { deleteTestProperty } from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

describe("addProperty (Server Action)", () => {
  let user: TestUser;
  const cleanupPropertyIds: string[] = [];

  beforeAll(async () => {
    user = await createTestUser("addproperty");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  afterEach(async () => {
    while (cleanupPropertyIds.length) await deleteTestProperty(cleanupPropertyIds.pop()!);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await addProperty(emptyActionState, buildFormData({
      address: "1 Test St", city: "Testville", state: "TX", zip: "78108",
      purchase_price: "300000", purchase_date: "2026-01-01",
      property_type: "single_family", status: "active",
    }));
    expect(result.error).toBe("Not signed in");
  });

  it("rejects an invalid state code without touching the database", async () => {
    await actAs(user);
    const result = await addProperty(emptyActionState, buildFormData({
      address: "1 Test St", city: "Testville", state: "Texas", zip: "78108",
      purchase_price: "300000", purchase_date: "2026-01-01",
      property_type: "single_family", status: "active",
    }));
    expect(result.error).toMatch(/2-letter state code/i);

    const { data } = await user.client.from("properties").select("id").eq("address", "1 Test St");
    expect(data).toEqual([]);
  });

  it("creates a property with no loan block", async () => {
    await actAs(user);
    const result = await addProperty(emptyActionState, buildFormData({
      address: "42 No Loan Ave", city: "Testville", state: "tx", zip: "78108",
      purchase_price: "250000", purchase_date: "2026-02-01",
      property_type: "duplex", status: "pending",
    }));
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data: props } = await user.client.from("properties").select("*").eq("address", "42 No Loan Ave");
    expect(props).toHaveLength(1);
    expect(props![0].state).toBe("TX"); // uppercased
    expect(props![0].purchase_price_cents).toBe(25_000_000);
    cleanupPropertyIds.push(props![0].id);

    const { data: settings } = await user.client
      .from("property_settings")
      .select("*")
      .eq("property_id", props![0].id);
    expect(settings).toHaveLength(1); // default reserves row created

    const { data: loans } = await user.client.from("loans").select("*").eq("property_id", props![0].id);
    expect(loans).toEqual([]);
  });

  it("creates a property with its purchase loan when the loan block is filled in", async () => {
    await actAs(user);
    const result = await addProperty(emptyActionState, buildFormData({
      address: "7 Loan Blvd", city: "Testville", state: "TX", zip: "78108",
      purchase_price: "300000", purchase_date: "2026-01-01",
      property_type: "single_family", status: "active",
      lender: "Test Credit Union", loan_amount: "240000", interest_rate: "0.055", term_years: "30",
      funding_date: "2026-01-01", first_payment_date: "2026-03-01",
    }));
    expect(result.ok).toBe(true);

    const { data: props } = await user.client.from("properties").select("*").eq("address", "7 Loan Blvd");
    cleanupPropertyIds.push(props![0].id);

    const { data: loans } = await user.client.from("loans").select("*").eq("property_id", props![0].id);
    expect(loans).toHaveLength(1);
    expect(loans![0].original_amount_cents).toBe(24_000_000);
    expect(loans![0].interest_rate).toBeCloseTo(0.055, 5); // stored as a fraction, per the form's own label
    expect(loans![0].term_months).toBe(360);
    expect(loans![0].lender).toBe("Test Credit Union");
  });
});

describe("addLease (Server Action)", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("addlease");
    await actAs(user);
    const result = await addProperty(emptyActionState, buildFormData({
      address: "1 Lease Test St", city: "Testville", state: "TX", zip: "78108",
      purchase_price: "300000", purchase_date: "2026-01-01",
      property_type: "single_family", status: "active",
    }));
    if (result.error) throw new Error(result.error);
    const { data } = await user.client.from("properties").select("id").eq("address", "1 Lease Test St").single();
    propertyId = data!.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects a lease ending before it starts", async () => {
    await actAs(user);
    const result = await addLease(emptyActionState, buildFormData({
      property_id: propertyId, unit_identifier: "unit_a", tenant_name: "Test Tenant",
      rent_amount: "1500", lease_start: "2026-06-01", lease_end: "2026-01-01", status: "active",
      utilities_included: false,
    }));
    expect(result.error).toMatch(/on or after the start date/i);
  });

  it("creates a lease for a property the user owns", async () => {
    await actAs(user);
    const result = await addLease(emptyActionState, buildFormData({
      property_id: propertyId, unit_identifier: "unit_a", tenant_name: "Test Tenant",
      tenant_email: "tenant@example.test", rent_amount: "1500.50", lease_start: "2026-06-01",
      status: "active", utilities_included: true, flat_utility_charge: "0",
    }));
    expect(result.error).toBeUndefined();

    const { data: leases } = await user.client.from("leases").select("*").eq("property_id", propertyId);
    expect(leases).toHaveLength(1);
    expect(leases![0].rent_amount_cents).toBe(150_050);
    expect(leases![0].utilities_included).toBe(true);
    expect(leases![0].tenant_email).toBe("tenant@example.test");
  });
});
