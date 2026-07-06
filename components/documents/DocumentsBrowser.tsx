"use client";

import { useMemo, useState } from "react";
import { deleteDocuments } from "@/lib/actions";
import { useSelection } from "@/lib/hooks/useSelection";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortDirectionButton } from "@/components/forms/SortDirectionButton";
import { BulkDeleteBar } from "@/components/forms/BulkDeleteBar";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { DocumentList } from "./DocumentList";
import type { DocumentWithProperty } from "@/lib/queries";
import type { DocumentType } from "@/types/database";

type SortKey = "date" | "size" | "name";
type TypeFilter = DocumentType | "all";

const SORT_LABELS: Record<SortKey, string> = {
  date: "Date added",
  size: "File size",
  name: "Name",
};

export function DocumentsBrowser({
  docs,
  urlMap,
}: {
  docs: DocumentWithProperty[];
  urlMap: Record<string, string>;
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  // Descending default matches "most recent first" for dates, and reads
  // naturally as "largest first" / "Z-A" for the other keys too.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const presentTypes = useMemo(
    () => DOCUMENT_TYPES.filter((t) => docs.some((d) => d.doc_type === t)),
    [docs],
  );

  const groups = useMemo(() => {
    const filtered = typeFilter === "all" ? docs : docs.filter((d) => d.doc_type === typeFilter);

    const sign = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "size") return sign * ((a.size_bytes ?? 0) - (b.size_bytes ?? 0));
      if (sortKey === "name") {
        return sign * (a.title || a.file_name).localeCompare(b.title || b.file_name);
      }
      return sign * a.uploaded_at.localeCompare(b.uploaded_at);
    });

    const map = new Map<string, { label: string; docs: DocumentWithProperty[] }>();
    for (const d of sorted) {
      const label = d.properties?.address ?? "Unassigned";
      const g = map.get(d.property_id) ?? { label, docs: [] };
      g.docs.push(d);
      map.set(d.property_id, g);
    }
    return [...map.values()];
  }, [docs, typeFilter, sortKey, sortDir]);

  const visibleIds = useMemo(() => groups.flatMap((g) => g.docs.map((d) => d.id)), [groups]);
  const { selected, toggle, allSelected, toggleAll, clear } = useSelection(visibleIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
        <BulkDeleteBar
          count={selected.size}
          action={deleteDocuments}
          hiddenFields={{ document_ids: [...selected].join(",") }}
          itemLabel="document"
          onDeleted={clear}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {presentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SortDirectionButton
            sortDir={sortDir}
            onToggle={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No documents match this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.label} className="gap-0 p-0">
              <div className="border-b px-5 py-3 font-medium">{g.label}</div>
              <div className="px-5 py-2">
                <DocumentList docs={g.docs} urlMap={urlMap} selectedIds={selected} onToggle={toggle} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
