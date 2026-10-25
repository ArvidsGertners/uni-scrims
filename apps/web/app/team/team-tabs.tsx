import type { TeamLogoInfo } from "@uni-scrims/core";
import { TabNav } from "@/components/tab-nav";
import { TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { teamHeaderMessages } from "@/i18n/team";
import { getMessages } from "@/lib/locale";

/**
 * Head of both team tabs (SPEC N-15): logo and name, the tabs and the note on a banned team. The
 * same on both pages, so nothing jumps when switching tabs.
 */
export async function TeamHeader({
  team,
  current,
}: {
  team: {
    id: string;
    name: string;
    tag: string;
    logo: TeamLogoInfo | null;
    banned: boolean;
    isCaptain: boolean;
    members: unknown[];
  };
  current: "/team" | "/team/members";
}) {
  const t = await getMessages(teamHeaderMessages);
  const soleMember = team.members.length === 1;
  return (
    <>
      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own />
        <h1 className="min-w-0 type-h1 break-words">{team.name}</h1>
      </div>
      <TabNav
        label={t.tabsLabel}
        items={[
          { href: "/team", label: t.teamTab, active: current === "/team" },
          {
            href: "/team/members",
            label: t.membersTab,
            active: current === "/team/members",
            trailing: (
              <span className="font-label text-[11px] text-faint">{team.members.length}</span>
            ),
          },
        ]}
      />
      {team.banned ? (
        <Alert>
          <span>{team.isCaptain && !soleMember ? t.bannedCaptain : t.banned}</span>
        </Alert>
      ) : null}
    </>
  );
}
