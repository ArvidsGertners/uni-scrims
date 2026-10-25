"use client";

import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { useMessages } from "@/components/locale-provider";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { confirmDialogMessages } from "@/i18n/client";

type Question = {
  text: string;
  label: string;
  destructive: boolean;
  form: HTMLFormElement;
  submitter: HTMLElement | null;
};

/**
 * Asks before a form submits, in the site's own dialog instead of window.confirm (§7). Call
 * `confirm` first in onSubmit and go on only when it returns true; render `dialog` next to the
 * form. Without JavaScript the form submits without asking, as before.
 */
export function useSubmitConfirmation(): {
  confirm: (
    event: FormEvent<HTMLFormElement>,
    text: string,
    options?: { label?: string; destructive?: boolean },
  ) => boolean;
  dialog: ReactNode;
} {
  const t = useMessages(confirmDialogMessages);
  // Kept after closing, so the dialog keeps its text while it closes.
  const [question, setQuestion] = useState<Question | null>(null);
  const [open, setOpen] = useState(false);
  // The open question until it is answered: a second click on the button sends nothing.
  const asked = useRef<Question | null>(null);
  // Lets the submit after the confirmation through.
  const confirmed = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function confirm(
    event: FormEvent<HTMLFormElement>,
    text: string,
    options: { label?: string; destructive?: boolean } = {},
  ): boolean {
    if (confirmed.current) {
      confirmed.current = false;
      return true;
    }
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    asked.current = {
      text,
      label: options.label ?? submitter?.textContent ?? "",
      destructive: options.destructive ?? false,
      form: event.currentTarget,
      submitter,
    };
    setQuestion(asked.current);
    setOpen(true);
    return false;
  }

  function submit() {
    const answered = asked.current;
    if (!answered) return;
    asked.current = null;
    setOpen(false);
    confirmed.current = true;
    try {
      // The same submitter, so a button's name and value (e.g. the decision) are sent too. The
      // submit event runs synchronously in here and lets itself through.
      answered.form.requestSubmit(answered.submitter);
    } finally {
      // Also when nothing was submitted (invalid form, removed form), so the next submit asks.
      confirmed.current = false;
    }
  }

  function changeOpen(next: boolean) {
    if (!next) asked.current = null;
    setOpen(next);
  }

  const dialog = (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent
        initialFocus={cancelRef}
        finalFocus={() => (question?.submitter?.isConnected ? question.submitter : true)}
      >
        <AlertDialogTitle className="text-pretty">{question?.text}</AlertDialogTitle>
        <div className="flex flex-col gap-2">
          <Button
            variant={question?.destructive ? "destructive" : "default"}
            size="sm"
            className="w-full"
            onClick={submit}
          >
            {question?.label}
          </Button>
          <AlertDialogClose
            ref={cancelRef}
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
          >
            {t.cancel}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
