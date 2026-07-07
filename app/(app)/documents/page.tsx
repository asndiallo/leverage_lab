import { getAllDocuments, getProperties, getSignedUrlMap } from "@/lib/queries";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentsBrowser } from "@/components/documents/DocumentsBrowser";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [docs, properties] = await Promise.all([
    getAllDocuments(),
    getProperties(),
  ]);
  const urlMap = await getSignedUrlMap(docs.map((d) => d.storage_path));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Documents</h1>
          <p className="text-muted-foreground text-sm">
            Receipts, leases, and closing packets across your properties.
          </p>
        </div>
        {properties.length > 0 && (
          <DocumentUpload
            properties={properties.map((p) => ({
              id: p.id,
              address: p.address,
            }))}
            defaultType="other"
          />
        )}
      </div>

      {docs.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          No documents yet. Upload receipts, leases, or your closing packet
          above.
        </div>
      ) : (
        <DocumentsBrowser docs={docs} urlMap={urlMap} />
      )}
    </div>
  );
}
