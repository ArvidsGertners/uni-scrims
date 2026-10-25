import { MEMBER_ROLES, MEMBER_ROLE_LABELS, formatBerlinDate, getMyTeam } from "@uni-scrims/core";
import { cn } from "cn";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { StatusDot } from "@/components/detail-rows";
import { PageMain } from "@/components/page-main";
import { RankLabel } from "@/components/rank-icon";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/lib/session";
import { removeMemberAction, setMemberRoleAction, transferCaptainAction } from "../actions";
import { MemberRoleSelect } from "../member-role-select";
import { TeamHeader } from "../team-tabs";
import { RolesTable } from "./roles-table";

const ROLE_OPTIONS = MEMBER_ROLES.map((role) => ({
  value: role,
  label: MEMBER_ROLE_LABELS[role],
}));
const memberActionClass = "min-h-10 px-2.5 text-[14px]";
/** Label of a cell; below 768 px each row is a block, so every value says what it is. */
const cellLabel = "type-label text-muted-foreground md:hidden";
const cellClass = "flex flex-col gap-1 md:table-cell md:px-3 md:py-3 md:align-middle";

const STATUS = {
  VERIFIED: { label: "Verifiziert", className: "text-success" },
  PENDING: { label: "In Prüfung", className: "text-warning" },
  UNVERIFIED: { label: "Nicht verifiziert", className: "text-muted-foreground" },
  // Members who need none (getMyTeam: coaches who are not captain, SPEC N-1).
  NOT_NEEDED: { label: "Nicht nötig", className: "text-faint" },
};

export default async function TeamMembersPage() {
  const user = await requirePageUser("/team/members");
  const team = await getMyTeam(user.id);
  if (!team) redirect("/team");
  const manage = team.isCaptain && !team.banned;

  return (
    <PageMain width="wide" className="gap-8">
      <TeamHeader team={team} current="/team/members" />

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Mitglieder</h2>
        <table className="w-full text-[14px] max-md:block">
          <thead className="max-md:hidden">
            <tr className="border-b border-border text-left">
              {["Mitglied", "Rolle", "Rang", "Beigetreten", "Status"].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2.5 type-label text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
              {manage ? (
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">Aktionen</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
            {team.members.map((member) => {
              const status =
                !member.needsVerification && member.status !== "VERIFIED"
                  ? STATUS.NOT_NEEDED
                  : STATUS[member.status];
              return (
                <tr
                  key={member.id}
                  className="grid grid-cols-6 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0"
                >
                  <td className="col-span-6 md:px-3 md:py-3 md:align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        user={member}
                        className="size-10 text-[12px] text-muted-foreground"
                      />
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-label font-semibold break-all">{member.name}</span>
                        {member.isCaptain ? (
                          <Badge variant="accent" className="h-[22px] px-2 text-[12px]">
                            Captain
                          </Badge>
                        ) : null}
                        {member.id === user.id ? (
                          <span className="text-[13px] text-faint">Du</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {/* Two values per row; the captain's select needs a whole row, and so does the
                      status then, which is too long for a third of a phone's width. */}
                  <td className={cn(cellClass, manage ? "col-span-6" : "col-span-3")}>
                    <span className={cellLabel}>Rolle</span>
                    {manage ? (
                      <MemberRoleSelect
                        key={`${member.id}-${member.role}`}
                        action={setMemberRoleAction}
                        teamId={team.id}
                        memberId={member.id}
                        memberName={member.name}
                        role={member.role}
                        options={ROLE_OPTIONS}
                      />
                    ) : (
                      <span>{MEMBER_ROLE_LABELS[member.role]}</span>
                    )}
                  </td>
                  {/* Only the own team sees each member's rank (SPEC N-16). */}
                  <td className={cn(cellClass, "col-span-3")}>
                    <span className={cellLabel}>Rang</span>
                    <RankLabel rank={member.rank} />
                  </td>
                  <td className={cn(cellClass, "col-span-3")}>
                    <span className={cellLabel}>Beigetreten</span>
                    <span className="tabular-nums">{formatBerlinDate(member.joinedAt)}</span>
                  </td>
                  <td className={cn(cellClass, manage ? "col-span-6" : "col-span-3")}>
                    <span className={cellLabel}>Status</span>
                    <StatusDot className={status.className}>{status.label}</StatusDot>
                  </td>
                  {manage ? (
                    <td className="col-span-6 md:px-3 md:py-3 md:text-right md:align-middle">
                      {member.isCaptain ? null : (
                        <div className="-ml-2.5 flex flex-wrap gap-1 md:ml-0 md:justify-end">
                          <ActionForm
                            action={transferCaptainAction}
                            submitLabel="Zum Captain"
                            variant="ghost"
                            size="bare"
                            submitClassName={memberActionClass}
                            confirmText={`${member.name} zum Captain machen? Du bist danach normales Mitglied.`}
                          >
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={member.id} />
                          </ActionForm>
                          <ActionForm
                            action={removeMemberAction}
                            submitLabel="Entfernen"
                            variant="ghost"
                            size="bare"
                            submitClassName={`${memberActionClass} not-disabled:hover:bg-destructive-soft not-disabled:hover:text-destructive-text`}
                            confirmText={`${member.name} aus dem Team entfernen?`}
                          >
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={member.id} />
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <RolesTable />
    </PageMain>
  );
}
