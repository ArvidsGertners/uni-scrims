"use client";

import { LANDING_SHOWCASE_MAX } from "@uni-scrims/core/config/limits";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { answerShowcaseQuestionAction } from "@/app/team/actions";
import { XIcon } from "@/components/icons";
import { useMessages } from "@/components/locale-provider";
import { ToggleOption } from "@/components/toggle-option";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWhatsNew } from "@/components/whats-new/whats-new-provider";
import { showcaseQuestionMessages } from "@/i18n/client";
import { isAdminPath } from "@/lib/admin-path";
import { isDialogPath } from "@/lib/route-dialog";

/** The page shows first, then the dialog, like the what's new dialog. */
const OPEN_DELAY_MS = 700;

type Answer = { teamId: string; show: boolean };

/**
 * The one-time question about the landing page (SPEC N-34, §5.36) for captains of teams never asked:
 * one dialog for all of them, "no" preselected. Opens only once the what's new dialog is closed and
 * no route dialog is open (its link may lead into the team settings, where the choice also lives);
 * closing without saving answers "no" for every team. Within a tab only once per account, since the
 * root layout outlives a sign-out and sign-in; a failed save simply asks again with the next load.
 */
export function ShowcaseQuestion({
  teams,
  userId,
}: {
  teams: { id: string; name: string }[];
  userId: string | null;
}) {
  const t = useMessages(showcaseQuestionMessages);
  const pathname = usePathname();
  const admin = isAdminPath(pathname);
  const onDialog = isDialogPath(pathname);
  const whatsNew = useWhatsNew();
  const [open, setOpen] = useState(false);
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const due = teams.length > 0 && !admin && answeredFor !== userId;

  useEffect(() => {
    if (!due || onDialog || whatsNew.pending || whatsNew.showing) return;
    const timer = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, onDialog, whatsNew.pending, whatsNew.showing]);

  const send = (answers: Answer[]) => {
    setOpen(false);
    setAnsweredFor(userId);
    startTransition(async () => {
      await answerShowcaseQuestionAction(answers).catch(() => false);
    });
  };
  const answer = (show: (teamId: string) => boolean) =>
    send(teams.map((team) => ({ teamId: team.id, show: show(team.id) })));
  const choose = (teamId: string, show: boolean) =>
    setShown((current) => {
      const next = new Set(current);
      if (show) next.add(teamId);
      else next.delete(teamId);
      return next;
    });

  if (teams.length === 0) return null;
  return (
    <Dialog open={open && due} onOpenChange={(next) => (next ? undefined : answer(() => false))}>
      <DialogContent>
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-card px-5 py-3.5 sm:px-8">
          <DialogTitle className="min-w-0 flex-1 self-center">{t.title(teams.length)}</DialogTitle>
          <Button
            variant="outline"
            onClick={() => answer(() => false)}
            aria-label={t.close}
            className="-mr-1 shrink-0 max-[400px]:size-11 max-[400px]:px-0"
          >
            <XIcon size={18} strokeWidth={2.2} />
            <span className="max-[400px]:hidden">{t.close}</span>
          </Button>
        </div>
        <div className="flex flex-col gap-6 px-5 pt-6 pb-8 sm:px-8">
          <p className="text-pretty text-muted-foreground">{t.text(LANDING_SHOWCASE_MAX)}</p>
          <ul className="flex flex-col gap-4">
            {teams.map((team) => (
              <li key={team.id} className="flex flex-col gap-2">
                <span className="font-semibold break-words">{team.name}</span>
                <div role="radiogroup" aria-label={team.name} className="grid grid-cols-2 gap-2">
                  <ToggleOption
                    type="radio"
                    name={`showcase-${team.id}`}
                    label={t.yes}
                    checked={shown.has(team.id)}
                    onChange={() => choose(team.id, true)}
                  />
                  <ToggleOption
                    type="radio"
                    name={`showcase-${team.id}`}
                    label={t.no}
                    checked={!shown.has(team.id)}
                    onChange={() => choose(team.id, false)}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => answer((teamId) => shown.has(teamId))}>
              {t.save}
            </Button>
            <p className="text-[13px] text-faint">{t.closeHint}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
