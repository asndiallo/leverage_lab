"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { emptyActionState, type ActionState } from "@/lib/action-types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ConfirmSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Deleting…" : label}
    </Button>
  );
}

// AlertDialogAction closes the dialog on click BY DEFAULT (that's what
// distinguishes it from a plain button) — which unmounts this form before the
// async Server Action's fetch can be observed to complete, silently dropping
// the delete and hiding any error. Using a plain submit Button instead, and
// only closing the (now controlled) dialog once `state.ok` comes back true,
// keeps the form mounted for the whole request.
export function ConfirmDeleteButton({
  action,
  hiddenFields,
  title,
  description = "This cannot be undone.",
  onDeleted,
  triggerLabel = "Delete",
  iconOnly = false,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  title: string;
  description?: string;
  onDeleted?: () => void;
  triggerLabel?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, emptyActionState);

  if (state.ok && open) {
    setOpen(false);
  }

  useEffect(() => {
    if (state.ok) {
      onDeleted?.();
    }
  }, [state, onDeleted]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">{triggerLabel}</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {triggerLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <ConfirmSubmitButton label={triggerLabel} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
