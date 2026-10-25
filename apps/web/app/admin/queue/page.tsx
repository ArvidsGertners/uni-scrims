import {
  listPendingVerifications,
  listUniversities,
  resolveUploadDir,
  userDisplayName,
} from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { DecisionForm } from "../decision-form";
import { getLocale, getMessages } from "@/lib/locale";
import { adminQueueMessages } from "@/i18n/admin";

export default async function AdminPage() {
  // Layout and page render in parallel, so the page checks too.
  const { staff: admin, overview } = await requireAdminShellPage("/queue", "queue");
  const queue = await listPendingVerifications(admin.id, resolveUploadDir());
  const locale = await getLocale();
  const t = await getMessages(adminQueueMessages);
  const universities = queue.some((request) => !request.university) ? await listUniversities() : [];

  return (
    <AdminShell overview={overview} current="/queue">
      <h1 className="type-h1">{t.title}</h1>
      {queue.length === 0 ? <p>{t.empty}</p> : null}
      {/* Full width (§5.15): from 1280 px two requests side by side. */}
      <div className={`${LIST_COLUMNS} gap-6`}>
        {queue.map((request) => {
          const fileUrl = `/api/admin/uploads/${request.id}`;
          const isImage = request.mimeType.startsWith("image/");
          return (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <UserAvatar user={request.user} className="size-10 text-[12px]" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {/* The real name to compare with the certificate (SPEC N-3). */}
                    <CardTitle>
                      {request.user.firstName
                        ? `${request.user.firstName} ${request.user.lastName ?? ""}`
                        : t.noRealName}
                    </CardTitle>
                    <p className="text-[14px] text-muted-foreground">
                      {t.discordName(userDisplayName(request.user.name, locale))}
                    </p>
                  </div>
                </div>
                <p className="text-[14px] text-muted-foreground">
                  {t.uploaded(formatDateTime(request.createdAt, locale))} ·{" "}
                  {request.university
                    ? `${request.university.name} (${request.university.city})`
                    : t.otherUniversity(request.universityOther ?? "")}{" "}
                  · {request.mimeType} · {t.megabytes((request.sizeBytes / 1024 / 1024).toFixed(1))}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!request.fileAvailable ? (
                  // Uploads are not in the backups (ARCHITECTURE §8): after a restore the file can be gone.
                  <p className="text-[14px] text-destructive-text">{t.fileMissing}</p>
                ) : (
                  <>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- protected route, no optimisation
                      <img
                        src={fileUrl}
                        alt={t.certificate}
                        className="max-h-[70vh] w-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={fileUrl}
                        title={t.certificate}
                        className="h-[70vh] w-full rounded-lg border"
                      />
                    )}
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] underline underline-offset-2"
                    >
                      {t.openInNewTab}
                    </a>
                  </>
                )}
                <ul className="list-disc pl-5 text-[14px]">
                  {t.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <DecisionForm
                  requestId={request.id}
                  universities={request.university ? null : universities}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
