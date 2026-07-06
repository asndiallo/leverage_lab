// Shared shape returned by every Server Action (used with useFormState).
export type ActionState = {
  ok?: boolean;
  error?: string;
  inviteUrl?: string; // set by inviteCoOwner — the link to send the invitee
};

export const emptyActionState: ActionState = {};
