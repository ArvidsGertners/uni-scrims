import { listPendingVerifications, listUniversities } from "@uni-scrims/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { DecisionForm } from "./decision-form";

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
  const queue = await listPendingVerifications(admin.id);
  const universities = queue.some((request) => !request.university) ? await listUniversities() : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Prüf-Queue</h1>
      {queue.length === 0 ? <p>Keine offenen Prüfungen.</p> : null}
      {queue.map((request) => {
        const fileUrl = `/api/admin/uploads/${request.id}`;
        const isImage = request.mimeType.startsWith("image/");
        return (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{request.user.name}</CardTitle>
              <p className="text-sm opacity-70">
                Hochgeladen am {formatDateTime(request.createdAt)} ·{" "}
                {request.university
                  ? `${request.university.name} (${request.university.city})`
                  : `Andere: ${request.universityOther}`}{" "}
                · {request.mimeType} · {(request.sizeBytes / 1024 / 1024).toFixed(1)} MB
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
              <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                In neuem Tab öffnen
              </a>
              <ul className="list-disc pl-5 text-sm">
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
    </main>
  );
}
