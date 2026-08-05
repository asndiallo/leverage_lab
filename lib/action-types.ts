import type { ParsedLease } from "./lease-parser";

// Shared shape returned by every Server Action (used with useActionState).
export type ActionState = {
  ok?: boolean;
  error?: string;
  inviteUrl?: string; // set by inviteCoOwner — the link to send the invitee
  parsedLease?: ParsedLease; // set by parseLeaseFile — fields extracted from an uploaded lease PDF
};

export const emptyActionState: ActionState = {};
