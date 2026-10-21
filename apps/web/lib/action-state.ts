// Shared by server actions and client forms; must not import server code.
export type ActionState = { error: string | null; done?: boolean };

export const initialActionState: ActionState = { error: null };
