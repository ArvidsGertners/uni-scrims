import type { ReactNode } from "react";
import { ShieldCheckIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { landingMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

/** Login screen of the design handoff, as the landing page (/login is its own page, §7). */
export async function LandingHero({
  notice,
  children,
  footer,
}: {
  notice?: ReactNode;
  children: ReactNode;
  /** Below the "only for students" line. */
  footer?: ReactNode;
}) {
  const t = await getMessages(landingMessages);
  return (
    <PageMain className="gap-14 pt-[52px]">
      <div className="flex flex-col gap-5">
        {notice}
        <span className="type-label text-accent-text">{t.eyebrow}</span>
        <h1 className="type-hero">{t.title}</h1>
        <p className="max-w-[520px] text-[17px] text-pretty text-muted-foreground">{t.lead}</p>
        <div className="mt-2 flex flex-col items-start gap-3.5">
          {children}
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <ShieldCheckIcon />
            {t.studentsOnly}
          </span>
          {footer}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <span className="type-label text-muted-foreground">{t.howItWorks}</span>
        {t.steps.map((step, index) => (
          <div key={step.title} className="flex items-start gap-5">
            <span className="w-11 shrink-0 font-display text-[28px] leading-none [font-weight:var(--display-weight)] text-primary light:text-accent-text">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-1">
              <span className="type-h2">{step.title}</span>
              <span className="text-pretty text-muted-foreground">{step.text}</span>
            </div>
          </div>
        ))}
      </div>
    </PageMain>
  );
}
