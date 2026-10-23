import type { ReactNode } from "react";
import { ShieldCheckIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";

const STEPS = [
  {
    title: "Mit Discord anmelden",
    text: "Kein neues Passwort – wir nutzen deinen Discord-Account.",
  },
  {
    title: "Studierendenstatus bestätigen",
    text: "Lade deine Immatrikulationsbescheinigung hoch. Wir prüfen sie von Hand.",
  },
  {
    title: "Team bilden, Scrims spielen",
    text: "Mindestens 5 verifizierte Spieler, höchstens 10 Mitglieder pro Team. Anfragen posten, bewerben und nach dem Match kurz Feedback geben.",
  },
];

/** Login screen of the design handoff, for the landing page and /login. */
export function LoginHero({
  notice,
  children,
  footer,
}: {
  notice?: ReactNode;
  children: ReactNode;
  /** Below the "only for students" line. */
  footer?: ReactNode;
}) {
  return (
    <PageMain className="gap-14 pt-[52px]">
      <div className="flex flex-col gap-5">
        {notice}
        <span className="type-label text-accent-text">Valorant-Scrims für Hochschulteams</span>
        <h1 className="type-hero">Scrims gegen andere Uni-Teams. Ohne Suchen in zehn Discords.</h1>
        <p className="max-w-[520px] text-[17px] text-pretty text-muted-foreground">
          Postet eure Anfrage aufs Board, bewerbt euch bei anderen Teams und klärt die Lobby direkt
          auf Discord.
        </p>
        <div className="mt-2 flex flex-col items-start gap-3.5">
          {children}
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <ShieldCheckIcon />
            Nur für eingeschriebene Studierende deutscher Hochschulen.
          </span>
          {footer}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <span className="type-label text-muted-foreground">So funktioniert&apos;s</span>
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex items-start gap-5">
            <span className="w-11 shrink-0 font-display text-[28px] leading-none [font-weight:var(--display-weight)] text-primary">
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
