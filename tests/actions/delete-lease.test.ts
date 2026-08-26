import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLease, deleteLease, importLease } from "@/lib/actions";
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

describe("deleteLease", () => {
  let user: TestUser;
  let propertyId: string;

  beforeAll(async () => {
    user = await createTestUser("deletelease");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects the call when not signed in", async () => {
    actAsSignedOut();
    const result = await deleteLease(
      emptyActionState,
      buildFormData({
        id: "00000000-0000-0000-0000-000000000000",
        property_id: propertyId,
      }),
    );
    expect(result.error).toBe("Not signed in");
  });

  it("deletes a lease with no attached document", async () => {
    await actAs(user);
    const created = await addLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_no_doc",
        tenant_name: "No Doc Tenant",
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
      .eq("unit_identifier", "unit_no_doc")
      .single();

    const result = await deleteLease(
      emptyActionState,
      buildFormData({ id: lease!.id, property_id: propertyId }),
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    const { data: afterDelete } = await user.client
      .from("leases")
      .select("id")
      .eq("id", lease!.id);
    expect(afterDelete).toEqual([]);
  });

  it("deletes a lease and its attached document (row + storage object)", async () => {
    await actAs(user);
    const imported = await importLease(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        unit_identifier: "unit_with_doc",
        tenant_name: "With Doc Tenant",
        rent_amount: "900",
        lease_start: "2026-01-15",
        status: "active",
        utilities_included: true,
        file: await leaseFile("to-delete-with-lease.pdf"),
      }),
    );
    expect(imported.error).toBeUndefined();

    const { data: lease } = await user.client
      .from("leases")
      .select("id")
      .eq("unit_identifier", "unit_with_doc")
      .single();
    const { data: links } = await user.client
      .from("document_links")
      .select("document_id, documents(storage_path)")
      .eq("lease_id", lease!.id);
    expect(links).toHaveLength(1);
    const docId = links![0].document_id;
    const storagePath = (
      links![0].documents as unknown as { storage_path: string }
    ).storage_path;

    const result = await deleteLease(
      emptyActionState,
      buildFormData({ id: lease!.id, property_id: propertyId }),
    );
    expect(result.error).toBeUndefined();

    const { data: leaseAfterDelete } = await user.client
      .from("leases")
      .select("id")
      .eq("id", lease!.id);
    expect(leaseAfterDelete).toEqual([]); // lease row gone

    const { data: docAfterDelete } = await user.client
      .from("documents")
      .select("id")
      .eq("id", docId);
    expect(docAfterDelete).toEqual([]); // document row gone

    const { data: linksAfterDelete } = await user.client
      .from("document_links")
      .select("id")
      .eq("lease_id", lease!.id);
    expect(linksAfterDelete).toEqual([]); // link row gone (cascade)

    const { data: stillInStorage } = await user.client.storage
      .from("documents")
      .list(storagePath.split("/").slice(0, -1).join("/"));
    expect(stillInStorage?.some((f) => storagePath.endsWith(f.name))).toBe(
      false,
    ); // storage object gone
  });
});
