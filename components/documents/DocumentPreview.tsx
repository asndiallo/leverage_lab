import { Badge } from "@/components/ui/Badge";
import { DeleteDocButton } from "./DeleteDocButton";
import type { DocumentRecord } from "@/types/database";

export function DocumentPreview({
  doc,
  url,
}: {
  doc: DocumentRecord;
  url: string | undefined;
}) {
  const isPdf =
    doc.mime_type === "application/pdf" || doc.file_name.toLowerCase().endsWith(".pdf");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge>{doc.doc_type.replace(/_/g, " ")}</Badge>
          <span className="truncate text-sm">{doc.title || doc.file_name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-brand">
              Open
            </a>
          )}
          <DeleteDocButton documentId={doc.id} />
        </div>
      </div>
      {!url ? (
        <div className="px-4 py-6 text-sm text-muted">Preview unavailable.</div>
      ) : isPdf ? (
        <iframe src={url} title={doc.file_name} className="h-[600px] w-full bg-white" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={doc.file_name} className="max-h-[600px] w-full bg-white object-contain" />
      )}
    </div>
  );
}
