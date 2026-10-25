import { MAX_TEAM_LIMIT, listTeamLimitRequests } from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { TeamLimitForm } from "./team-limit-form";

/** Requests for more teams (SPEC N-17), the oldest first; admins and the operator decide. */
export default async function TeamLimitsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/team-limits", "admin");
  const requests = await listTeamLimitRequests(admin.id);

  return (
    <AdminShell overview={overview} current="/team-limits">
      <h1 className="type-h1">Anträge</h1>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">
        Wer in mehr als den erlaubten Teams sein möchte, beantragt das auf der Support-Seite. Ein
        angenommener Antrag setzt das Team-Limit dieser Person; eine Nachricht gibt es nicht, die
        Person sieht den Stand auf der Support-Seite.
      </p>
      {requests.length === 0 ? <p>Keine offenen Anträge.</p> : null}
      <div className={`${LIST_COLUMNS} gap-6`}>
        {requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{request.userName}</CardTitle>
              <p className="text-[14px] text-muted-foreground">
                In {request.teamCount} von {request.teamLimit} Teams · beantragt am{" "}
                {formatDateTime(request.createdAt)} Uhr
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-[14px] whitespace-pre-line">„{request.reason}“</p>
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
