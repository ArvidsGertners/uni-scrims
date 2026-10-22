import { FEEDBACK_OUTCOME_LABELS, describeStart, listDisputes } from "@uni-scrims/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFormat } from "@/lib/scrim-format";
import { requireAdminPage } from "@/lib/session";
import { AdminNav } from "../admin-nav";
import { DisputeForm } from "./dispute-form";

type Side = Awaited<ReturnType<typeof listDisputes>>[number]["host"];

function Answer({ side }: { side: Side }) {
  return (
    <li>
      <span className="font-medium">{side.name}</span>{" "}
      <span className="opacity-60">[{side.tag}]</span> · Captain (Discord): {side.captainName}
      <br />
      {side.feedback
        ? `${FEEDBACK_OUTCOME_LABELS[side.feedback.outcome]}${side.feedback.rating ? ` · ${"★".repeat(side.feedback.rating)}` : ""}`
        : "Keine Antwort"}
    </li>
  );
}

export default async function DisputesPage() {
  const admin = await requireAdminPage("/admin/disputes");
  const disputes = await listDisputes(admin.id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <AdminNav adminId={admin.id} />
      <h1 className="text-2xl font-bold">Streitfälle</h1>
      {disputes.length === 0 ? <p>Keine offenen Streitfälle.</p> : null}
      {disputes.map((dispute) => (
        <Card key={dispute.id}>
          <CardHeader>
            <CardTitle>
              {dispute.host.name} gegen {dispute.guest.name}
            </CardTitle>
            <p className="text-sm opacity-70">
              {describeStart(dispute.startsAt)} · {formatFormat(dispute.format)}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              <Answer side={dispute.host} />
              <Answer side={dispute.guest} />
            </ul>
            <DisputeForm scrimId={dispute.id} host={dispute.host} guest={dispute.guest} />
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
