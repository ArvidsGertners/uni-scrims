import { getMyTeam, getTeamByInviteCode } from "@uni-scrims/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TeamCard } from "@/components/team-card";
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
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-bold">Einladung</h1>
        <p>Dieser Einladungslink ist ungültig. Frag deinen Captain nach einem neuen Link.</p>
      </main>
    );
  }

  const myTeam = await getMyTeam(user.id);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Einladung</h1>
      <TeamCard
        name={team.name}
        tag={team.tag}
        rank={team.rank}
        universities={team.universities}
        memberCount={team.memberCount}
      />
      {myTeam?.id === team.id ? (
        <p>
          Du bist schon in diesem Team.{" "}
          <Link href="/team" className="underline">
            Zum Team
          </Link>
        </p>
      ) : myTeam ? (
        <p>Du bist schon im Team {myTeam.name}. Verlasse es zuerst, um diesem Team beizutreten.</p>
      ) : team.full ? (
        <p>Das Team ist voll.</p>
      ) : (
        <ActionForm action={joinTeamAction} submitLabel="Team beitreten">
          <input type="hidden" name="code" value={code} />
        </ActionForm>
      )}
    </main>
  );
}
