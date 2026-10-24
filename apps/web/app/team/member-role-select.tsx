"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { submitKeepingValues } from "@/lib/submit-form";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  teamId: string;
  memberId: string;
  memberName: string;
  role: string;
  options: readonly { value: string; label: string }[];
};

const noSubscription = () => () => {};

/**
 * The captain's choice of a member's role (SPEC N-1). "Speichern" appears once the choice differs
 * from the saved role, so moving through the options with the keyboard saves nothing on the way;
 * before hydration it is always there, so the form also works without JavaScript. The page keys
 * this by the saved role, so it starts over after a change.
 */
export function MemberRoleSelect({ action, teamId, memberId, memberName, role, options }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [selected, setSelected] = useState(role);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  return (
    <form
      action={formAction}
      onSubmit={(event) => submitKeepingValues(event, formAction)}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />
      <div className="flex items-center gap-1">
        <Select
          name="role"
          value={selected}
          onValueChange={(value) => setSelected(value ?? role)}
          aria-label={`Rolle von ${memberName}`}
          className="min-h-10 w-auto py-1.5"
          options={options}
        />
        {!hydrated || selected !== role ? (
          <Button
            type="submit"
            variant="ghost"
            size="bare"
            disabled={pending}
            className="min-h-10 px-2.5 text-[14px] text-foreground"
          >
            Speichern
          </Button>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] text-accent-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
