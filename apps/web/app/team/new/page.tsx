import { FULLY_VERIFIED_PLAYER_COUNT, MAX_TEAM_MEMBERS, getNavTeam } from "@uni-scrims/core";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { requirePageUser } from "@/lib/session";
import { NewTeamForms } from "../new-team-forms";
import { getMessages, getText } from "@/lib/locale";
import { newTeamPageMessages } from "@/i18n/team";

/** Another team next to the own ones (SPEC N-17), up to the team limit. */
export default async function NewTeamPage() {
  const user = await requirePageUser("/team/new");
  const { teamCount, teamLimit, limitProblem } = await getNavTeam(user.id);
  const text = await getText();
  const t = await getMessages(newTeamPageMessages);
  return (
    <PageMain width="wide" className="gap-7">
      {teamCount > 0 ? <BackLink href="/team">{t.backToTeam}</BackLink> : null}
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.heading}</h1>
        <p className="max-w-3xl text-pretty text-muted-foreground">
          {t.intro(FULLY_VERIFIED_PLAYER_COUNT, MAX_TEAM_MEMBERS, teamCount, teamLimit)}
        </p>
      </div>
      {limitProblem ? (
        <Alert>
          <span>
            {text(limitProblem)}{" "}
            <Link href="/support#mehr-teams" className="font-semibold underline underline-offset-2">
              {t.requestMoreTeams}
            </Link>
          </span>
        </Alert>
      ) : (
        <NewTeamForms />
      )}
    </PageMain>
  );
}
