import type { ParsedLease } from "./lease-parser";
import type { ReviewTransactionRow } from "./csv-transaction-parser";

// Shared shape returned by every Server Action (used with useActionState).
export type ActionState = {
  ok?: boolean;
  error?: string;
  inviteUrl?: string; // set by inviteCoOwner — the link to send the invitee
  parsedLease?: ParsedLease; // set by parseLeaseFile — fields extracted from an uploaded lease PDF
  parsedTransactions?: {
    rows: ReviewTransactionRow[];
    warnings: string[];
  }; // set by parseTransactionsFile — rows extracted from an uploaded bank CSV
};

export const emptyActionState: ActionState = {};
