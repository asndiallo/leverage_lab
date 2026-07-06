import { Badge } from "@/components/ui/badge";
import { dateLabel, formatBytes } from "@/lib/format";
import { DeleteDocButton } from "./DeleteDocButton";
import type { DocumentRecord } from "@/types/database";

export function DocumentList({
  docs,
  urlMap,
}: {
  docs: DocumentRecord[];
  urlMap: Record<string, string>;
}) {
  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents.</p>;
  }
  return (
    <ul className="divide-y">
      {docs.map((d) => {
        const url = urlMap[d.storage_path];
        return (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{d.doc_type.replace(/_/g, " ")}</Badge>
                <span className="truncate text-sm">{d.title || d.file_name}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatBytes(d.size_bytes)} · {dateLabel(d.uploaded_at)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 text-sm font-medium text-primary hover:underline"
                >
                  View
                </a>
              )}
              <DeleteDocButton documentId={d.id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
