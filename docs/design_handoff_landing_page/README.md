# Handoff: Landingpage (v5, Hero B „Board“)

## Überblick
Neue öffentliche Startseite für Uni Scrims (`apps/web/app/(public)/page.tsx`). Sie ersetzt auf `/` den bisherigen `LoginHero`. `/login` behält den `LoginHero` unverändert. Ziel: Uni-Teams verstehen in einem Scroll, was das Board ist, wie man reinkommt und warum es verbindlich ist. Danach legen sie ein Konto an.

## Über die Design-Dateien
`Landing Page v5.dc.html` ist eine **Design-Referenz in HTML**: ein Prototyp für Aussehen und Verhalten, kein Produktionscode. Baue sie im bestehenden Next.js-/Tailwind-/shadcn-Setup von `apps/web` nach. Nutze dafür die vorhandenen Komponenten und Tokens aus `globals.css`, keine Inline-Styles. Die HTML-Datei hat drei Hero-Varianten (Tweak `hero` A/B/C). **Umsetzen: nur B.** A und C nicht bauen.

## Fidelity
**High-fidelity.** Farben, Typo, Abstände und Radien entsprechen den bestehenden Tokens und Komponenten. Fast alles ist 1:1 aus dem Repo nachgebaut. Bitte die echten Komponenten wiederverwenden, nicht neu bauen (Mapping unten).

## Projektregeln beachten (CLAUDE.md)
- Keine Features erfinden. Die Seite beschreibt nur, was es laut SPEC gibt.
- UI-Texte auf Deutsch, Code und Kommentare auf Englisch, mobilfreundlich.
- Die Logik von `page.tsx` bleibt: `gesperrt`-/`geloescht`-Alert oben; eingeloggt statt der zwei CTAs nur „Zum Board“ (`/scrims`); `LoginNote` als Footer, wenn nicht eingeloggt.
- Sprachmenü (Flagge + „DE“/„EN“ + Chevron) im Header: nur bauen, wenn es schon i18n gibt. Sonst beim Nutzer nachfragen und erst mal weglassen.

## Seitenaufbau (von oben nach unten)
Inhaltsbreite: `max-w-[1120px] mx-auto px-5`, Abschnitte `py-[72px]`. Hinweis: Die anderen ausgeloggten Seiten nutzen `max-w-3xl`. Die Landingpage ist bewusst breiter, der Header sollte auf `/` dieselbe Breite haben.

### 0. Header (bestehender `SiteHeader`)
`h-16`, `border-b border-border`, Logo 28 px (`BrandLogo`). Rechts: (optional Sprachmenü) und der Link „Anmelden“ im Stil des AdminHeader-Logout-Buttons: `h-9 rounded-sm border border-border-strong px-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground`.

### 1. Hero B „Board“
- **Hintergrund** (`relative overflow-hidden`, dekorativ, `aria-hidden`):
  - radialer Glow `rgba(61,123,255,.16)`, ca. 900×700 px, oben rechts
  - die beiden Logo-Chevrons als SVG-Polylines, sehr groß, rechts oben angeschnitten: Breite `min(900px,120vw)`, `right:-260px; top:-160px`, `stroke-width` 52 bei viewBox 400
    - links: `rgba(242,244,247,.035)`, `points 52,96 156,200 52,304`
    - rechts: `rgba(61,123,255,.10)`, `points 348,96 244,200 348,304`
  - Animation beim Laden: links von `translateX(-18%)`, rechts von `+18%`, opacity 0→1, 1,2 s `cubic-bezier(.2,.9,.2,1)`
  - Inhalt liegt mit `relative z-[1]` darüber
- **Textblock** (`max-w-[760px] flex-col gap-5`, `pt-16`):
  - Eyebrow `type-label text-accent-text`: „Valorant-Scrims für Hochschulteams“
  - H1: Space Grotesk 700, `clamp(40px,6vw,72px)`, line-height 1, letter-spacing −0.03em, `text-balance`. Text: „Scrims gegen andere Uni-Teams. “ + `<span class="text-muted-foreground">`„Ohne Suchen in zehn Discords.“
  - Subline 17 px `text-muted-foreground max-w-[520px] text-pretty`: „Postet eure Anfrage aufs Board, bewerbt euch bei anderen Teams und klärt die Lobby direkt auf Discord.“
  - CTAs (`mt-2 flex flex-wrap gap-3`):
    - `buttonVariants({ size: "xl" })` „Konto erstellen“ → `/register`
    - `buttonVariants({ size: "xl", variant: "outline" })` „Anmelden“ → `/login?callbackURL=…`
    - unter `sm` volle Breite
  - Trust-Zeile: `ShieldCheckIcon` + „Nur für eingeschriebene Studierende deutscher Hochschulen.“ (13 px, muted)
- **Board-Vorschau** (`mt-14`, `aria-hidden`, nicht klickbar):
  - Rahmen `rounded-t-lg border border-b-0 border-border p-5 pb-0`, `box-shadow: 0 -30px 80px rgba(61,123,255,.08)`
  - Darin `TabNav`-Optik: Board 3 (aktiv), Anstehend 1, Anfragen 0, Bewerbungen 1. Zähler `font-label text-[11px] text-faint`.
  - Darunter `ListGroup`-Kopf „Mittwoch, 22. Oktober“ … „3 Anfragen“
  - dann drei `RequestCard`s im Grid `repeat(auto-fill,minmax(min(100%,340px),1fr)) gap-3`, `max-h-[420px] overflow-hidden`
  - unten ein 120 px Verlauf nach `--background`
  - Beispieldaten (fiktiv, siehe `cards` in der HTML-Logik):

| Team (Tag) | Hochschulen | Format | Zeit | Rang-Range | Maps | Teamrang | Zuverlässigkeit | Bewerbungen |
|---|---|---|---|---|---|---|---|---|
| VOLT Gaming (VOLT) | Uni Süd, HS West | BO3 | 20:00 Uhr | Gold – Diamond | Ascent · Bind · Haven | Platinum | 12 gespielt · 0 No-Shows · 1 kurzfristige Absage | 2 Bewerbungen, Badge „Beworben“ |
| Mavericks (MAVS) | TU Ost | 2 Maps | 21:30 Uhr | Platinum – Ascendant | Lotus · Split | Diamond | 5 gespielt · 0 No-Shows · 0 kurzfristige Absagen | Noch keine Bewerbungen |
| Kernel (KRNL) | HS Mitte +1 | 1 Map | 22:00 Uhr | Silver – Gold | Freie Wahl | Gold | 3 gespielt · 1 No-Show · 0 kurzfristige Absagen | 1 Bewerbung |

  - Empfehlung: `RequestCard` für eine statische Vorschau verwendbar machen, z. B. mit einem `preview`-Prop, das statt `Link` ein `div` rendert. `TeamCardData` mit statischen Daten füttern. Keine DB-Abfrage für die Vorschau.

### 2. „So funktioniert's“
- Eyebrow `type-label text-muted-foreground` „So funktioniert's“
- H2 `clamp(28px,3.6vw,40px)` 700, −0.025em: „In drei Schritten zum ersten Scrim.“
- Drei `Card`s (`p-6`) im Grid `repeat(auto-fit,minmax(min(100%,260px),1fr)) gap-3`. Jede Karte hat:
  - Nummer 28 px 700 `text-primary`
  - Titel `type-h2`
  - Text muted
  - unten (`mt-auto`) ein Mini-UI-Fragment, dekorativ
- Inhalte:
  1. „Konto anlegen, Discord verknüpfen“ – „Mit E-Mail und Passwort. Über Discord bekommst du danach Bewerbungen, Zusagen und Reminder.“
     - Fragment: Zeile `rounded-sm border bg-secondary p-3` mit `DiscordIcon` (22 px, `brand-icons.tsx`), „Discord“ und Badge `success` mit `BadgeDot` „Verknüpft“
  2. „Studierendenstatus bestätigen“ – „Lade deine Immatrikulationsbescheinigung hoch. Wir prüfen sie von Hand und löschen sie danach.“
     - Fragment: Zeile mit `FileIcon`, „Immatrikulation.pdf“ (ellipsis) und `StatusDot` in `text-warning` „In Prüfung“
  3. „Team bilden, Scrims spielen“ – „Mindestens 5 verifizierte Spieler, höchstens 10 Mitglieder pro Team.“
     - Fragment: 10 quadratische Slots (Grid 10 Spalten, gap 4 px, `rounded-sm`): 5 gefüllt `bg-primary`, 5 `border border-dashed border-border-strong`
     - darunter `font-label text-[12px] text-faint` „5 verifiziert“ … „max. 10“

### 3. „Funktionen“
- Eyebrow „Funktionen“, H2 „Alles, was ein Scrim braucht.“
- Drei `Card`s (`p-5 gap-4`), gleiches Grid wie oben (`minmax(260px)`), damit alle drei in eine Reihe passen. Jede Karte: Titel `type-h2` + Text muted + Fragment.
  1. **Scrim-Board** – „Offene Anfragen anderer Uni-Teams mit Datum, Startzeit (deutsche Zeit), Format, Maps und Rang-Range.“
     - Fragment: Label „Rang im Bereich“ (14 px medium, wie `Field`)
     - darunter neutrale `Badge`s mit `RankIcon` (16 px) für Iron, Silver, Gold, Platinum, Diamond, Ascendant, Immortal, Radiant
  2. **Anfragen und Bewerbungen** – „Postet eine Anfrage, andere Teams bewerben sich. Der Captain nimmt ein Team an, alle anderen werden automatisch benachrichtigt.“
     - Fragment: zwei Zeilen `rounded-lg border bg-secondary p-3` mit `TeamAvatar` (sm)
     - VOLT Gaming + Badge success „Bestätigt“; Kernel + Badge neutral „Abgelehnt“
  3. **Discord-Bot** – „DMs und Posts im Discord-Channel eures Teams: Bewerbungen, Zusagen, Absagen, Reminder 24 h und 1 h vorher und die Bitte um Feedback.“
     - Fragment: Badges accent „Neue Bewerbung“, success „Bestätigt“, warning „Reminder“, neutral „Feedback“

### 4. „Verbindlichkeit“
- Zwei Spalten (`repeat(auto-fit,minmax(min(100%,400px),1fr)) gap-x-16 gap-y-8 items-center`)
- Links:
  - Eyebrow „Verbindlichkeit“
  - H2 `clamp(32px,4.6vw,52px)` „No-Shows werden “ + `text-primary` „sichtbar.“
  - Text: „Nach jedem Scrim sagen beide Teams, ob er stattgefunden hat. Am Team stehen gespielte Scrims, No-Shows und kurzfristige Absagen.“
- Rechts: drei `StatTile`s nebeneinander (Grid 3 Spalten, gap 3), Werte unten ausgerichtet (`justify-between`):
  - Gespielt 12
  - No-Shows 0: `text-success`, vor dem Label ein 6-px-Punkt `bg-success` mit Puls-Animation
  - Kurzfr. Absagen 1: `text-warning`
  - darunter 13 px `text-faint`: „Beispielteam, ausgedachte Werte“

### 5. FAQ
- Zwei Spalten wie oben (`minmax(300px)`)
- Links:
  - Eyebrow „FAQ“
  - H2 „Häufige Fragen“
  - „Noch was offen? Schreib uns über den Support.“ (Link `/support`, `text-accent-text underline underline-offset-3`)
- Rechts: Accordion in einer Card (`px-[18px] py-1`, Zeilen mit `border-b border-border`, letzte ohne Rand):
  - Frage als Button (`min-h-14 text-[16px] font-semibold`, hover `text-accent-text`, `aria-expanded`)
  - `ChevronDownIcon` dreht sich beim Öffnen um 180° (150 ms)
  - Antwort 15 px muted, `pb-4`
  - Die erste Frage ist offen, es ist immer nur eine offen.
- Fragen und Antworten (exakt):
  1. **Wer kann mitmachen?** – Alle ab 16, die an einer deutschen Hochschule eingeschrieben sind. Du lädst deine Immatrikulationsbescheinigung hoch, sie wird von Hand geprüft und direkt danach gelöscht.
  2. **Brauche ich Discord?** – Ja. Du verknüpfst Discord nach der Registrierung. Bewerbungen, Zusagen und Reminder kommen per Discord-DM, auf Wunsch zusätzlich per E-Mail. Die Lobby klärt ihr direkt auf Discord.
  3. **Ist das kostenlos?** – Ja. Uni Scrims ist ein privates, nicht-kommerzielles Studierendenprojekt: keine Werbung, keine bezahlten Funktionen, kein Tracking.
  4. **Was passiert, wenn ein Team nicht auftaucht?** – Nach jedem Scrim sagen beide Teams, ob er stattgefunden hat. Am Team stehen gespielte Scrims, No-Shows und kurzfristige Absagen.
  5. **Können Spieler aus verschiedenen Hochschulen in einem Team sein?** – Ja. Gemischte Teams sind erlaubt, solange alle verifiziert studieren. Mindestens 5 verifizierte Spieler, höchstens 10 Mitglieder pro Team.
- Lieber `<details>`/`<summary>` (ohne JS) oder ein kleines Client-Component.

### 6. Abschluss-CTA
- `pt-12 pb-20`
- Card zentriert, `py-14 px-6 text-center`, oben radialer Glow `rgba(61,123,255,.13)`
- Logo-Icon als SVG (56 px): die beiden Polylines schnappen beim Laden zusammen, wie im Hero
- H2 `clamp(32px,4.6vw,52px)`: „Euer nächster Scrim wartet schon.“
- Die gleichen CTAs und die gleiche Trust-Zeile wie im Hero

### 7. Footer
Bestehender `SiteFooter` unverändert, mit Riot-Hinweis. Breite wie die Seite.

## Interaktionen & Verhalten
- Animationen nur dekorativ; `prefers-reduced-motion: reduce` schaltet alle ab.
  - Hero-Chevrons: 1,2 s, einmal
  - CTA-Chevrons: 1 s, einmal
  - Puls am No-Show-Punkt: 1,8 s, endlos
- Keine Scroll-Listener und kein IntersectionObserver nötig. Im Prototyp hat genau das zu Problemen geführt.
- Hover: Buttons und Links wie im Repo (`primary-hover`, `bg-secondary`, `text-foreground`).
- Fokus: globaler `:focus-visible`-Ring aus `globals.css`.
- Responsiv: alle Grids mit `auto-fit/minmax`. Unter `sm` volle Breite für CTAs. Ab 320 px getestet.

## State
Nur das FAQ-Accordion (eine offene Frage) und gegebenenfalls das Sprachmenü. Die Seite liest weiter nur `getSignedInUser()` und die `searchParams` wie heute.

## Design-Tokens (aus `apps/web/app/globals.css`, Dark)
- **Flächen:** `--background` #0E1116 · `--card` #141820 · `--secondary` #1A1F27
- **Ränder:** `--border` #262C36 · `--border-strong` #383F4B
- **Text:** `--foreground` #F2F4F7 · `--muted-foreground` #8B93A1 · `--faint` #717886
- **Akzent:** `--primary` #3D7BFF · `--primary-hover` #5A8FFF · `--accent-text` #5A8FFF · `--accent-soft` rgba(61,123,255,.13) · Text auf Primary #0E1116
- **Status:** `--success` #3DD68C (soft .12) · `--warning` #F5B84B (soft .1) · `--destructive-text` #FF8279
- **Radien:** `--radius` 12 px (Cards) · `--radius-sm` 8 px (Buttons, Inputs) · Pill 999 px (Badges)
- **Fonts:** Space Grotesk (Display/Body, 700 für Headlines, −0.025em) · Geist Mono (Labels 12 px/500, normale Schreibung)
- **Light Mode:** Die Seite nutzt nur Tokens, deshalb funktioniert die Light-Variante aus `globals.css` automatisch. Bitte prüfen. Die Glows im Light Mode schwächer oder ganz weg.

## Komponenten-Mapping (wiederverwenden)
| Im Design | Repo |
|---|---|
| Buttons | `components/ui/button.tsx` (`buttonVariants`, size `xl`) |
| Karten | `components/ui/card.tsx`, `components/stat-tile.tsx` |
| Badges | `components/ui/badge.tsx` (`neutral`, `accent`, `success`, `warning`, `outline`, `BadgeDot`) |
| Board-Karte | `components/request-card.tsx` (+ Preview-Modus) |
| Tabs-Optik | `components/tab-nav.tsx` |
| Tagesgruppe | `components/list-group.tsx` |
| Team-Tag-Avatar | `components/team-avatar.tsx` |
| Rank-Icons | `components/rank-icon.tsx` (`RankIcon`, `RankLabel`) |
| Status-Punkt | `components/detail-rows.tsx` (`StatusDot`) |
| Icons | `components/icons.tsx` (ShieldCheck, Clock, MapPin, File, Check, ChevronRight/Down), `components/brand-icons.tsx` (`DiscordIcon`) |
| Logo | `components/brand-logo.tsx`, `public/brand/*` |

## Assets
Keine neuen Assets. Logo/Icon aus `public/brand/`, Rank-Icons aus `assets/ranks/`. Der Riot-Hinweis im Footer bleibt Pflicht.

## Dateien in diesem Paket
- `Landing Page v5.dc.html`: Prototyp (Tweak `hero` auf **B** stellen). Öffnet direkt im Browser, benötigt `support.js` und `assets/`.
- `assets/`: Logo, Icon und Rank-Icons, wie im Prototyp verlinkt.
