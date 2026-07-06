"use client";

import { ConfirmDeleteButton } from "./ConfirmDeleteButton";
import type { ActionState } from "@/lib/action-types";

export function BulkDeleteBar({
  count,
  action,
  hiddenFields,
  itemLabel,
  onDeleted,
}: {
  count: number;
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  itemLabel: string;
  onDeleted: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{count} selected</span>
      <ConfirmDeleteButton
        action={action}
        hiddenFields={hiddenFields}
        title={`Delete ${count} ${itemLabel}${count === 1 ? "" : "s"}?`}
        triggerLabel={`Delete ${count}`}
        onDeleted={onDeleted}
      />
    </div>
  );
}
