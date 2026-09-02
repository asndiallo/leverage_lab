"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { dollarsToCents } from "@/lib/format";
import { parseLeasePdf } from "@/lib/lease-parser";
import {
  ALLOWED_DOCUMENT_MIME,
  deleteDocumentById,
  firstError,
  money,
  optionalEmail,
  requireUser,
  uploadDocumentFile,
} from "./shared";
import type { ActionState } from "@/lib/action-types";

const leaseFieldsSchema = z.object({
  property_id: z.string().uuid(),
  unit_identifier: z.string().min(1, "Unit is required"),
  tenant_name: z.string().min(1, "Tenant name is required"),
  tenant_email: optionalEmail,
  rent_amount: money,
  lease_start: z.string().min(1, "Start date is required"),
  lease_end: z.string().optional().or(z.literal("")),
  flat_utility_charge: money.optional(),
  utilities_included: z.boolean(),
  status: z.enum(["pending", "active", "ended"]),
});

function endAfterStart(v: { lease_start: string; lease_end?: string }) {
  return !v.lease_end || v.lease_end >= v.lease_start;
}
const endAfterStartRefinement = {
  message: "Lease end must be on or after the start date",
};

const leaseSchema = leaseFieldsSchema.refine(
  endAfterStart,
  endAfterStartRefinement,
);

const importLeaseSchema = leaseFieldsSchema
  .extend({ notes: z.string().optional().or(z.literal("")) })
  .refine(endAfterStart, endAfterStartRefinement);

const updateLeaseSchema = leaseFieldsSchema
  .extend({ id: z.string().uuid() })
  .refine(endAfterStart, endAfterStartRefinement);

export async function addLease(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = leaseSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    unit_identifier: String(formData.get("unit_identifier") ?? ""),
    tenant_name: String(formData.get("tenant_name") ?? ""),
    tenant_email: String(formData.get("tenant_email") ?? ""),
    rent_amount: String(formData.get("rent_amount") ?? ""),
    lease_start: String(formData.get("lease_start") ?? ""),
    lease_end: String(formData.get("lease_end") ?? ""),
    flat_utility_charge: String(formData.get("flat_utility_charge") ?? "0"),
    utilities_included: formData.get("utilities_included") === "on",
    status: String(formData.get("status") ?? "pending"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { error } = await supabase.from("leases").insert({
    user_id: user.id,
    property_id: v.property_id,
    unit_identifier: v.unit_identifier,
    tenant_name: v.tenant_name,
    tenant_email: v.tenant_email || null,
    rent_amount_cents: dollarsToCents(v.rent_amount),
    lease_start: v.lease_start,
    lease_end: v.lease_end || null,
    utilities_included: v.utilities_included,
    flat_utility_charge_cents: dollarsToCents(v.flat_utility_charge ?? 0),
    status: v.status,
  });
  if (error) return { error: error.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  return { ok: true };
}

/** Extracts best-effort fields from an uploaded lease PDF without saving
 * anything — the caller shows them in an editable form and submits via
 * importLease once reviewed. Only understands this landlord's own PandaDoc
 * room-lease template; see lib/lease-parser.ts. */
export async function parseLeaseFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a PDF to parse" };
  if (file.type && file.type !== "application/pdf")
    return { error: "Only PDF files can be parsed" };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsedLease = await parseLeasePdf(bytes);
    return { ok: true, parsedLease };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not read that PDF",
    };
  }
}

/** Creates the lease row from the (reviewed/edited) parsed fields and files
 * the original PDF as a linked "lease" document, in one save. */
export async function importLease(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Attach the lease PDF" };
  if (file.size > 15 * 1024 * 1024) return { error: "File exceeds 15 MB" };
  if (file.type && !ALLOWED_DOCUMENT_MIME.includes(file.type))
    return { error: "Only PDF or image files are allowed" };

  const parsed = importLeaseSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    unit_identifier: String(formData.get("unit_identifier") ?? ""),
    tenant_name: String(formData.get("tenant_name") ?? ""),
    tenant_email: String(formData.get("tenant_email") ?? ""),
    rent_amount: String(formData.get("rent_amount") ?? ""),
    lease_start: String(formData.get("lease_start") ?? ""),
    lease_end: String(formData.get("lease_end") ?? ""),
    flat_utility_charge: String(formData.get("flat_utility_charge") ?? "0"),
    utilities_included: formData.get("utilities_included") === "on",
    status: String(formData.get("status") ?? "pending"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const { data: lease, error: leaseErr } = await supabase
    .from("leases")
    .insert({
      user_id: user.id,
      property_id: v.property_id,
      unit_identifier: v.unit_identifier,
      tenant_name: v.tenant_name,
      tenant_email: v.tenant_email || null,
      rent_amount_cents: dollarsToCents(v.rent_amount),
      lease_start: v.lease_start,
      lease_end: v.lease_end || null,
      utilities_included: v.utilities_included,
      flat_utility_charge_cents: dollarsToCents(v.flat_utility_charge ?? 0),
      status: v.status,
      notes: v.notes || null,
    })
    .select("id")
    .single();
  if (leaseErr) return { error: leaseErr.message };

  const uploaded = await uploadDocumentFile(supabase, user, {
    propertyId: v.property_id,
    file,
    docType: "lease",
    title: `Lease — ${v.tenant_name}`,
  });
  if ("error" in uploaded) return { error: uploaded.error };

  const { error: linkErr } = await supabase.from("document_links").insert({
    user_id: user.id,
    document_id: uploaded.id,
    lease_id: lease.id,
  });
  if (linkErr) return { error: linkErr.message };

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  revalidatePath("/documents");
  return { ok: true };
}

/** Updates an existing lease's terms. If a new file is attached, it replaces
 * whatever document(s) are currently linked to this lease (e.g. a renewal's
 * signed PDF) — the old document(s) are deleted (storage + row) rather than
 * left orphaned alongside the new one. The file is optional: editing terms
 * alone (a rent correction, ending a lease) doesn't require re-uploading. */
export async function updateLease(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = updateLeaseSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    property_id: String(formData.get("property_id") ?? ""),
    unit_identifier: String(formData.get("unit_identifier") ?? ""),
    tenant_name: String(formData.get("tenant_name") ?? ""),
    tenant_email: String(formData.get("tenant_email") ?? ""),
    rent_amount: String(formData.get("rent_amount") ?? ""),
    lease_start: String(formData.get("lease_start") ?? ""),
    lease_end: String(formData.get("lease_end") ?? ""),
    flat_utility_charge: String(formData.get("flat_utility_charge") ?? "0"),
    utilities_included: formData.get("utilities_included") === "on",
    status: String(formData.get("status") ?? "pending"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  const file = formData.get("file");
  const hasNewFile = file instanceof File && file.size > 0;
  if (hasNewFile) {
    if (file.size > 15 * 1024 * 1024) return { error: "File exceeds 15 MB" };
    if (file.type && !ALLOWED_DOCUMENT_MIME.includes(file.type))
      return { error: "Only PDF or image files are allowed" };
  }

  const { error: updErr } = await supabase
    .from("leases")
    .update({
      unit_identifier: v.unit_identifier,
      tenant_name: v.tenant_name,
      tenant_email: v.tenant_email || null,
      rent_amount_cents: dollarsToCents(v.rent_amount),
      lease_start: v.lease_start,
      lease_end: v.lease_end || null,
      utilities_included: v.utilities_included,
      flat_utility_charge_cents: dollarsToCents(v.flat_utility_charge ?? 0),
      status: v.status,
    })
    .eq("id", v.id);
  if (updErr) return { error: updErr.message };

  if (hasNewFile) {
    const { data: existingLinks, error: linksErr } = await supabase
      .from("document_links")
      .select("document_id")
      .eq("lease_id", v.id);
    if (linksErr) return { error: linksErr.message };

    for (const link of existingLinks ?? []) {
      const deleted = await deleteDocumentById(supabase, link.document_id);
      if ("error" in deleted) return { error: deleted.error };
    }

    const uploaded = await uploadDocumentFile(supabase, user, {
      propertyId: v.property_id,
      file,
      docType: "lease",
      title: `Lease — ${v.tenant_name}`,
    });
    if ("error" in uploaded) return { error: uploaded.error };

    const { error: linkErr } = await supabase.from("document_links").insert({
      user_id: user.id,
      document_id: uploaded.id,
      lease_id: v.id,
    });
    if (linkErr) return { error: linkErr.message };
  }

  revalidatePath(`/properties/${v.property_id}`);
  revalidatePath("/");
  revalidatePath("/documents");
  return { ok: true };
}

/** Deletes a lease along with any document(s) linked to it (storage object +
 * row) — document_links rows for this lease cascade via FK, but the
 * documents themselves don't, so they're cleaned up explicitly first, same
 * as updateLease's file-replace step. */
export async function deleteLease(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");

  const { data: links, error: linksErr } = await supabase
    .from("document_links")
    .select("document_id")
    .eq("lease_id", id);
  if (linksErr) return { error: linksErr.message };

  for (const link of links ?? []) {
    const deleted = await deleteDocumentById(supabase, link.document_id);
    if ("error" in deleted) return { error: deleted.error };
  }

  const { error } = await supabase.from("leases").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/");
  revalidatePath("/documents");
  return { ok: true };
}
