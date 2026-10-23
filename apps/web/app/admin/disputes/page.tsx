import { FEEDBACK_OUTCOME_LABELS, describeStart, listDisputes } from "@uni-scrims/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFormat } from "@/lib/scrim-format";
import { requireStaffPage } from "@/lib/session";
import { AdminNav } from "../admin-nav";
import { DisputeForm } from "./dispute-form";
import { PageMain } from "@/components/page-main";

type Side = Awaited<ReturnType<typeof listDisputes>>[number]["host"];

function Answer({ side }: { side: Side }) {
  return (
    <li>
      <span className="font-medium">{side.name}</span>{" "}
      <span className="text-muted-foreground">[{side.tag}]</span> · Captain (Discord):{" "}
      {side.captainName}
      <br />
      {side.feedback
        ? `${FEEDBACK_OUTCOME_LABELS[side.feedback.outcome]}${side.feedback.rating ? ` · ${"★".repeat(side.feedback.rating)}` : ""}`
        : "Keine Antwort"}
    </li>
  );
}

export default async function DisputesPage() {
  const admin = await requireStaffPage("/admin/disputes", "admin");
  const disputes = await listDisputes(admin.id);

  return (
    <PageMain className="gap-6">
      <AdminNav staff={admin} />
      <h1 className="type-h1">Streitfälle</h1>
      {disputes.length === 0 ? <p>Keine offenen Streitfälle.</p> : null}
      {disputes.map((dispute) => (
        <Card key={dispute.id}>
          <CardHeader>
            <CardTitle>
              {dispute.host.name} gegen {dispute.guest.name}
            </CardTitle>
            <p className="text-[14px] text-muted-foreground">
              {describeStart(dispute.startsAt)} · {formatFormat(dispute.format)}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-[14px]">
              <Answer side={dispute.host} />
              <Answer side={dispute.guest} />
            </ul>
            <DisputeForm scrimId={dispute.id} host={dispute.host} guest={dispute.guest} />
          </CardContent>
        </Card>
      ))}
    </PageMain>
  );
}
