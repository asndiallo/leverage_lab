import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/types/database";

// Not itself a Server Action (no "use server" here — a "use server" file may
// only export async functions), just the bits every action in lib/actions/*
// shares.

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export const optionalEmail = z.string().email().optional().or(z.literal(""));
export const money = z.coerce.number().nonnegative();

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthResult =
  | { ok: true; supabase: SupabaseServerClient; user: User }
  | { ok: false; error: string };

/**
 * Every action starts by resolving the signed-in user and bailing out with
 * the same error shape if there isn't one. Callers do:
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return { error: auth.error };
 *   const { supabase, user } = auth;
 *
 * (an explicit `ok` discriminant, not `"error" in auth` — every field in
 * ActionState is optional, so `in`-narrowing a union against it doesn't
 * reliably discriminate)
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  return { ok: true, supabase, user };
}

const DOCUMENTS_BUCKET = "documents";
export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Storage upload + `documents` row insert shared by uploadDocument and
 * importLease. Does not touch document_links — callers link the row to a
 * transaction/lease themselves, since which they attach to (if any) varies.
 */
export async function uploadDocumentFile(
  supabase: SupabaseServerClient,
  user: User,
  args: {
    propertyId: string;
    file: File;
    docType: DocumentType;
    title?: string;
  },
): Promise<{ id: string } | { error: string }> {
  const id = crypto.randomUUID();
  const safeName = args.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${args.propertyId}/${id}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type || undefined,
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error: dErr } = await supabase.from("documents").insert({
    id,
    user_id: user.id,
    property_id: args.propertyId,
    storage_path: path,
    file_name: args.file.name,
    mime_type: args.file.type || null,
    size_bytes: args.file.size,
    doc_type: args.docType,
    title: args.title || args.file.name,
  });
  if (dErr) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]); // roll back the upload
    return { error: dErr.message };
  }

  return { id };
}

/**
 * Removes a document's storage object and row (document_links rows cascade
 * via FK). Shared by deleteDocument/deleteDocuments and updateLease's
 * document-replace step, so "delete a document" stays defined once.
 */
export async function deleteDocumentById(
  supabase: SupabaseServerClient,
  documentId: string,
): Promise<{ propertyId: string } | { error: string }> {
  const { data: doc, error: fErr } = await supabase
    .from("documents")
    .select("storage_path, property_id")
    .eq("id", documentId)
    .maybeSingle();
  if (fErr) return { error: fErr.message };
  if (!doc) return { error: "Document not found" };

  await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  const { error: dErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (dErr) return { error: dErr.message };

  return { propertyId: doc.property_id };
}
