import {
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  formatBerlinDate,
  getMyTeam,
  userDisplayName,
} from "@uni-scrims/core";
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
import { getLocale, getMessages } from "@/lib/locale";
import { teamMembersMessages } from "@/i18n/team";
import type { Locale } from "@uni-scrims/core/config/locale";

function roleOptions(locale: Locale) {
  return MEMBER_ROLES.map((role) => ({ value: role, label: MEMBER_ROLE_LABELS[locale][role] }));
}
const memberActionClass = "min-h-10 px-2.5 text-[14px]";
/** Label of a cell; below 768 px each row is a block, so every value says what it is. */
const cellLabel = "type-label text-muted-foreground md:hidden";
const cellClass = "flex flex-col gap-1 md:table-cell md:px-3 md:py-3 md:align-middle";

const STATUS_CLASS = {
  VERIFIED: "text-success",
  PENDING: "text-warning",
  UNVERIFIED: "text-muted-foreground",
  // Members who need none (getMyTeam: coaches who are not captain, SPEC N-1).
  NOT_NEEDED: "text-faint",
};

export default async function TeamMembersPage() {
  const user = await requirePageUser("/team/members");
  const team = await getMyTeam(user.id);
  const locale = await getLocale();
  const t = await getMessages(teamMembersMessages);
  if (!team) redirect("/team");
  const manage = team.isCaptain && !team.banned;

  return (
    <PageMain width="wide" className="gap-8">
      <TeamHeader team={team} current="/team/members" />

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">{t.heading}</h2>
        <table className="w-full text-[14px] max-md:block">
          <thead className="max-md:hidden">
            <tr className="border-b border-border text-left">
              {[
                t.columns.member,
                t.columns.role,
                t.columns.rank,
                t.columns.joined,
                t.columns.status,
              ].map((heading) => (
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
                  <span className="sr-only">{t.actions}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
            {team.members.map((member) => {
              const status =
                !member.needsVerification && member.status !== "VERIFIED"
                  ? "NOT_NEEDED"
                  : member.status;
              // The placeholder of a new or deleted account in the page's language.
              const name = userDisplayName(member.name, locale);
              return (
                <tr
                  key={member.id}
                  className="grid grid-cols-6 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0"
                >
                  <td className="col-span-6 md:px-3 md:py-3 md:align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        user={{ ...member, name }}
                        className="size-10 text-[12px] text-muted-foreground"
                      />
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-label font-semibold break-all">{name}</span>
                        {member.isCaptain ? (
                          <Badge variant="accent" className="h-[22px] px-2 text-[12px]">
                            {t.captain}
                          </Badge>
                        ) : null}
                        {member.id === user.id ? (
                          <span className="text-[13px] text-faint">{t.you}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {/* Two values per row; the captain's select needs a whole row, and so does the
                      status then, which is too long for a third of a phone's width. */}
                  <td className={cn(cellClass, manage ? "col-span-6" : "col-span-3")}>
                    <span className={cellLabel}>{t.columns.role}</span>
                    {manage ? (
                      <MemberRoleSelect
                        key={`${member.id}-${member.role}`}
                        action={setMemberRoleAction}
                        teamId={team.id}
                        memberId={member.id}
                        memberName={name}
                        role={member.role}
                        options={roleOptions(locale)}
                      />
                    ) : (
                      <span>{MEMBER_ROLE_LABELS[locale][member.role]}</span>
                    )}
                  </td>
                  {/* Only the own team sees each member's rank (SPEC N-16). */}
                  <td className={cn(cellClass, "col-span-3")}>
                    <span className={cellLabel}>{t.columns.rank}</span>
                    <RankLabel rank={member.rank} />
                  </td>
                  <td className={cn(cellClass, "col-span-3")}>
                    <span className={cellLabel}>{t.columns.joined}</span>
                    <span className="tabular-nums">
                      {formatBerlinDate(member.joinedAt, locale)}
                    </span>
                  </td>
                  <td className={cn(cellClass, manage ? "col-span-6" : "col-span-3")}>
                    <span className={cellLabel}>{t.columns.status}</span>
                    <StatusDot className={STATUS_CLASS[status]}>{t.status[status]}</StatusDot>
                  </td>
                  {manage ? (
                    <td className="col-span-6 md:px-3 md:py-3 md:text-right md:align-middle">
                      {member.isCaptain ? null : (
                        <div className="-ml-2.5 flex flex-wrap gap-1 md:ml-0 md:justify-end">
                          <ActionForm
                            action={transferCaptainAction}
                            submitLabel={t.makeCaptain}
                            variant="ghost"
                            size="bare"
                            submitClassName={memberActionClass}
                            confirmText={t.makeCaptainConfirm(name)}
                          >
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={member.id} />
                          </ActionForm>
                          <ActionForm
                            action={removeMemberAction}
                            submitLabel={t.remove}
                            variant="ghost"
                            size="bare"
                            submitClassName={`${memberActionClass} not-disabled:hover:bg-destructive-soft not-disabled:hover:text-destructive-text`}
                            confirmText={t.removeConfirm(name)}
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
