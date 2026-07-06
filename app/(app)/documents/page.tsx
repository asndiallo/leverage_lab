import { getAllDocuments, getProperties, getSignedUrlMap } from "@/lib/queries";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentList } from "@/components/documents/DocumentList";
import type { DocumentWithProperty } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [docs, properties] = await Promise.all([getAllDocuments(), getProperties()]);
  const urlMap = await getSignedUrlMap(docs.map((d) => d.storage_path));

  // group by property
  const groups = new Map<string, { label: string; docs: DocumentWithProperty[] }>();
  for (const d of docs) {
    const label = d.properties?.address ?? "Unassigned";
    const g = groups.get(d.property_id) ?? { label, docs: [] };
    g.docs.push(d);
    groups.set(d.property_id, g);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Documents</h1>
        <p className="text-sm text-muted">Receipts, leases, and closing packets across your properties.</p>
      </div>

      {properties.length > 0 && (
        <DocumentUpload
          properties={properties.map((p) => ({ id: p.id, address: p.address }))}
          defaultType="other"
        />
      )}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          No documents yet. Upload receipts, leases, or your closing packet above.
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.values()].map((g) => (
            <div key={g.label} className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-3 font-medium">{g.label}</div>
              <div className="px-5 py-2">
                <DocumentList docs={g.docs} urlMap={urlMap} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
