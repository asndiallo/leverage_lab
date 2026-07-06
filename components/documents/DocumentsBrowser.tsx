"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { deleteDocuments } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteButton } from "@/components/forms/ConfirmDeleteButton";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drop any selected id that's no longer visible (filter changed, or a
  // single-row delete removed it) so the count/bar stay accurate.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          checked={allVisibleSelected}
          onCheckedChange={() =>
            setSelected(allVisibleSelected ? new Set() : new Set(visibleIds))
          }
          aria-label="Select all"
        />
        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{selected.size} selected</span>
            <ConfirmDeleteButton
              action={deleteDocuments}
              hiddenFields={{ document_ids: [...selected].join(",") }}
              title={`Delete ${selected.size} document${selected.size === 1 ? "" : "s"}?`}
              triggerLabel={`Delete ${selected.size}`}
              onDeleted={() => setSelected(new Set())}
            />
          </div>
        )}
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
          </Button>
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
