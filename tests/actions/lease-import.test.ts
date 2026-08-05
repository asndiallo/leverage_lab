import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importLease, parseLeaseFile } from "@/lib/actions";
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

describe("lease import Server Actions", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("leaseimport");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  describe("parseLeaseFile", () => {
    it("rejects the call when not signed in", async () => {
      actAsSignedOut();
      const result = await parseLeaseFile(
        emptyActionState,
        buildFormData({ file: await leaseFile() }),
      );
      expect(result.error).toBe("Not signed in");
    });

    it("rejects a missing file", async () => {
      await actAs(user);
      const result = await parseLeaseFile(emptyActionState, buildFormData({}));
      expect(result.error).toMatch(/choose a pdf/i);
    });

    it("rejects a non-PDF file", async () => {
      await actAs(user);
      const file = new File(["hi"], "note.txt", { type: "text/plain" });
      const result = await parseLeaseFile(
        emptyActionState,
        buildFormData({ file }),
      );
      expect(result.error).toMatch(/only pdf files/i);
    });

    it("extracts fields from the lease PDF without saving anything", async () => {
      await actAs(user);
      const result = await parseLeaseFile(
        emptyActionState,
        buildFormData({ file: await leaseFile() }),
      );
      expect(result.error).toBeUndefined();
      const parsed = result.parsedLease!;
      expect(parsed.tenantName).toBe("John Q. Tenant");
      expect(parsed.tenantEmail).toBe("john.tenant@example.test");
      expect(parsed.rentAmount).toBe("900");
      expect(parsed.leaseStart).toBe("2026-01-15");
      expect(parsed.warnings).toEqual([]);

      const { data: leases } = await user.client
        .from("leases")
        .select("id")
        .eq("property_id", propertyId);
      expect(leases).toEqual([]); // parsing alone must not write anything
    });
  });

  describe("importLease", () => {
    it("rejects the call when not signed in", async () => {
      actAsSignedOut();
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "unit_a",
          tenant_name: "Test Tenant",
          rent_amount: "900",
          lease_start: "2026-01-15",
          status: "pending",
          utilities_included: true,
          file: await leaseFile(),
        }),
      );
      expect(result.error).toBe("Not signed in");
    });

    it("rejects a missing file", async () => {
      await actAs(user);
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "unit_a",
          tenant_name: "Test Tenant",
          rent_amount: "900",
          lease_start: "2026-01-15",
          status: "pending",
          utilities_included: true,
        }),
      );
      expect(result.error).toMatch(/attach the lease pdf/i);
    });

    it("rejects a non-PDF/image file", async () => {
      await actAs(user);
      const file = new File(["hi"], "note.txt", { type: "text/plain" });
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "unit_a",
          tenant_name: "Test Tenant",
          rent_amount: "900",
          lease_start: "2026-01-15",
          status: "pending",
          utilities_included: true,
          file,
        }),
      );
      expect(result.error).toMatch(/only pdf or image/i);
    });

    it("rejects a lease ending before it starts, without touching the database", async () => {
      await actAs(user);
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "unit_bad_dates",
          tenant_name: "Test Tenant",
          rent_amount: "900",
          lease_start: "2026-06-01",
          lease_end: "2026-01-01",
          status: "pending",
          utilities_included: true,
          file: await leaseFile(),
        }),
      );
      expect(result.error).toMatch(/on or after the start date/i);

      const { data } = await user.client
        .from("leases")
        .select("id")
        .eq("unit_identifier", "unit_bad_dates");
      expect(data).toEqual([]);
    });

    it("creates the lease, uploads the PDF, and links them together", async () => {
      await actAs(user);
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "#1",
          tenant_name: "John Q. Tenant",
          tenant_email: "john.tenant@example.test",
          rent_amount: "900",
          lease_start: "2026-01-15",
          lease_end: "2026-07-15",
          flat_utility_charge: "0",
          utilities_included: true,
          status: "pending",
          notes: "Security deposit: $200\nLate fee: $50",
          file: await leaseFile(),
        }),
      );
      expect(result.error).toBeUndefined();
      expect(result.ok).toBe(true);

      const { data: leases } = await user.client
        .from("leases")
        .select("*")
        .eq("property_id", propertyId)
        .eq("unit_identifier", "#1");
      expect(leases).toHaveLength(1);
      const lease = leases![0];
      expect(lease.tenant_name).toBe("John Q. Tenant");
      expect(lease.tenant_email).toBe("john.tenant@example.test");
      expect(lease.rent_amount_cents).toBe(90_000);
      expect(lease.lease_start).toBe("2026-01-15");
      expect(lease.lease_end).toBe("2026-07-15");
      expect(lease.status).toBe("pending");
      expect(lease.notes).toBe("Security deposit: $200\nLate fee: $50");

      const { data: docs } = await user.client
        .from("documents")
        .select("*")
        .eq("property_id", propertyId)
        .eq("doc_type", "lease");
      expect(docs).toHaveLength(1);
      const doc = docs![0];
      expect(doc.title).toBe("Lease — John Q. Tenant");
      expect(doc.mime_type).toBe("application/pdf");

      const { data: links } = await user.client
        .from("document_links")
        .select("*")
        .eq("document_id", doc.id)
        .eq("lease_id", lease.id);
      expect(links).toHaveLength(1);

      const { data: signed } = await user.client.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60);
      expect(signed?.signedUrl).toBeTruthy();
    });

    it("treats an empty tenant_email as null rather than an empty string", async () => {
      await actAs(user);
      const result = await importLease(
        emptyActionState,
        buildFormData({
          property_id: propertyId,
          unit_identifier: "#2",
          tenant_name: "No Email Tenant",
          rent_amount: "500",
          lease_start: "2026-02-01",
          status: "pending",
          utilities_included: false,
          file: await leaseFile(),
        }),
      );
      expect(result.error).toBeUndefined();

      const { data } = await user.client
        .from("leases")
        .select("tenant_email")
        .eq("unit_identifier", "#2")
        .single();
      expect(data!.tenant_email).toBeNull();
    });
  });
});
