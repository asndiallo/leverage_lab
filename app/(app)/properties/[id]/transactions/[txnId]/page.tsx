import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProperty,
  getTransaction,
  getTransactionDocuments,
  getPropertyLevelDocuments,
  getSignedUrlMap,
} from "@/lib/queries";
import { money, dateLabel } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { DocumentList } from "@/components/documents/DocumentList";

export const dynamic = "force-dynamic";

export default async function TransactionPage({
  params,
}: {
  params: { id: string; txnId: string };
}) {
  const [property, txn] = await Promise.all([
    getProperty(params.id),
    getTransaction(params.txnId),
  ]);
  if (!property || !txn || txn.property_id !== params.id) notFound();

  const [docs, propertyDocs] = await Promise.all([
    getTransactionDocuments(params.txnId),
    getPropertyLevelDocuments(params.id),
  ]);
  const urlMap = await getSignedUrlMap(
    [...docs, ...propertyDocs].map((d) => d.storage_path),
  );
  const income = txn.transaction_categories?.direction === "income";

  return (
    <div className="space-y-6">
      <Link href={`/properties/${params.id}`} className="text-sm text-muted hover:text-ink">
        ← {property.address}
      </Link>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge>{txn.transaction_categories?.label ?? txn.category}</Badge>
              {txn.is_estimate && <Badge variant="neutral">Est.</Badge>}
            </div>
            <h1 className="mt-2 text-xl font-semibold">
              {txn.description || txn.transaction_categories?.label || "Transaction"}
            </h1>
            <p className="text-sm text-muted">
              {dateLabel(txn.txn_date)} · paid by {txn.paid_by}
            </p>
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${income ? "text-positive" : "text-ink"}`}>
            {income ? "+" : "−"}
            {money(txn.amount_cents)}
          </div>
        </div>
        {txn.notes && <p className="mt-3 text-sm text-muted">{txn.notes}</p>}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Documents</h2>
          <DocumentUpload
            propertyId={params.id}
            transactionId={params.txnId}
            defaultType="receipt"
            label="Upload receipt"
          />
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-muted">No documents linked to this transaction yet.</p>
        ) : (
          <div className="space-y-4">
            {docs.map((d) => (
              <DocumentPreview key={d.id} doc={d} url={urlMap[d.storage_path]} />
            ))}
          </div>
        )}
      </section>

      {propertyDocs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Closing &amp; property documents</h2>
          <div className="rounded-xl border border-border bg-surface p-4">
            <DocumentList docs={propertyDocs} urlMap={urlMap} />
          </div>
        </section>
      )}
    </div>
  );
}
