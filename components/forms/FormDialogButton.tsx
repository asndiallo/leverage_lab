"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormState } from "react-dom";
import { emptyActionState, type ActionState } from "@/lib/action-types";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "./formPrimitives";
import { FormDialog } from "./FormDialog";

/** The "add/edit via a dialog form" pattern shared by every entry form in the
 * app: trigger button opens a FormDialog, submitting resets the form and
 * closes the dialog once the Server Action reports success, and any error
 * renders above the Cancel/Submit row. Field markup is passed as children —
 * none of it needs access to `state` or the form ref. */
export function FormDialogButton({
  action,
  title,
  description,
  trigger,
  submitLabel,
  cancelLabel = "Cancel",
  children,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  title: string;
  description?: string;
  trigger: ReactNode;
  submitLabel: string;
  cancelLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <FormDialog open={open} onOpenChange={setOpen} title={title} description={description} trigger={trigger}>
      <form ref={ref} action={formAction} className="space-y-4">
        {children}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <SubmitButton label={submitLabel} />
        </div>
      </form>
    </FormDialog>
  );
}
