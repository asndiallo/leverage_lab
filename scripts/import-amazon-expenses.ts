/**
 * Bulk-imports Amazon order-detail PDFs as property expenses: one `documents`
 * row per invoice (idempotent — re-running skips invoices already imported),
 * one `transactions` row per line item (category "supplies" — see the
 * category-choice note below), and `document_links` rows tying the one
 * invoice to every transaction it produced.
 *
 * Every item in this batch landed on "supplies" rather than a more specific
 * category (appliance/security_system/landscaping) by explicit owner
 * decision: all of it is under the IRS de minimis safe-harbor per-item
 * threshold, the app has no depreciation-schedule feature to capitalize
 * anything into, and capital_improvement categories feed the dashboard's
 * cash-invested/stabilized-NOI numbers differently than an operating
 * expense would — see property_cashflow_range / v_property_yields in
 * supabase/migrations/20260705000005_functions_views.sql.
 *
 * Usage:
 *   pnpm import:amazon-expenses --env=local [--dir=<path>] [--property-id=<uuid>]
 *   pnpm import:amazon-expenses --env=local --commit
 *   pnpm import:amazon-expenses --env=prod --commit
 *
 * Without --commit this only prints a report; nothing is written. --env
 * selects which Supabase project to hit: `local` reads credentials from the
 * running `supabase start` stack (via `supabase status -o json`), `prod`
 * expects SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the environment (e.g.
 * from `vercel env pull .env.prod.local --environment=production` sourced
 * beforehand).
 */
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  parseAmazonInvoice,
  type ParsedInvoice,
} from "../lib/amazon-invoice-parser";
import type { Database } from "../types/database";

const DEFAULT_DIR =
  "/Users/asan/Documents/Houses/117 Willow Cv, Cibolo, TX/expenses/amazon";
const BUCKET = "documents";
const CATEGORY = "supplies" as const;

// Not a categorization rule (everything is "supplies" per the owner
// decision above) — just a heads-up in the report for items that read as
// possibly-personal rather than a property expense, so a human glances at
// them before trusting the total.
const PERSONAL_USE_HINT =
  /toothbrush|dental floss|\bfloss\b|\bcoffee\b(?!\s*table)|\bmug(s)?\b/i;

// Reviewed against the dry-run report and confirmed personal-use, not a
// property expense: an electric toothbrush and floss picks. Everything else
// PERSONAL_USE_HINT flagged (coffee maker/coffee/filters, a mug kit, a
// coffee table) was confirmed fine to keep as "supplies".
//
// 2026-09-08 batch: groceries/spices and a car windshield sun shade excluded
// as personal consumption/personal-vehicle items — nothing a tenant could
// use. The Qtip holder dispenser is in the owner's personal bathroom, not a
// shared one. (Office furniture and bedding from the same batch WERE kept —
// confirmed as furnishing a tenant's room, not the owner's own space.)
const MANUAL_EXCLUSIONS: { title: RegExp; reason: string }[] = [
  { title: /Aquasonic.*Toothbrush/i, reason: "Personal use" },
  { title: /Plackers.*Floss/i, reason: "Personal use" },
  {
    title: /McCormick.*Garlic Butter Seasoning/i,
    reason: "Personal groceries",
  },
  { title: /Amazon Grocery.*Tomato Paste/i, reason: "Personal groceries" },
  { title: /Amazon Grocery.*Paprika/i, reason: "Personal groceries" },
  { title: /Goya.*Golden Corn/i, reason: "Personal groceries" },
  { title: /Goya.*Chick Peas/i, reason: "Personal groceries" },
  {
    title: /Amazon Grocery.*Ground Black Pepper/i,
    reason: "Personal groceries",
  },
  { title: /EcoNour.*Windshield Sun Shade/i, reason: "Personal vehicle item" },
  { title: /TIPGO.*Qtip Holder/i, reason: "Owner's personal bathroom" },
];

function getLocalCredentials(): { url: string; serviceRoleKey: string } {
  const raw = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
  });
  const status = JSON.parse(raw);
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

function getProdCredentials(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --env=prod " +
        "(e.g. `vercel env pull .env.prod.local --environment=production` " +
        "and source it before running this script).",
    );
  }
  return { url, serviceRoleKey };
}

function documentTitleFor(orderNumber: string): string {
  return `Amazon Order ${orderNumber}`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      env: { type: "string", default: "local" },
      dir: { type: "string", default: DEFAULT_DIR },
      "property-id": { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });

  if (values.env !== "local" && values.env !== "prod") {
    throw new Error('--env must be "local" or "prod"');
  }
  const { url, serviceRoleKey } =
    values.env === "local" ? getLocalCredentials() : getProdCredentials();
  const supabase = createClient<Database>(url, serviceRoleKey);

  let propertyId = values["property-id"];
  let ownerUserId: string;
  if (propertyId) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, user_id, address")
      .eq("id", propertyId)
      .single();
    if (error || !data) throw new Error(`Property ${propertyId} not found`);
    ownerUserId = data.user_id;
  } else {
    const { data, error } = await supabase
      .from("properties")
      .select("id, user_id, address")
      .ilike("address", "%Willow%");
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error(
        `Expected exactly one property matching "Willow", found ${data?.length ?? 0}. ` +
          "Pass --property-id explicitly.",
      );
    }
    propertyId = data[0].id;
    ownerUserId = data[0].user_id;
    console.log(`Resolved property: ${data[0].address} (${propertyId})`);
  }

  const dir = values.dir!;
  const files = (await readdir(dir)).filter((f) =>
    f.toLowerCase().endsWith(".pdf"),
  );
  console.log(
    `\nFound ${files.length} PDF(s) in ${dir}\nMode: ${values.commit ? "COMMIT" : "DRY RUN (pass --commit to write)"} — env: ${values.env}\n`,
  );

  let imported = 0;
  let skipped = 0;
  let totalCents = 0;
  const flaggedForReview: string[] = [];
  const allWarnings: string[] = [];

  for (const file of files.sort()) {
    const bytes = new Uint8Array(await readFile(path.join(dir, file)));
    let parsed: ParsedInvoice;
    try {
      parsed = await parseAmazonInvoice(bytes);
    } catch (e) {
      console.log(
        `SKIP (parse error) ${file}: ${e instanceof Error ? e.message : e}`,
      );
      continue;
    }

    if (!parsed.orderNumber || parsed.items.length === 0) {
      console.log(
        `SKIP (unparseable) ${file}: ${parsed.warnings.join("; ") || "no order number or items found"}`,
      );
      continue;
    }

    for (const exclusion of MANUAL_EXCLUSIONS) {
      const matched = parsed.items.filter((it) =>
        exclusion.title.test(it.title),
      );
      for (const it of matched) {
        parsed.excludedItems.push({
          title: it.title,
          unitPriceCents: it.unitPriceCents,
          reason: exclusion.reason,
        });
      }
      parsed.items = parsed.items.filter(
        (it) => !exclusion.title.test(it.title),
      );
    }

    if (parsed.items.length === 0) {
      console.log(
        `SKIP (fully excluded) ${file} — ${parsed.excludedItems.map((e) => e.title).join("; ")}`,
      );
      continue;
    }

    const title = documentTitleFor(parsed.orderNumber);
    const { data: existing } = await supabase
      .from("documents")
      .select("id")
      .eq("property_id", propertyId)
      .eq("title", title)
      .maybeSingle();
    if (existing) {
      console.log(`SKIP (already imported) ${file} — ${title}`);
      skipped++;
      continue;
    }

    const orderTotal = parsed.items.reduce((s, it) => s + it.shareCents, 0);
    console.log(
      `${values.commit ? "IMPORT" : "WOULD IMPORT"} ${file} — ${title} — ` +
        `${parsed.orderDate} — $${(orderTotal / 100).toFixed(2)} across ${parsed.items.length} item(s)` +
        (parsed.shipToAddress ? ` — ships to: ${parsed.shipToAddress}` : ""),
    );
    for (const item of parsed.items) {
      const flag = PERSONAL_USE_HINT.test(item.title)
        ? "  [REVIEW: personal-use?]"
        : "";
      if (flag) flaggedForReview.push(`${file}: ${item.title}`);
      console.log(
        `    $${(item.shareCents / 100).toFixed(2).padStart(8)}  ${item.title}${flag}`,
      );
    }
    for (const excluded of parsed.excludedItems) {
      console.log(
        `    (excluded, ${excluded.reason.toLowerCase()}) $${(excluded.unitPriceCents / 100).toFixed(2)}  ${excluded.title}`,
      );
    }
    if (parsed.warnings.length > 0) {
      for (const w of parsed.warnings) allWarnings.push(`${file}: ${w}`);
    }

    totalCents += orderTotal;
    imported++;

    if (!values.commit) continue;

    const noteLines = [
      parsed.shipToAddress ? `Ships to: ${parsed.shipToAddress}` : null,
      parsed.excludedItems.length > 0
        ? `Excluded (refunded): ${parsed.excludedItems.map((e) => e.title).join("; ")}`
        : null,
      parsed.warnings.length > 0
        ? `Warnings: ${parsed.warnings.join("; ")}`
        : null,
    ].filter((l): l is string => Boolean(l));

    // Re-read the file rather than reusing `bytes` — parseAmazonInvoice
    // (pdf.js) detaches its input buffer as a side effect, so `bytes` is a
    // zero-length husk by this point (see the warning on parseAmazonInvoice).
    const uploadBytes = await readFile(path.join(dir, file));

    const docId = crypto.randomUUID();
    const safeName = file.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${ownerUserId}/${propertyId}/${docId}-${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, uploadBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr)
      throw new Error(
        `Storage upload failed for ${file}: ${uploadErr.message}`,
      );

    const { error: docErr } = await supabase.from("documents").insert({
      id: docId,
      user_id: ownerUserId,
      property_id: propertyId,
      storage_path: storagePath,
      file_name: file,
      mime_type: "application/pdf",
      size_bytes: uploadBytes.byteLength,
      doc_type: "receipt",
      title,
      notes: noteLines.join("\n") || null,
    });
    if (docErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(`documents insert failed for ${file}: ${docErr.message}`);
    }

    const txnRows = parsed.items.map((item) => ({
      user_id: ownerUserId,
      property_id: propertyId!,
      txn_date: parsed.orderDate!,
      amount_cents: item.shareCents,
      category: CATEGORY,
      description: item.title,
      paid_by: "owner" as const,
      is_estimate: false,
    }));
    const { data: txns, error: txnErr } = await supabase
      .from("transactions")
      .insert(txnRows)
      .select("id");
    if (txnErr || !txns) {
      throw new Error(
        `transactions insert failed for ${file}: ${txnErr?.message}`,
      );
    }

    const linkRows = txns.map((t) => ({
      user_id: ownerUserId,
      document_id: docId,
      transaction_id: t.id,
    }));
    const { error: linkErr } = await supabase
      .from("document_links")
      .insert(linkRows);
    if (linkErr) {
      throw new Error(
        `document_links insert failed for ${file}: ${linkErr.message}`,
      );
    }
  }

  console.log(
    `\n${"=".repeat(60)}\n` +
      `${values.commit ? "Imported" : "Would import"}: ${imported} invoice(s), ` +
      `$${(totalCents / 100).toFixed(2)} total\n` +
      `Already imported (skipped): ${skipped}\n` +
      (flaggedForReview.length > 0
        ? `\nFlagged for manual review (possibly personal use):\n` +
          flaggedForReview.map((l) => `  - ${l}`).join("\n") +
          "\n"
        : "") +
      (allWarnings.length > 0
        ? `\nParser warnings:\n` +
          allWarnings.map((w) => `  - ${w}`).join("\n") +
          "\n"
        : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
