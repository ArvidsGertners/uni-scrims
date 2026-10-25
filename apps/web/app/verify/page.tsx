import { getVerificationStatus, listUniversities, semesterLabel } from "@uni-scrims/core";
import { VerifStatus } from "@uni-scrims/db";
import Link from "next/link";
import { DetailRows, IconTile, StatusDot } from "@/components/detail-rows";
import { AlertTriangleIcon, ClockIcon, ShieldCheckIcon, UploadIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { requirePageUser } from "@/lib/session";
import { AccountTabs } from "../account/account-tabs";
import { VerificationForm } from "./verification-form";

// A tab of the settings (SPEC N-11, N-13): the page title is Einstellungen, the state below it.
function Headline({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="type-h1">{title}</h2>
      <p className="text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/verify");
  const { neu } = await searchParams;
  const { verifiedAt, university, latest } = await getVerificationStatus(user.id);
  const rejected = latest?.status === VerifStatus.REJECTED;

  return (
    // Wide like Konto, so title and tabs stay put when switching; the state below stays narrow
    // (SPEC N-12).
    <PageMain width="wide" className="gap-7">
      <div className="flex min-h-11 items-center">
        <h1 className="type-h1">Einstellungen</h1>
      </div>
      <AccountTabs current="/verify" unverified={!verifiedAt} />
      <div className="flex w-full max-w-[44rem] flex-col">
        {verifiedAt ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-success-soft text-success">
              <ShieldCheckIcon size={30} />
            </IconTile>
            <Headline title="Du bist verifiziert">
              Du kannst jetzt Teams gründen oder beitreten und Scrims anfragen.
            </Headline>
            <DetailRows
              rows={[
                {
                  label: "Status",
                  value: <StatusDot className="text-success">Verifiziert</StatusDot>,
                },
                { label: "Hochschule", value: university ?? "–" },
                { label: "Verifiziert seit", value: `${formatDateTime(verifiedAt)} Uhr` },
              ]}
            />
            <div className="flex flex-wrap gap-2.5">
              <Link href="/scrims" className={buttonVariants()}>
                Zum Board
              </Link>
              <Link
                href="/team"
                className={buttonVariants({ variant: "outline", className: "px-[18px]" })}
              >
                Zum Team
              </Link>
            </div>
          </div>
        ) : latest?.status === VerifStatus.PENDING ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-warning-soft text-warning">
              <ClockIcon size={30} />
            </IconTile>
            <Headline title="Wir prüfen deine Bescheinigung">
              Sobald wir fertig sind, bekommst du eine Discord-Nachricht.
            </Headline>
            <DetailRows
              rows={[
                {
                  label: "Status",
                  value: <StatusDot className="text-warning">In Prüfung</StatusDot>,
                },
                { label: "Hochschule", value: latest.university ?? "–" },
                { label: "Eingereicht", value: `${formatDateTime(latest.createdAt)} Uhr` },
              ]}
            />
            <Link
              href="/scrims"
              className={buttonVariants({ variant: "outline", className: "self-start px-[18px]" })}
            >
              Board schon mal ansehen
            </Link>
          </div>
        ) : rejected && !neu ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-destructive-soft text-destructive-text">
              <AlertTriangleIcon size={30} />
            </IconTile>
            <Headline title="Das hat leider nicht geklappt">
              Wir konnten deinen Studierendenstatus mit diesem Dokument nicht bestätigen.
            </Headline>
            {latest.rejectReason ? (
              <div className="flex flex-col gap-1.5 rounded-sm border border-destructive bg-destructive-soft px-[18px] py-4">
                <span className="type-label text-destructive-text">Grund</span>
                <span className="text-[15px] text-pretty">{latest.rejectReason}</span>
              </div>
            ) : null}
            <Link
              href="/verify?neu=1"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              <UploadIcon size={18} strokeWidth={2.2} />
              Neues Dokument hochladen
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            <Headline title="Bestätige deinen Studierendenstatus">
              Uni Scrims ist nur für eingeschriebene Studierende. Lade dazu deine aktuelle
              Immatrikulationsbescheinigung hoch.
            </Headline>
            <VerificationForm
              universities={await listUniversities()}
              checks={[
                "Dein Name ist gut lesbar",
                `Aktuelles Semester (${semesterLabel(new Date())})`,
                "Name der Hochschule ist sichtbar",
              ]}
            />
          </div>
        )}
      </div>
    </PageMain>
  );
}
