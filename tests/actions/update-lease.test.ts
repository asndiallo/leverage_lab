import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLease, importLease, updateLease } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../setup/supabase";
import { createTestProperty, deleteTestProperty } from "../setup/fixtures";
import { actAs, actAsSignedOut } from "../setup/actAs";
import { buildFormData } from "../setup/formData";
import { buildSyntheticLeasePdf } from "../fixtures/lease-pdf";

async function leaseFile(name = "lease.pdf"): Promise<File> {
  const bytes = await buildSyntheticLeasePdf();
  return new File([Buffer.from(bytes)], name, { type: "application/pdf" });
}

describe("updateLease", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("updatelease");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: "00000000-0000-0000-0000-000000000000",
        property_id: propertyId,
        unit_identifier: "unit_a",
        tenant_name: "Test Tenant",
        rent_amount: "900",
        lease_start: "2026-01-15",
        status: "pending",
        utilities_included: true,
      }),
    );
    expect(result.error).toBe("Not signed in");
  });

  it("rejects a lease ending before it starts, without writing anything", async () => {
    await actAs(user);
    const created = await addLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_dates",
        tenant_name: "Original Tenant",
        rent_amount: "800",
        lease_start: "2026-01-01",
        status: "active",
        utilities_included: false,
      }),
    );
    expect(created.error).toBeUndefined();
    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_dates")
      .single();

    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: lease!.id,
        property_id: propertyId,
        unit_identifier: "unit_dates",
        tenant_name: "Original Tenant",
        rent_amount: "800",
        lease_start: "2026-06-01",
        lease_end: "2026-01-01",
        status: "active",
        utilities_included: false,
      }),
    );
    expect(result.error).toMatch(/on or after the start date/i);

    const { data: unchanged } = await user.client
      .from("leases")
      .select("lease_start")
      .eq("id", lease!.id)
      .single();
    expect(unchanged!.lease_start).toBe("2026-01-01");
  });

  it("updates the lease's terms in place", async () => {
    await actAs(user);
    const created = await addLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_b",
        tenant_name: "Jane Renter",
        rent_amount: "900",
        lease_start: "2026-01-01",
        status: "active",
        utilities_included: false,
      }),
    );
    expect(created.error).toBeUndefined();
    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_b")
      .single();

    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: lease!.id,
        property_id: propertyId,
        unit_identifier: "unit_b",
        tenant_name: "Jane Renter",
        rent_amount: "950",
        lease_start: "2026-01-01",
        lease_end: "2026-12-31",
        status: "active",
        utilities_included: true,
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data: updated } = await user.client
      .from("leases")
      .select("*")
      .eq("id", lease!.id)
      .single();
    expect(updated!.rent_amount_cents).toBe(95_000);
    expect(updated!.lease_end).toBe("2026-12-31");
    expect(updated!.utilities_included).toBe(true);
  });

  it("replaces the lease's attached document — deletes the old one and links the new one", async () => {
    await actAs(user);
    const imported = await importLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_c",
        tenant_name: "Renewal Tenant",
        rent_amount: "900",
        lease_start: "2026-01-15",
        status: "active",
        utilities_included: true,
        file: await leaseFile("original.pdf"),
      }),
    );
    expect(imported.error).toBeUndefined();

    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_c")
      .single();
    const { data: originalLinks } = await user.client
      .from("document_links")
      .select("document_id")
      .eq("lease_id", lease!.id);
    expect(originalLinks).toHaveLength(1);
    const originalDocId = originalLinks![0].document_id;

    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: lease!.id,
        property_id: propertyId,
        unit_identifier: "unit_c",
        tenant_name: "Renewal Tenant",
        rent_amount: "925",
        lease_start: "2026-01-15",
        status: "active",
        utilities_included: true,
        file: await leaseFile("renewal.pdf"),
      }),
    );
    expect(result.error).toBeUndefined();

    const { data: oldDoc } = await user.client
      .from("documents")
      .select("id")
      .eq("id", originalDocId);
    expect(oldDoc).toEqual([]); // old document row is gone

    const { data: newLinks } = await user.client
      .from("document_links")
      .select("document_id, documents(file_name)")
      .eq("lease_id", lease!.id);
    expect(newLinks).toHaveLength(1); // replaced, not appended
    expect(
      (newLinks![0].documents as unknown as { file_name: string }).file_name,
    ).toBe("renewal.pdf");
  });

  it("leaves an existing document untouched when no new file is attached", async () => {
    await actAs(user);
    const imported = await importLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_d",
        tenant_name: "No Replace Tenant",
        rent_amount: "700",
        lease_start: "2026-02-01",
        status: "active",
        utilities_included: false,
        file: await leaseFile("keep-me.pdf"),
      }),
    );
    expect(imported.error).toBeUndefined();
    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_d")
      .single();

    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: lease!.id,
        property_id: propertyId,
        unit_identifier: "unit_d",
        tenant_name: "No Replace Tenant",
        rent_amount: "725",
        lease_start: "2026-02-01",
        status: "active",
        utilities_included: false,
      }),
    );
    expect(result.error).toBeUndefined();

    const { data: links } = await user.client
      .from("document_links")
      .select("documents(file_name)")
      .eq("lease_id", lease!.id);
    expect(links).toHaveLength(1);
    expect(
      (links![0].documents as unknown as { file_name: string }).file_name,
    ).toBe("keep-me.pdf");
  });

  it("rejects a non-PDF/image replacement file", async () => {
    await actAs(user);
    const created = await addLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_e",
        tenant_name: "Bad File Tenant",
        rent_amount: "600",
        lease_start: "2026-03-01",
        status: "active",
        utilities_included: false,
      }),
    );
    expect(created.error).toBeUndefined();
    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_e")
      .single();

    const badFile = new File(["hi"], "note.txt", { type: "text/plain" });
    const result = await updateLease(
      emptyActionState,
      buildFormData({
        id: lease!.id,
        property_id: propertyId,
        unit_identifier: "unit_e",
        tenant_name: "Bad File Tenant",
        rent_amount: "600",
        lease_start: "2026-03-01",
        status: "active",
        utilities_included: false,
        file: badFile,
      }),
    );
    expect(result.error).toMatch(/only pdf or image/i);

    // rejected before the lease row was touched
    const { data: unchanged } = await user.client
      .from("leases")
      .select("rent_amount_cents")
      .eq("id", lease!.id)
      .single();
    expect(unchanged!.rent_amount_cents).toBe(60_000);
  });
});
