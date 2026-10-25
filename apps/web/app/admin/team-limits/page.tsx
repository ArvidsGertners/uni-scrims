import { MAX_TEAM_LIMIT, listTeamLimitRequests, userDisplayName } from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { TeamLimitForm } from "./team-limit-form";
import { getLocale, getMessages } from "@/lib/locale";
import { adminTeamLimitsMessages } from "@/i18n/admin";

/** Requests for more teams (SPEC N-17), the oldest first; admins and the operator decide. */
export default async function TeamLimitsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/team-limits", "admin");
  const requests = await listTeamLimitRequests(admin.id);
  const locale = await getLocale();
  const t = await getMessages(adminTeamLimitsMessages);

  return (
    <AdminShell overview={overview} current="/team-limits">
      <h1 className="type-h1">{t.title}</h1>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.intro}</p>
      {requests.length === 0 ? <p>{t.empty}</p> : null}
      <div className={`${LIST_COLUMNS} gap-6`}>
        {requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{userDisplayName(request.userName, locale)}</CardTitle>
              <p className="text-[14px] text-muted-foreground">
                {t.status(
                  request.teamCount,
                  request.teamLimit,
                  formatDateTime(request.createdAt, locale),
                )}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-[14px] whitespace-pre-line">{t.quoted(request.reason)}</p>
              <TeamLimitForm
                requestId={request.id}
                suggestedLimit={Math.min(request.teamLimit + 5, MAX_TEAM_LIMIT)}
                minLimit={request.teamLimit + 1}
                maxLimit={MAX_TEAM_LIMIT}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
