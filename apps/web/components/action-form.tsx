"use client";

import { type ReactNode, useActionState } from "react";
import { cn } from "cn";
import { useSubmitConfirmation } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { submitKeepingValues } from "@/lib/submit-form";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: ReactNode;
  /** Asks before submitting, for destructive actions, in the site's dialog. */
  confirmText?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "link";
  size?: "sm" | "default" | "lg" | "bare";
  className?: string;
  /** Classes of the submit button, e.g. "w-full" for block buttons. */
  submitClassName?: string;
  /** Below the submit button and its error, e.g. a cancel link. */
  footer?: ReactNode;
};

/** Form for a server action with an error line under the button. */
export function ActionForm({
  action,
  submitLabel,
  children,
  confirmText,
  variant,
  size,
  className,
  submitClassName,
  footer,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { confirm, dialog } = useSubmitConfirmation();
  return (
    <>
      <form
        action={formAction}
        className={className ?? "flex flex-col gap-3"}
        onSubmit={(event) => {
          if (
            confirmText &&
            !confirm(event, confirmText, {
              label: submitLabel,
              destructive: variant === "destructive",
            })
          ) {
            return;
          }
          submitKeepingValues(event, formAction);
        }}
      >
        {children}
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            variant={variant}
            size={size}
            disabled={pending}
            className={cn("self-start", submitClassName)}
          >
            {submitLabel}
          </Button>
          {state.error ? (
            <p role="alert" className="text-[14px] text-destructive-text">
              {state.error}
            </p>
          ) : null}
          {footer}
        </div>
      </form>
      {dialog}
    </>
  );
}
