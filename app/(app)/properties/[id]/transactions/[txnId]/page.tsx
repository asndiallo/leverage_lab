import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getProperty,
  getTransaction,
  getTransactionDocuments,
  getUnlinkedPropertyDocuments,
  getLinkableDocuments,
  getCategories,
  getSignedUrlMap,
} from "@/lib/queries";
import { money, dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EditTransactionForm } from "@/components/forms/EditTransactionForm";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { DocumentList } from "@/components/documents/DocumentList";
import { LinkDocumentForm } from "@/components/documents/LinkDocumentForm";
import { UnlinkDocButton } from "@/components/documents/UnlinkDocButton";

export const dynamic = "force-dynamic";

export default async function TransactionPage({
  params,
}: {
  params: { id: string; txnId: string };
}) {
  const [property, txn, categories] = await Promise.all([
    getProperty(params.id),
    getTransaction(params.txnId),
    getCategories(),
  ]);
  if (!property || !txn || txn.property_id !== params.id) notFound();

  const [linked, unlinked, linkable] = await Promise.all([
    getTransactionDocuments(params.txnId),
    getUnlinkedPropertyDocuments(params.id),
    getLinkableDocuments(params.id, params.txnId),
  ]);
  const urlMap = await getSignedUrlMap([
    ...linked.map((l) => l.doc.storage_path),
    ...unlinked.map((d) => d.storage_path),
  ]);
  const income = txn.transaction_categories?.direction === "income";

  return (
    <div className="space-y-6">
      <Link
        href={`/properties/${params.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        {property.address}
      </Link>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {txn.transaction_categories?.label ?? txn.category}
              </Badge>
              {txn.is_estimate && <Badge variant="outline">Est.</Badge>}
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {txn.description ||
                txn.transaction_categories?.label ||
                "Transaction"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {dateLabel(txn.txn_date)} · paid by {txn.paid_by}
            </p>
          </div>
          <div
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums",
              income ? "text-positive" : "text-foreground",
            )}
          >
            {income ? "+" : "−"}
            {money(txn.amount_cents)}
          </div>
        </div>
        {txn.notes && (
          <p className="text-muted-foreground mt-3 text-sm">{txn.notes}</p>
        )}
        <div className="mt-4">
          <EditTransactionForm txn={txn} categories={categories} />
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Documents</h2>
          <div className="flex flex-wrap items-center gap-3">
            <LinkDocumentForm
              propertyId={params.id}
              transactionId={params.txnId}
              candidates={linkable}
            />
            <DocumentUpload
              propertyId={params.id}
              transactionId={params.txnId}
              defaultType="receipt"
              label="Upload receipt"
            />
          </div>
        </div>
        {linked.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No documents linked to this transaction yet.
          </p>
        ) : (
          <div className="space-y-4">
            {linked.map(({ link_id, doc }) => (
              <DocumentPreview
                key={link_id}
                doc={doc}
                url={urlMap[doc.storage_path]}
                controls={
                  <UnlinkDocButton
                    linkId={link_id}
                    propertyId={params.id}
                    transactionId={params.txnId}
                  />
                }
              />
            ))}
          </div>
        )}
      </section>

      {unlinked.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Other property documents</h2>
          <Card className="p-4">
            <DocumentList docs={unlinked} urlMap={urlMap} />
          </Card>
        </section>
      )}
    </div>
  );
}
