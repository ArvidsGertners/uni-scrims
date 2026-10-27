import {
  getVerificationStatus,
  listUniversities,
  rejectReasonText,
  semesterLabel,
} from "@uni-scrims/core";
import { VerifStatus } from "@uni-scrims/db";
import Link from "next/link";
import { DetailRows, IconTile, StatusDot } from "@/components/detail-rows";
import { AlertTriangleIcon, ClockIcon, ShieldCheckIcon, UploadIcon } from "@/components/icons";
import { DialogShell } from "@/components/dialog-shell";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { verificationNeeded } from "@/lib/header-user";
import { requirePageUser } from "@/lib/session";
import { AccountTabs } from "../account/account-tabs";
import { VerificationForm } from "./verification-form";
import { getLocale, getMessages } from "@/lib/locale";
import { verifyPageMessages } from "@/i18n/account";

// A tab of the settings (SPEC N-11, N-13): the page title is Einstellungen, the state below it.
function Headline({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="type-h1">{title}</h2>
      <p className="text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}

/** The verification tab of the settings, as a dialog like the others (SPEC N-31). */
export async function VerifyDialog({
  intercepted,
  params,
}: {
  intercepted: boolean;
  params: Record<string, string | string[] | undefined>;
}) {
  const user = await requirePageUser("/verify");
  const { neu } = params;
  const { verifiedAt, university, latest } = await getVerificationStatus(user.id);
  const locale = await getLocale();
  const t = await getMessages(verifyPageMessages);
  const rejected = latest?.status === VerifStatus.REJECTED;

  return (
    // Wide like Konto, so title and tabs stay put when switching; the state below stays narrow
    // (SPEC N-12).
    <DialogShell title={t.title} size="wide" fallback="/scrims" intercepted={intercepted}>
      <AccountTabs current="/verify" unverified={await verificationNeeded()} inDialog />
      <div className="flex w-full max-w-[44rem] flex-col">
        {verifiedAt ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-success-soft text-success">
              <ShieldCheckIcon size={30} />
            </IconTile>
            <Headline title={t.verifiedTitle}>{t.verifiedText}</Headline>
            <DetailRows
              rows={[
                {
                  label: t.status,
                  value: <StatusDot className="text-success">{t.verified}</StatusDot>,
                },
                { label: t.university, value: university ?? "–" },
                {
                  label: t.verifiedSince,
                  value: formatDateTime(verifiedAt, locale, { suffix: true }),
                },
              ]}
            />
            <div className="flex flex-wrap gap-2.5">
              <Link href="/scrims" className={buttonVariants()}>
                {t.toBoard}
              </Link>
              <Link
                href="/team"
                className={buttonVariants({ variant: "outline", className: "px-[18px]" })}
              >
                {t.toTeam}
              </Link>
            </div>
          </div>
        ) : latest?.status === VerifStatus.PENDING ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-warning-soft text-warning">
              <ClockIcon size={30} />
            </IconTile>
            <Headline title={t.pendingTitle}>{t.pendingText}</Headline>
            <DetailRows
              rows={[
                {
                  label: t.status,
                  value: <StatusDot className="text-warning">{t.pending}</StatusDot>,
                },
                { label: t.university, value: latest.university ?? "–" },
                {
                  label: t.submitted,
                  value: formatDateTime(latest.createdAt, locale, { suffix: true }),
                },
              ]}
            />
            <Link
              href="/scrims"
              className={buttonVariants({ variant: "outline", className: "self-start px-[18px]" })}
            >
              {t.previewBoard}
            </Link>
          </div>
        ) : rejected && !neu ? (
          <div className="flex flex-col gap-6">
            <IconTile className="bg-destructive-soft text-destructive-text">
              <AlertTriangleIcon size={30} />
            </IconTile>
            <Headline title={t.rejectedTitle}>{t.rejectedText}</Headline>
            {latest.rejectReason ? (
              <div className="flex flex-col gap-1.5 rounded-sm border border-destructive bg-destructive-soft px-[18px] py-4">
                <span className="type-label text-destructive-text">{t.reason}</span>
                <span className="text-[15px] text-pretty">
                  {rejectReasonText(latest.rejectReason, locale)}
                </span>
              </div>
            ) : null}
            <Link
              href="/verify?neu=1"
              // A step within the dialog, like its tabs (§5.33).
              replace
              data-dialog-replace=""
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              <UploadIcon size={18} strokeWidth={2.2} />
              {t.uploadNew}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            <Headline title={t.uploadTitle}>{t.uploadText}</Headline>
            <VerificationForm
              universities={await listUniversities()}
              checks={t.checks(semesterLabel(new Date(), locale))}
            />
          </div>
        )}
      </div>
    </DialogShell>
  );
}
