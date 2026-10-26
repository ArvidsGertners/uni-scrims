import { describeStartShort, listMessageReports, userDisplayName } from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { LIST_COLUMNS } from "@/components/list-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminHref } from "@/lib/admin-url";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { dismissMessageReportsAction, removeReportedMessageAction } from "../actions";
import { getLocale, getMessages } from "@/lib/locale";
import { adminReportsMessages } from "@/i18n/admin";

/**
 * Reported messages between teams (SPEC N-28), the oldest report first; admins and the operator
 * remove the message or dismiss the report. Only the reported message, never the thread.
 */
export default async function ReportsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/reports", "admin");
  const reports = await listMessageReports(admin.id);
  const locale = await getLocale();
  const t = await getMessages(adminReportsMessages);

  return (
    <AdminShell overview={overview} current="/reports">
      <h1 className="type-h1">{t.title}</h1>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.intro}</p>
      {reports.length === 0 ? <p>{t.empty}</p> : null}
      <div className={`${LIST_COLUMNS} gap-6`}>
        {reports.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <CardTitle className="break-words">
                {t.from(userDisplayName(report.author.name, locale), report.team.name)}
              </CardTitle>
              <p className="text-[14px] break-words text-muted-foreground">
                {t.to(report.otherTeam.name, describeStartShort(report.startsAt, locale))}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-[15px] break-words whitespace-pre-line">{t.quoted(report.body)}</p>
              <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                <span>{t.written(formatDateTime(report.createdAt, locale, { suffix: true }))}</span>
                {report.reports.map((entry) => (
                  <span key={entry.id}>
                    {t.reportedBy(
                      entry.team.name,
                      formatDateTime(entry.createdAt, locale, { suffix: true }),
                    )}
                  </span>
                ))}
                <span className="font-label break-all">
                  {t.ids(report.author.id, report.author.discordId ?? t.noDiscord)}
                </span>
                {report.author.discordId ? (
                  <Link
                    href={`${adminHref("/bans")}?q=${encodeURIComponent(report.author.discordId)}`}
                    className="self-start font-semibold text-accent-text underline-offset-2 hover:underline"
                  >
                    {t.findUser}
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2.5">
                <ActionForm
                  action={removeReportedMessageAction}
                  submitLabel={t.remove}
                  variant="destructive"
                  size="sm"
                  confirmText={t.confirmRemove}
                >
                  <input type="hidden" name="messageId" value={report.id} />
                </ActionForm>
                <ActionForm
                  action={dismissMessageReportsAction}
                  submitLabel={t.dismiss}
                  variant="outline"
                  size="sm"
                  confirmText={t.confirmDismiss}
                >
                  <input type="hidden" name="messageId" value={report.id} />
                </ActionForm>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
