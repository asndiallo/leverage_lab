"use client";

import { useCallback, useEffect, useState } from "react";

/** Checkbox-row selection for a filterable/sortable list: tracks a Set of
 * selected ids, auto-drops ones that scroll out of the current filtered/
 * sorted view (or get deleted) so the "N selected" count never drifts, and
 * exposes a select-all toggle scoped to what's currently visible. */
export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }, [allSelected, visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, allSelected, toggleAll, clear };
}
