import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  uploadDocument,
  linkDocument,
  unlinkDocument,
  deleteDocument,
  deleteDocuments,
} from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
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
import { actAs } from "../setup/actAs";
import { buildFormData } from "../setup/formData";

function pdfFile(name = "receipt.pdf", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("document Server Actions", () => {
  let user: TestUser;
  let propertyId: string;
  let transactionId: string;

  beforeAll(async () => {
    user = await createTestUser("documents");
    const property = await createTestProperty(user.client, user.id);
    propertyId = property.id;
    const txn = await createTestTransaction(user.client, user.id, propertyId, {
      category: "rent",
    });
    transactionId = txn.id;
  });

  afterAll(async () => {
    await deleteTestProperty(propertyId);
    await deleteTestUser(user.id);
  });

  it("rejects a non-PDF/image mime type", async () => {
    await actAs(user);
    const file = new File(["x"], "malware.exe", {
      type: "application/x-msdownload",
    });
    const result = await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file,
      }),
    );
    expect(result.error).toMatch(/only pdf or image/i);
  });

  it("rejects a file over 15MB", async () => {
    await actAs(user);
    const big = pdfFile("huge.pdf", 16 * 1024 * 1024);
    const result = await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file: big,
      }),
    );
    expect(result.error).toMatch(/exceeds 15 ?mb/i);
  });

  it("uploads a document, records it, and optionally links it to a transaction", async () => {
    await actAs(user);
    const file = pdfFile("closing-disclosure.pdf");
    const result = await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        transaction_id: transactionId,
        doc_type: "closing_disclosure",
        file,
      }),
    );
    expect(result.error).toBeUndefined();

    const { data: docs } = await user.client
      .from("documents")
      .select("*")
      .eq("property_id", propertyId)
      .eq("file_name", "closing-disclosure.pdf");
    expect(docs).toHaveLength(1);
    const doc = docs![0];
    expect(doc.mime_type).toBe("application/pdf");
    expect(doc.doc_type).toBe("closing_disclosure");
    expect(doc.title).toBe("closing-disclosure.pdf"); // defaults to file name

    const { data: links } = await user.client
      .from("document_links")
      .select("*")
      .eq("document_id", doc.id)
      .eq("transaction_id", transactionId);
    expect(links).toHaveLength(1);

    // the file itself is retrievable from storage
    const { data: signed } = await user.client.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60);
    expect(signed?.signedUrl).toBeTruthy();
  });

  it("links and unlinks an already-uploaded document to a transaction separately", async () => {
    await actAs(user);
    const upload = await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file: pdfFile("standalone.pdf"),
      }),
    );
    expect(upload.error).toBeUndefined();
    const { data: doc } = await user.client
      .from("documents")
      .select("id")
      .eq("file_name", "standalone.pdf")
      .single();

    const linked = await linkDocument(
      emptyActionState,
      buildFormData({
        document_id: doc!.id,
        transaction_id: transactionId,
        property_id: propertyId,
      }),
    );
    expect(linked.error).toBeUndefined();

    const { data: link } = await user.client
      .from("document_links")
      .select("id")
      .eq("document_id", doc!.id)
      .eq("transaction_id", transactionId)
      .single();
    expect(link).toBeTruthy();

    const unlinked = await unlinkDocument(
      emptyActionState,
      buildFormData({
        link_id: link!.id,
        property_id: propertyId,
        transaction_id: transactionId,
      }),
    );
    expect(unlinked.error).toBeUndefined();

    const { data: afterUnlink } = await user.client
      .from("document_links")
      .select("id")
      .eq("id", link!.id);
    expect(afterUnlink).toEqual([]);
  });

  it("deletes a document and its storage object", async () => {
    await actAs(user);
    await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file: pdfFile("to-delete.pdf"),
      }),
    );
    const { data: doc } = await user.client
      .from("documents")
      .select("id, storage_path")
      .eq("file_name", "to-delete.pdf")
      .single();

    const result = await deleteDocument(
      emptyActionState,
      buildFormData({ document_id: doc!.id }),
    );
    expect(result.error).toBeUndefined();

    const { data: afterDelete } = await user.client
      .from("documents")
      .select("id")
      .eq("id", doc!.id);
    expect(afterDelete).toEqual([]);

    const { data: stillInStorage } = await user.client.storage
      .from("documents")
      .list(doc!.storage_path.split("/").slice(0, -1).join("/"));
    expect(
      stillInStorage?.some((f) => doc!.storage_path.endsWith(f.name)),
    ).toBe(false);
  });

  it("bulk-deletes multiple documents and their storage objects in one call", async () => {
    await actAs(user);
    await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file: pdfFile("bulk-a.pdf"),
      }),
    );
    await uploadDocument(
      emptyActionState,
      buildFormData({
        property_id: propertyId,
        doc_type: "other",
        file: pdfFile("bulk-b.pdf"),
      }),
    );
    const { data: docs } = await user.client
      .from("documents")
      .select("id, storage_path")
      .eq("property_id", propertyId)
      .in("file_name", ["bulk-a.pdf", "bulk-b.pdf"]);
    expect(docs).toHaveLength(2);
    const ids = docs!.map((d) => d.id);

    const result = await deleteDocuments(
      emptyActionState,
      buildFormData({ document_ids: ids.join(",") }),
    );
    expect(result.error).toBeUndefined();

    const { data: after } = await user.client
      .from("documents")
      .select("id")
      .in("id", ids);
    expect(after).toEqual([]);

    for (const doc of docs!) {
      const { data: stillInStorage } = await user.client.storage
        .from("documents")
        .list(doc.storage_path.split("/").slice(0, -1).join("/"));
      expect(
        stillInStorage?.some((f) => doc.storage_path.endsWith(f.name)),
      ).toBe(false);
    }
  });

  it("rejects a bulk delete with no ids selected", async () => {
    await actAs(user);
    const result = await deleteDocuments(
      emptyActionState,
      buildFormData({ document_ids: "" }),
    );
    expect(result.error).toBe("No documents selected");
  });
});
