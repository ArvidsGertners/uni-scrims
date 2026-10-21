"use client";

import { type ReactNode, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { type ActionState, initialActionState } from "@/lib/action-state";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: ReactNode;
  /** Asks before submitting, for destructive actions. */
  confirmText?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  className?: string;
};

/** Form for a server action with an error line under the button. */
export function ActionForm({
  action,
  submitLabel,
  children,
  confirmText,
  variant,
  className,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      className={className ?? "flex flex-col gap-3"}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-col gap-1">
        <Button type="submit" variant={variant} disabled={pending} className="self-start">
          {submitLabel}
        </Button>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </form>
  );
}
