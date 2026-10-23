import { listPendingVerifications, listUniversities, resolveUploadDir } from "@uni-scrims/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { AdminNav } from "./admin-nav";
import { DecisionForm } from "./decision-form";
import { PageMain } from "@/components/page-main";

// Fixed checklist from SPEC P0-2.
const CHECKLIST = [
  "Bescheinigung gilt für das aktuelle Semester",
  "Hochschule stimmt mit der Auswahl überein",
  "Dokument ist vollständig und lesbar",
  "Keine offensichtliche Bearbeitung",
];

export default async function AdminPage() {
  // Layout and page render in parallel, so the page checks too.
  const admin = await requireAdminPage("/admin");
  const queue = await listPendingVerifications(admin.id, resolveUploadDir());
  const universities = queue.some((request) => !request.university) ? await listUniversities() : [];

  return (
    <PageMain className="gap-6">
      <AdminNav adminId={admin.id} />
      <h1 className="type-h1">Prüf-Queue</h1>
      {queue.length === 0 ? <p>Keine offenen Prüfungen.</p> : null}
      {queue.map((request) => {
        const fileUrl = `/api/admin/uploads/${request.id}`;
        const isImage = request.mimeType.startsWith("image/");
        return (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{request.user.name}</CardTitle>
              <p className="text-[14px] text-muted-foreground">
                Hochgeladen am {formatDateTime(request.createdAt)} ·{" "}
                {request.university
                  ? `${request.university.name} (${request.university.city})`
                  : `Andere: ${request.universityOther}`}{" "}
                · {request.mimeType} · {(request.sizeBytes / 1024 / 1024).toFixed(1)} MB
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!request.fileAvailable ? (
                // Uploads are not in the backups (ARCHITECTURE §8): after a restore the file can be gone.
                <p className="text-[14px] text-accent-text">
                  Die Datei fehlt (z. B. nach dem Einspielen eines Backups). Bitte ablehnen, etwa
                  mit „Bitte erneut hochladen“; freigeben geht ohne Datei nicht.
                </p>
              ) : (
                <>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- protected route, no optimisation
                    <img
                      src={fileUrl}
                      alt="Immatrikulationsbescheinigung"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={fileUrl}
                      title="Immatrikulationsbescheinigung"
                      className="h-[70vh] w-full rounded-lg border"
                    />
                  )}
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[14px] underline underline-offset-2"
                  >
                    In neuem Tab öffnen
                  </a>
                </>
              )}
              <ul className="list-disc pl-5 text-[14px]">
                {CHECKLIST.map((item) => (
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
    </PageMain>
  );
}
