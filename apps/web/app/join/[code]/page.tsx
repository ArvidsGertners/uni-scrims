import { RANK_LABELS, getMyTeam, getTeamByInviteCode } from "@uni-scrims/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { formatUniversities } from "@/lib/scrim-format";
import { getSessionUserId, loginUrl, requirePageUser } from "@/lib/session";
import { joinTeamAction } from "../../team/actions";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const path = `/join/${encodeURIComponent(code)}`;
  // Visitors without a session go to the login and come back here (ARCHITECTURE §7).
  if (!(await getSessionUserId())) redirect(loginUrl(path));
  const user = await requirePageUser(path);

  const team = await getTeamByInviteCode(user.id, code);
  if (!team) {
    return (
      <PageMain className="gap-7">
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-muted-foreground">Einladung</span>
          <h1 className="type-h1">Dieser Link ist ungültig</h1>
          <p className="text-pretty text-muted-foreground">
            Frag deinen Captain nach einem neuen Einladungslink.
          </p>
        </div>
      </PageMain>
    );
  }

  const myTeam = await getMyTeam(user.id);
  const linkClass = "font-semibold underline underline-offset-2";
  return (
    <PageMain className="gap-7">
      <span className="type-label text-muted-foreground">Einladung</span>
      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="type-h1">{team.name}</h1>
          <span className="text-[14px] text-muted-foreground">
            {formatUniversities(team.universities)} · Teamrang {RANK_LABELS[team.rank]} ·{" "}
            {team.memberCount} Mitglieder
          </span>
        </div>
      </div>
      {myTeam?.id === team.id ? (
        <Alert variant="success">
          <span>
            Du bist schon in diesem Team.{" "}
            <Link href="/team" className={linkClass}>
              Zum Team
            </Link>
          </span>
        </Alert>
      ) : myTeam ? (
        <Alert>
          <span>
            Du bist schon im Team {myTeam.name}. Verlasse es zuerst, um diesem Team beizutreten.
          </span>
        </Alert>
      ) : team.full ? (
        <Alert>
          <span>Das Team ist voll.</span>
        </Alert>
      ) : (
        <ActionForm
          action={joinTeamAction}
          submitLabel="Team beitreten"
          size="lg"
          submitClassName="w-full"
        >
          <input type="hidden" name="code" value={code} />
        </ActionForm>
      )}
    </PageMain>
  );
}
