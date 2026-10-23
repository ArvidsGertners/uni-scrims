"use client";

import { useActionState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { type ActionState, initialActionState } from "@/lib/action-state";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  teamId: string;
  memberId: string;
  memberName: string;
  role: string;
  options: readonly { value: string; label: string }[];
};

/**
 * The captain's choice of a member's role (SPEC N-1), saved on change. The page keys it by the
 * saved role, so it starts over after a change; after an error React's form reset shows the saved
 * role again.
 */
export function MemberRoleSelect({ action, teamId, memberId, memberName, role, options }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />
      <NativeSelect
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label={`Rolle von ${memberName}`}
        className="min-h-10 w-auto py-1.5 text-[14px]"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {state.error ? (
        <p role="alert" className="text-[13px] text-accent-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
