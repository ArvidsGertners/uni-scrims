import { getVerificationStatus, listUniversities } from "@uni-scrims/core";
import { VerifStatus } from "@uni-scrims/db";
import { formatDateTime } from "@/lib/format";
import { requirePageUser } from "@/lib/session";
import { VerificationForm } from "./verification-form";

export default async function VerifyPage() {
  const user = await requirePageUser("/verify");
  const { verifiedAt, latest } = await getVerificationStatus(user.id);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Verifizierung</h1>
      {verifiedAt ? (
        <p>Du bist seit {formatDateTime(verifiedAt)} verifiziert.</p>
      ) : latest?.status === VerifStatus.PENDING ? (
        <p>
          Deine Bescheinigung ist in Prüfung (hochgeladen am {formatDateTime(latest.createdAt)}). Du
          bekommst eine Discord-Nachricht, sobald sie entschieden ist.
        </p>
      ) : (
        <>
          {latest?.status === VerifStatus.REJECTED ? (
            <p className="text-destructive">
              Deine letzte Prüfung wurde abgelehnt: {latest.rejectReason}. Du kannst eine neue
              Bescheinigung hochladen.
            </p>
          ) : (
            <p>
              Lade deine Immatrikulationsbescheinigung hoch. Erst mit geprüfter Bescheinigung zählst
              du in deinem Team als verifiziert.
            </p>
          )}
          <VerificationForm universities={await listUniversities()} />
        </>
      )}
    </main>
  );
}
