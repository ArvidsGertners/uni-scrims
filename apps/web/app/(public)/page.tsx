import { RANK_LABELS, RANKS } from "@uni-scrims/core";
import { MAX_TEAM_MEMBERS, READY_MEMBER_COUNT } from "@uni-scrims/core/config/limits";
import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";
import { DiscordIcon } from "@/components/brand-icons";
import { StatusDot } from "@/components/detail-rows";
import { ChevronDownIcon, FileIcon, ShieldCheckIcon } from "@/components/icons";
import { LoginNote } from "@/components/login-note";
import { PageMain } from "@/components/page-main";
import { RankIcon } from "@/components/rank-icon";
import { StatTile } from "@/components/stat-tile";
import { TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMessages } from "@/i18n/format";
import { landingMessages } from "@/i18n/public";
import { DEFAULT_AFTER_LOGIN } from "@/lib/callback-url";
import { getLocale, getMessages } from "@/lib/locale";
import { getSignedInUser, loginUrl } from "@/lib/session";
import { BoardPreview, PREVIEW_TEAMS } from "./board-preview";
import { HeroBackdrop, SnapIcon } from "./landing-art";

// The landing page of docs/design_handoff_landing_page (hero B), wider than the other signed-out
// pages; data-landing widens header and footer to the same column (ARCHITECTURE §7).
const COLUMN = "mx-auto w-full max-w-[1120px] px-5";
const DISPLAY = "font-display [font-weight:var(--display-weight)]";
const H2 = cn(DISPLAY, "text-[clamp(28px,3.6vw,40px)] leading-[1.05] tracking-[-0.025em]");
const H2_LARGE = cn(DISPLAY, "text-[clamp(32px,4.6vw,52px)] leading-none tracking-[-0.025em]");
const CARD_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3";
const FRAGMENT_ROW = "flex items-center gap-3 border border-border bg-secondary p-3";
// Three tiles in a row down to 320 px: less padding at the sides there, so the labels fit.
const TILE = "justify-between max-sm:px-3";

function SectionHead({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <span className="type-label text-muted-foreground">{eyebrow}</span>
      <h2 id={id} className={H2}>
        {title}
      </h2>
    </div>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gesperrt, geloescht } = await searchParams;
  const loggedIn = (await getSignedInUser()) !== null;
  const locale = await getLocale();
  const t = await getMessages(landingMessages);
  const status = formatMessages[locale].applicationStatus;
  const linkClass = "font-semibold underline underline-offset-2";

  const notice = gesperrt ? (
    <Alert>
      <span>
        {t.bannedNotice((label) => (
          <Link href="/account" className={linkClass}>
            {label}
          </Link>
        ))}
      </span>
    </Alert>
  ) : geloescht ? (
    <Alert variant="success">
      <span>{t.deletedNotice}</span>
    </Alert>
  ) : null;

  // Banned accounts get no way in; signed in only the board, else register and sign in.
  const actions = (className?: string): ReactNode =>
    gesperrt ? null : loggedIn ? (
      <Link href="/scrims" className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}>
        {t.toBoard}
      </Link>
    ) : (
      <div className={cn("flex w-full flex-wrap gap-3", className)}>
        <Link
          href="/register"
          className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}
        >
          {t.createAccount}
        </Link>
        <Link
          href={loginUrl(DEFAULT_AFTER_LOGIN)}
          className={buttonVariants({ size: "xl", variant: "outline", className: "max-sm:w-full" })}
        >
          {t.signIn}
        </Link>
      </div>
    );
  const studentsOnly = (
    <span className="relative flex items-center gap-2 text-[13px] text-muted-foreground">
      <ShieldCheckIcon />
      {t.studentsOnly}
    </span>
  );

  return (
    <PageMain width="full" className="pt-0 pb-0">
      <div data-landing className="relative overflow-hidden">
        <HeroBackdrop />
        <section aria-labelledby="landing-title" className={cn(COLUMN, "relative z-[1] pt-16")}>
          <div className="flex max-w-[760px] flex-col gap-5">
            {notice}
            <span className="type-label text-accent-text">{t.eyebrow}</span>
            <h1
              id="landing-title"
              className={cn(
                DISPLAY,
                "text-[clamp(40px,6vw,72px)] leading-none tracking-[-0.03em] text-balance",
              )}
            >
              {t.title} <span className="text-muted-foreground">{t.titleMuted}</span>
            </h1>
            <p className="max-w-[520px] text-[17px] text-pretty text-muted-foreground">{t.lead}</p>
            <div className="mt-2 flex flex-col items-start gap-3.5">
              {actions()}
              {studentsOnly}
              {gesperrt || loggedIn ? null : <LoginNote />}
            </div>
          </div>
          <BoardPreview />
        </section>
      </div>

      <section aria-labelledby="landing-steps" className={cn(COLUMN, "py-[72px]")}>
        <SectionHead id="landing-steps" eyebrow={t.howItWorks} title={t.stepsTitle} />
        <ol className={cn(CARD_GRID, "mt-8")}>
          {t.steps.map((step, index) => (
            // min-w-0: the file name truncates instead of widening the column at 320 px.
            <li key={step.title} className="flex min-w-0">
              <Card className="min-w-0 flex-1 gap-5 p-6">
                <span
                  className={cn(
                    DISPLAY,
                    "text-[28px] leading-none text-primary light:text-accent-text",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="type-h2">{step.title}</h3>
                  <p className="text-pretty text-muted-foreground">{step.text}</p>
                </div>
                <div aria-hidden className="mt-auto">
                  {index === 0 ? (
                    <div className={cn(FRAGMENT_ROW, "rounded-sm")}>
                      <DiscordIcon size={22} className="text-foreground" />
                      <span className="flex-1 text-[14px] font-semibold">{t.discord}</span>
                      <Badge variant="success">
                        <BadgeDot />
                        {t.linked}
                      </Badge>
                    </div>
                  ) : index === 1 ? (
                    <div className={cn(FRAGMENT_ROW, "rounded-sm")}>
                      <FileIcon size={20} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {t.certificateFile}
                      </span>
                      <StatusDot className="text-[13px] text-warning">{t.inReview}</StatusDot>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-10 gap-1">
                        {Array.from({ length: MAX_TEAM_MEMBERS }, (_, slot) => (
                          <span
                            key={slot}
                            className={cn(
                              "aspect-square rounded-sm",
                              slot < READY_MEMBER_COUNT
                                ? "bg-primary"
                                : "border border-dashed border-border-strong",
                            )}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between font-label text-[12px] text-faint">
                        <span>{t.verifiedCount(READY_MEMBER_COUNT)}</span>
                        <span>{t.maxCount(MAX_TEAM_MEMBERS)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="landing-features" className={cn(COLUMN, "py-[72px]")}>
        <SectionHead id="landing-features" eyebrow={t.features} title={t.featuresTitle} />
        <div className={cn(CARD_GRID, "mt-8")}>
          <Card>
            <div className="flex flex-col gap-1">
              <h3 className="type-h2">{t.board.title}</h3>
              <p className="text-pretty text-muted-foreground">{t.board.text}</p>
            </div>
            <div aria-hidden className="flex flex-col gap-2">
              <span className="text-[14px] font-medium">{t.board.rankInRange}</span>
              <div className="flex flex-wrap gap-1.5">
                {RANKS.map((rank) => (
                  <Badge key={rank}>
                    <RankIcon rank={rank} className="size-4 align-middle" />
                    {RANK_LABELS[rank]}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-1">
              <h3 className="type-h2">{t.applications.title}</h3>
              <p className="text-pretty text-muted-foreground">{t.applications.text}</p>
            </div>
            <div aria-hidden className="flex flex-col gap-2">
              <div className={cn(FRAGMENT_ROW, "rounded-lg")}>
                <TeamAvatar
                  team={{ ...PREVIEW_TEAMS.volt, logo: null }}
                  size="sm"
                  className="bg-card"
                />
                <span className="flex-1 font-semibold">{PREVIEW_TEAMS.volt.name}</span>
                <Badge variant="success">
                  <BadgeDot />
                  {status.ACCEPTED}
                </Badge>
              </div>
              <div className={cn(FRAGMENT_ROW, "rounded-lg")}>
                <TeamAvatar
                  team={{ ...PREVIEW_TEAMS.krnl, logo: null }}
                  size="sm"
                  className="bg-card"
                />
                <span className="flex-1 font-semibold">{PREVIEW_TEAMS.krnl.name}</span>
                <Badge className="bg-card">{status.REJECTED}</Badge>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-1">
              <h3 className="type-h2">{t.bot.title}</h3>
              <p className="text-pretty text-muted-foreground">{t.bot.text}</p>
            </div>
            <div aria-hidden className="flex flex-wrap gap-1.5">
              <Badge variant="accent">{t.bot.newApplication}</Badge>
              <Badge variant="success">{t.bot.booked}</Badge>
              <Badge variant="warning">{t.bot.reminder}</Badge>
              <Badge>{t.bot.feedback}</Badge>
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="landing-reliability" className={cn(COLUMN, "py-[72px]")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-x-16 gap-y-8">
          <div className="flex flex-col gap-3">
            <span className="type-label text-muted-foreground">{t.reliability}</span>
            <h2 id="landing-reliability" className={H2_LARGE}>
              {t.reliabilityTitle}{" "}
              <span className="text-primary light:text-accent-text">{t.reliabilityAccent}</span>
            </h2>
            <p className="max-w-[440px] text-pretty text-muted-foreground">{t.reliabilityText}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <div aria-hidden className="grid grid-cols-3 gap-3">
              <StatTile label={t.played} value={12} className={TILE} />
              <StatTile
                label={
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse-dot" />
                    {t.noShows}
                  </span>
                }
                value={0}
                tone="text-success"
                className={TILE}
              />
              <StatTile label={t.lateCancels} value={1} tone="text-warning" className={TILE} />
            </div>
            <span className="text-[13px] text-faint">{t.sampleNote}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-faq" className={cn(COLUMN, "py-[72px]")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-16 gap-y-8">
          <div className="flex flex-col gap-3">
            <span className="type-label text-muted-foreground">{t.faq}</span>
            <h2 id="landing-faq" className={H2}>
              {t.faqTitle}
            </h2>
            <p className="text-muted-foreground">
              {t.faqMore((label) => (
                <Link href="/support" className="text-accent-text underline underline-offset-3">
                  {label}
                </Link>
              ))}
            </p>
          </div>
          {/* Without JavaScript: the browser keeps one question of the group open (name). */}
          <Card className="gap-0 px-[18px] py-1">
            {t.questions.map((item, index) => (
              <details
                key={item.question}
                name="landing-faq"
                open={index === 0}
                className="group border-b border-border last:border-b-0"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 hover:text-accent-text [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[16px] font-semibold">{item.question}</h3>
                  <ChevronDownIcon
                    size={18}
                    className="motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-4 text-[15px] text-pretty text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </Card>
        </div>
      </section>

      {gesperrt ? null : (
        <section aria-labelledby="landing-cta" className={cn(COLUMN, "pt-12 pb-20")}>
          <Card className="relative items-center gap-5 overflow-hidden px-6 py-14 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,var(--glow-cta),transparent)]"
            />
            <SnapIcon className="relative" />
            <h2 id="landing-cta" className={cn(H2_LARGE, "relative text-balance")}>
              {t.ctaTitle}
            </h2>
            <div className="relative mt-2 flex w-full justify-center">
              {actions("justify-center")}
            </div>
            {studentsOnly}
          </Card>
        </section>
      )}
    </PageMain>
  );
}
