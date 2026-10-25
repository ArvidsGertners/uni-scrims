import { MAX_TEAM_MEMBERS, READY_MEMBER_COUNT, getNavTeam } from "@uni-scrims/core";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { requirePageUser } from "@/lib/session";
import { NewTeamForms } from "../new-team-forms";
import { getText } from "@/lib/locale";

/** Another team next to the own ones (SPEC N-17), up to the team limit. */
export default async function NewTeamPage() {
  const user = await requirePageUser("/team/new");
  const { teamCount, teamLimit, limitProblem } = await getNavTeam(user.id);
  const text = await getText();
  return (
    <PageMain width="wide" className="gap-7">
      {teamCount > 0 ? <BackLink href="/team">Zurück zum Team</BackLink> : null}
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Neues Team</h1>
        <p className="max-w-3xl text-pretty text-muted-foreground">
          Gründe ein Team oder tritt über einen Einladungslink bei. Ein Team braucht mindestens{" "}
          {READY_MEMBER_COUNT} verifizierte Spieler und hat höchstens {MAX_TEAM_MEMBERS} Mitglieder.
          Du bist in {teamCount} von {teamLimit} Teams.
        </p>
      </div>
      {limitProblem ? (
        <Alert>
          <span>
            {text(limitProblem)}{" "}
            <Link href="/support#mehr-teams" className="font-semibold underline underline-offset-2">
              Mehr Teams beantragen
            </Link>
          </span>
        </Alert>
      ) : (
        <NewTeamForms />
      )}
    </PageMain>
  );
}
