"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { firstError, requireUser } from "./shared";
import type { ActionState } from "@/lib/action-types";

const BUCKET = "documents";
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const documentSchema = z.object({
  property_id: z.string().uuid(),
  transaction_id: z.string().uuid().optional().or(z.literal("")),
  lease_id: z.string().uuid().optional().or(z.literal("")),
  doc_type: z.enum([
    "receipt",
    "lease",
    "closing_disclosure",
    "tax_document",
    "insurance",
    "statement",
    "appraisal",
    "other",
  ]),
  title: z.string().optional().or(z.literal("")),
});

export async function uploadDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a file to upload" };
  if (file.size > 15 * 1024 * 1024) return { error: "File exceeds 15 MB" };
  if (file.type && !ALLOWED_MIME.includes(file.type))
    return { error: "Only PDF or image files are allowed" };

  const parsed = documentSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    transaction_id: String(formData.get("transaction_id") ?? ""),
    lease_id: String(formData.get("lease_id") ?? ""),
    doc_type: String(formData.get("doc_type") ?? "other"),
    title: String(formData.get("title") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${v.property_id}/${id}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) return { error: upErr.message };

  const { error: dErr } = await supabase.from("documents").insert({
    id,
    user_id: user.id,
    property_id: v.property_id,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    doc_type: v.doc_type,
    title: v.title || file.name,
  });
  if (dErr) {
    await supabase.storage.from(BUCKET).remove([path]); // roll back the upload
    return { error: dErr.message };
  }

  // Optionally attach to a transaction or lease via the join table.
  if (v.transaction_id || v.lease_id) {
    const { error: lErr } = await supabase.from("document_links").insert({
      user_id: user.id,
      document_id: id,
      transaction_id: v.transaction_id || null,
      lease_id: v.lease_id || null,
    });
    if (lErr) return { error: lErr.message };
  }

  revalidatePath("/documents");
  revalidatePath(`/properties/${v.property_id}`);
  if (v.transaction_id)
    revalidatePath(
      `/properties/${v.property_id}/transactions/${v.transaction_id}`,
    );
  return { ok: true };
}

export async function linkDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const documentId = String(formData.get("document_id") ?? "");
  const transactionId = String(formData.get("transaction_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  if (!documentId || !transactionId)
    return { error: "Choose a document to link" };

  const { error } = await supabase.from("document_links").insert({
    user_id: user.id,
    document_id: documentId,
    transaction_id: transactionId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}/transactions/${transactionId}`);
  return { ok: true };
}

export async function unlinkDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const linkId = String(formData.get("link_id") ?? "");
  const { error } = await supabase
    .from("document_links")
    .delete()
    .eq("id", linkId);
  if (error) return { error: error.message };

  const propertyId = String(formData.get("property_id") ?? "");
  const transactionId = String(formData.get("transaction_id") ?? "");
  if (propertyId && transactionId)
    revalidatePath(`/properties/${propertyId}/transactions/${transactionId}`);
  return { ok: true };
}

export async function deleteDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get("document_id") ?? "");
  const { data: doc, error: fErr } = await supabase
    .from("documents")
    .select("storage_path, property_id")
    .eq("id", id)
    .maybeSingle();
  if (fErr) return { error: fErr.message };
  if (!doc) return { error: "Document not found" };

  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  // document_links rows cascade-delete via FK.
  const { error: dErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);
  if (dErr) return { error: dErr.message };

  revalidatePath("/documents");
  revalidatePath(`/properties/${doc.property_id}`);
  return { ok: true };
}

export async function deleteDocuments(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const ids = String(formData.get("document_ids") ?? "")
    .split(",")
    .filter(Boolean);
  if (ids.length === 0) return { error: "No documents selected" };

  const { data: docs, error: fErr } = await supabase
    .from("documents")
    .select("storage_path, property_id")
    .in("id", ids);
  if (fErr) return { error: fErr.message };
  if (!docs || docs.length === 0) return { error: "Documents not found" };

  await supabase.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
  // document_links rows cascade-delete via FK.
  const { error: dErr } = await supabase
    .from("documents")
    .delete()
    .in("id", ids);
  if (dErr) return { error: dErr.message };

  revalidatePath("/documents");
  for (const propertyId of new Set(docs.map((d) => d.property_id))) {
    revalidatePath(`/properties/${propertyId}`);
  }
  return { ok: true };
}
