"use client";

import { ActionForm } from "@/components/action-form";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useMessages } from "@/components/locale-provider";
import { deleteAccountDialogMessages } from "@/i18n/account-client";
import { deleteAccountAction } from "./actions";

/** "Konto löschen" with a confirmation dialog that lists what happens (SPEC P0-10). */
export function DeleteAccountDialog({ consequences }: { consequences: string[] }) {
  const t = useMessages(deleteAccountDialogMessages);
  return (
    <AlertDialog>
      <AlertDialogTrigger className={buttonVariants({ variant: "destructive", size: "sm" })}>
        {t.trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t.title}</AlertDialogTitle>
        <AlertDialogDescription>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-pretty">
            {consequences.map((consequence) => (
              <li key={consequence}>{consequence}</li>
            ))}
          </ul>
          <p className="text-foreground">{t.irreversible}</p>
        </AlertDialogDescription>
        <ActionForm
          action={deleteAccountAction}
          submitLabel={t.submit}
          variant="destructive"
          size="sm"
          submitClassName="w-full"
          footer={
            <AlertDialogClose
              className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
            >
              {t.cancel}
            </AlertDialogClose>
          }
        >
          <input type="hidden" name="confirm" value="on" />
        </ActionForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
