import { describeStartShort, getMyScrims } from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import { DiscordContact } from "@/components/discord-contact";
import { EmptyState } from "@/components/empty-state";
import { CheckIcon, ChevronRightIcon, MessageSquareIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { type AvatarTeam, TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePageUser } from "@/lib/session";
import {
  APPLICATION_STATUS_LABELS,
  SCRIM_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatRankRange,
  formatUniversities,
} from "@/lib/scrim-format";

type MyScrims = Awaited<ReturnType<typeof getMyScrims>>;

const TABS = [
  { key: "anstehend", label: "Anstehend" },
  { key: "anfragen", label: "Anfragen" },
  { key: "bewerbungen", label: "Bewerbungen" },
  { key: "vergangen", label: "Vergangen" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EMPTY: Record<TabKey, { title: string; text: string; cta: string; href: string }> = {
  anstehend: {
    title: "Noch keine bestätigten Scrims",
    text: "Bewirb dich auf dem Board oder erstelle eine eigene Anfrage.",
    cta: "Zum Board",
    href: "/board",
  },
  anfragen: {
    title: "Keine offenen Anfragen",
    text: "Erstelle eine Anfrage, damit sich andere Uni-Teams bei euch bewerben können.",
    cta: "Anfrage erstellen",
    href: "/requests/new",
  },
  bewerbungen: {
    title: "Noch keine Bewerbungen",
    text: "Auf dem Board findest du offene Anfragen anderer Teams.",
    cta: "Zum Board",
    href: "/board",
  },
  vergangen: {
    title: "Noch keine gespielten Scrims",
    text: "Nach jedem Match kannst du hier kurz Feedback geben.",
    cta: "Zum Board",
    href: "/board",
  },
};

const rowClass =
  "flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary";

export default async function MyScrimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/scrims");
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === tabParam)?.key ?? "anstehend";
  const mine = await getMyScrims({ userId: user.id, now: new Date() });
  const counts: Record<TabKey, number> = {
    anstehend: mine.upcoming.length,
    anfragen: mine.requests.length,
    bewerbungen: mine.applications.length,
    vergangen: mine.past.length,
  };
  const feedbackDue = mine.past.find((scrim) => scrim.canGiveFeedback);

  return (
    <PageMain className="gap-6">
      <h1 className="type-h1">Meine Scrims</h1>
      {!mine.team ? (
        <Alert>
          <span>
            Du bist in keinem Team.{" "}
            <Link href="/team" className="font-semibold underline underline-offset-2">
              Team gründen oder beitreten
            </Link>
          </span>
        </Alert>
      ) : (
        <>
          {feedbackDue ? (
            <Link
              href={`/scrims/${feedbackDue.id}`}
              className="flex items-center gap-3 rounded-sm border border-primary bg-accent-soft px-4 py-3.5 hover:bg-accent-soft-hover"
            >
              <MessageSquareIcon size={20} />
              <span className="flex-1 text-[14px]">
                <span className="font-semibold">
                  Wie war&apos;s gegen {feedbackDue.opponent.name}?
                </span>{" "}
                <span className="text-muted-foreground">Kurzes Feedback geben</span>
              </span>
              <ChevronRightIcon size={18} strokeWidth={2.5} />
            </Link>
          ) : null}

          <nav
            aria-label="Meine Scrims"
            className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
          >
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "anstehend" ? "/scrims" : `/scrims?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "type-btn flex min-h-10 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold whitespace-nowrap text-muted-foreground",
                  t.key === tab && "bg-secondary text-foreground",
                )}
              >
                {t.label}
                <span className="font-label text-[11px] text-faint">{counts[t.key]}</span>
              </Link>
            ))}
          </nav>

          {counts[tab] === 0 ? (
            <EmptyState
              compact
              title={EMPTY[tab].title}
              action={
                <Link
                  href={EMPTY[tab].href}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "px-[18px]",
                  })}
                >
                  {EMPTY[tab].cta}
                </Link>
              }
            >
              {EMPTY[tab].text}
            </EmptyState>
          ) : tab === "anstehend" ? (
            <Upcoming mine={mine} ownTeam={mine.team} />
          ) : tab === "anfragen" ? (
            <Requests mine={mine} />
          ) : tab === "bewerbungen" ? (
            <Applications mine={mine} />
          ) : (
            <Past mine={mine} />
          )}
        </>
      )}
    </PageMain>
  );
}

function Upcoming({ mine, ownTeam }: { mine: MyScrims; ownTeam: AvatarTeam }) {
  return mine.upcoming.map((scrim) => (
    <div
      key={scrim.id}
      className="flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5"
    >
      <Link href={`/scrims/${scrim.id}`} className="group flex flex-col gap-[18px]">
        <div className="flex items-center justify-between gap-2.5">
          <Badge variant="success">
            <BadgeDot />
            Bestätigt
          </Badge>
          <span className="font-label text-[13px]">{describeStartShort(scrim.startsAt)}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex shrink-0 items-center">
            <TeamAvatar
              team={ownTeam}
              own
              className={cn(
                "relative z-[1] shadow-[0_0_0_3px_var(--card)]",
                // A transparent logo would let the opponent show through underneath.
                ownTeam.logo !== null && "bg-card",
              )}
            />
            <TeamAvatar team={scrim.opponent} className="-ml-2" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="type-h2 group-hover:underline">gegen {scrim.opponent.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {formatUniversities(scrim.opponent.universities)} · {formatFormat(scrim.format)} ·{" "}
              {formatRankRange(scrim.rankMin, scrim.rankMax)}
            </span>
          </div>
        </div>
      </Link>
      <DiscordContact
        captainName={scrim.opponent.captainName}
        captainDiscordId={scrim.opponent.captainDiscordId}
        teamName={scrim.opponent.name}
      />
    </div>
  ));
}

function Requests({ mine }: { mine: MyScrims }) {
  return mine.requests.map((request) => (
    <Link
      key={request.id}
      href={`/requests/${request.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 hover:border-border-strong hover:bg-secondary"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="type-h2">{describeStartShort(request.startsAt)}</span>
          <span className="text-[13px] text-muted-foreground">
            {formatFormat(request.format)} · {formatRankRange(request.rankMin, request.rankMax)} ·{" "}
            {formatMaps(request.maps)}
          </span>
        </div>
        <Badge variant="accent">Offen</Badge>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3.5">
        <span className="type-label text-muted-foreground">
          Bewerbungen ({request.applicationCount})
        </span>
        <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
          Ansehen
          <ChevronRightIcon strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  ));
}

function Applications({ mine }: { mine: MyScrims }) {
  return (
    <div className="flex flex-col gap-2.5">
      {mine.applications.map((application) => (
        <Link key={application.id} href={`/requests/${application.requestId}`} className={rowClass}>
          <TeamAvatar team={application.team} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{application.team.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {describeStartShort(application.startsAt)} · {formatFormat(application.format)}
            </span>
          </div>
          {application.status === "PENDING" ? (
            <Badge variant="warning">
              <BadgeDot />
              Ausstehend
            </Badge>
          ) : (
            <Badge>{APPLICATION_STATUS_LABELS[application.status]}</Badge>
          )}
        </Link>
      ))}
    </div>
  );
}

function Past({ mine }: { mine: MyScrims }) {
  return (
    <div className="flex flex-col gap-2.5">
      {mine.past.map((scrim) => (
        <Link key={scrim.id} href={`/scrims/${scrim.id}`} className={cn(rowClass, "flex-wrap")}>
          <TeamAvatar team={scrim.opponent} />
          <div className="flex min-w-[140px] flex-1 flex-col">
            <span className="font-semibold">gegen {scrim.opponent.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {describeStartShort(scrim.startsAt)} · {formatFormat(scrim.format)}
              {scrim.status === "SCHEDULED" ? "" : ` · ${SCRIM_STATUS_LABELS[scrim.status]}`}
            </span>
          </div>
          {scrim.canGiveFeedback ? (
            <span className={buttonVariants({ size: "sm", className: "shrink-0" })}>
              Feedback geben
            </span>
          ) : scrim.feedbackGiven ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-success">
              <CheckIcon size={14} strokeWidth={3} />
              Feedback gegeben
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
