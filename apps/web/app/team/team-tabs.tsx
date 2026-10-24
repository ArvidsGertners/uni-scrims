import type { TeamLogoInfo } from "@uni-scrims/core";
import { TabNav } from "@/components/tab-nav";
import { TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";

/**
 * Head of both team tabs (SPEC N-15): logo and name, the tabs and the note on a banned team. The
 * same on both pages, so nothing jumps when switching tabs.
 */
export function TeamHeader({
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
  const soleMember = team.members.length === 1;
  return (
    <>
      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own />
        <h1 className="min-w-0 type-h1 break-words">{team.name}</h1>
      </div>
      <TabNav
        label="Team"
        items={[
          { href: "/team", label: "Team", active: current === "/team" },
          {
            href: "/team/members",
            label: "Mitglieder",
            active: current === "/team/members",
            trailing: (
              <span className="font-label text-[11px] text-faint">{team.members.length}</span>
            ),
          },
        ]}
      />
      {team.banned ? (
        <Alert>
          <span>
            {team.isCaptain && !soleMember
              ? "Dieses Team ist gesperrt. Die anderen Mitglieder können es verlassen und ein neues gründen oder einem anderen beitreten. Danach kannst du es als letztes Mitglied auflösen."
              : "Dieses Team ist gesperrt. Du kannst es verlassen und ein neues gründen oder einem anderen beitreten."}
          </span>
        </Alert>
      ) : null}
    </>
  );
}
