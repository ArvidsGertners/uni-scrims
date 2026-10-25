import {
  FEEDBACK_OUTCOME_LABELS,
  describeStart,
  listDisputes,
  userDisplayName,
} from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFormat } from "@/lib/scrim-format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { DisputeForm } from "./dispute-form";
import { getLocale, getMessages } from "@/lib/locale";
import type { Locale } from "@uni-scrims/core/config/locale";
import { adminDisputesMessages } from "@/i18n/admin";

type Side = Awaited<ReturnType<typeof listDisputes>>[number]["host"];

async function Answer({ side, locale }: { side: Side; locale: Locale }) {
  const t = await getMessages(adminDisputesMessages);
  return (
    <li>
      <span className="font-medium">{side.name}</span>{" "}
      <span className="text-muted-foreground">[{side.tag}]</span> ·{" "}
      {t.captain(userDisplayName(side.captainName, locale))}
      <br />
      {side.feedback
        ? `${FEEDBACK_OUTCOME_LABELS[locale][side.feedback.outcome]}${side.feedback.rating ? ` · ${"★".repeat(side.feedback.rating)}` : ""}`
        : t.noAnswer}
    </li>
  );
}

export default async function DisputesPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/disputes", "admin");
  const disputes = await listDisputes(admin.id);
  const locale = await getLocale();
  const t = await getMessages(adminDisputesMessages);

  return (
    <AdminShell overview={overview} current="/disputes">
      <h1 className="type-h1">{t.title}</h1>
      {disputes.length === 0 ? <p>{t.empty}</p> : null}
      <div className={`${LIST_COLUMNS} gap-6`}>
        {disputes.map((dispute) => (
          <Card key={dispute.id}>
            <CardHeader>
              <CardTitle>{t.versus(dispute.host.name, dispute.guest.name)}</CardTitle>
              <p className="text-[14px] text-muted-foreground">
                {describeStart(dispute.startsAt, locale)} · {formatFormat(dispute.format, locale)}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-[14px]">
                <Answer locale={locale} side={dispute.host} />
                <Answer locale={locale} side={dispute.guest} />
              </ul>
              <DisputeForm scrimId={dispute.id} host={dispute.host} guest={dispute.guest} />
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
