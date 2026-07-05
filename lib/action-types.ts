// Shared shape returned by every Server Action (used with useFormState).
export type ActionState = {
  ok?: boolean;
  error?: string;
};

export const emptyActionState: ActionState = {};
