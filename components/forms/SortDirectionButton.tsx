"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SortDirectionButton({
  sortDir,
  onToggle,
}: {
  sortDir: "asc" | "desc";
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onToggle}
      aria-label={sortDir === "asc" ? "Ascending" : "Descending"}
    >
      {sortDir === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : (
        <ArrowDown className="size-3.5" />
      )}
    </Button>
  );
}
