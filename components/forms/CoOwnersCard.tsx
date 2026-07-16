"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, Mail, UserPlus, X } from "lucide-react";
import { inviteCoOwner, revokeInvite } from "@/lib/actions";
import { emptyActionState } from "@/lib/action-types";
import { Field, SubmitButton } from "./formPrimitives";
import { FormDialog } from "./FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PropertyInvite } from "@/types/database";
import type { PropertyMemberWithEmail } from "@/lib/queries";

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Copy className="size-3.5" />
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

function RevokeInviteButton({
  inviteId,
  propertyId,
}: {
  inviteId: string;
  propertyId: string;
}) {
  const [, action] = useActionState(revokeInvite, emptyActionState);
  return (
    <form action={action}>
      <input type="hidden" name="invite_id" value={inviteId} />
      <input type="hidden" name="property_id" value={propertyId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
      >
        <X className="size-3.5" />
        Revoke
      </Button>
    </form>
  );
}

export function CoOwnersCard({
  propertyId,
  members,
  pendingInvites,
}: {
  propertyId: string;
  members: PropertyMemberWithEmail[];
  pendingInvites: PropertyInvite[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(inviteCoOwner, emptyActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Co-owners</h2>
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Invite a co-owner"
          description="They'll have full, equal access to this property once they accept."
          trigger={
            <Button type="button" variant="outline" size="sm">
              <UserPlus className="size-3.5" />
              Invite
            </Button>
          }
        >
          <form ref={ref} action={action} className="space-y-4">
            <input type="hidden" name="property_id" value={propertyId} />
            <Field label="Email">
              <Input
                name="email"
                type="email"
                required
                placeholder="spouse@example.com"
              />
            </Field>
            {state.error && (
              <p className="text-destructive text-sm">{state.error}</p>
            )}
            {state.inviteUrl && (
              <div className="bg-muted/40 rounded-lg border p-3 text-sm">
                Invite created. There&apos;s no automated invite email yet —
                copy this link and send it to them yourself.
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate text-xs">
                    {state.inviteUrl}
                  </code>
                  <CopyButton url={state.inviteUrl} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
              <SubmitButton label="Create invite" />
            </div>
          </form>
        </FormDialog>
      </div>

      <ul className="mt-3 space-y-1.5">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2 text-sm">
            <Mail className="text-muted-foreground size-3.5" />
            {m.email}
          </li>
        ))}
      </ul>

      {pendingInvites.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-muted-foreground text-xs font-medium">
            Pending invites
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="warn">pending</Badge>
                  {inv.email}
                </span>
                <span className="flex items-center gap-1">
                  <CopyButton
                    url={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/invites/${inv.token}`
                        : ""
                    }
                  />
                  <RevokeInviteButton
                    inviteId={inv.id}
                    propertyId={propertyId}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
