# Handoff: HTML-Mails (E-Mail bestätigen, Passwort zurücksetzen)

## Überblick
Die beiden Konto-Mails aus `apps/web/lib/mail.ts` bekommen eine HTML-Version im Dunkel-Stil der Plattform. Betreff, Texte und Gültigkeiten bleiben gleich. Die bisherige Nur-Text-Version bleibt als `text`-Teil erhalten: Mail-Clients ohne HTML zeigen sie, und sie verbessert die Zustellbarkeit.

## Über die Design-Dateien
`E-Mail bestaetigen.html` und `Passwort zuruecksetzen.html` sind **fertiges, versandtaugliches E-Mail-HTML**: Tabellen-Layout, Inline-Styles, Outlook-Fixes, Preheader. Die Struktur kannst du 1:1 übernehmen. Ersetzen musst du nur die Platzhalter: Link `…token=BEISPIEL` → echte `url`. Das HTML nicht in React/JSX umbauen und kein CSS-Framework einsetzen, sonst geht die Darstellung in E-Mail-Clients kaputt.

## Fidelity
High-fidelity. Farben aus `apps/web/app/globals.css` (Dark), Texte wortgleich aus `apps/web/lib/mail.ts`.

## Projektregeln (CLAUDE.md)
- Eine kleine, thematische Änderung, Commit-Message auf Englisch.
- Abweichung von ARCHITECTURE §5.8 („plain German text“) bewusst: §5.8 im selben Commit anpassen (Mails jetzt HTML + Text).
- `pnpm test` und `pnpm lint` müssen grün sein.

## Umsetzung
1. **`packages/core/src/mail.ts`**
   - `Mail` um ein optionales `html` erweitern: `export type Mail = { to: string; subject: string; text: string; html?: string };`
   - `sendMail` reicht es schon weiter (`...message` geht an nodemailer, `html` wird unterstützt). Nur prüfen.
   - Dev-Log: weiter nur `text` loggen.
2. **`apps/web/lib/mail-html.ts`** (neu)
   - eine Funktion `accountMailHtml({ title, preheader, heading, lead, cta, url, validity, ignore })`, die das Template aus den Dateien zurückgibt
   - alle eingesetzten Werte HTML-escapen (`& < > " '`), vor allem `url`
   - `url` steht zweimal drin: im Button (`href`) und im Fallback-Link (`href` und Text)
3. **`apps/web/lib/mail.ts`**
   - `verificationMail` und `passwordResetMail` geben zusätzlich `html` zurück; `text` bleibt unverändert
   - Werte pro Mail siehe Tabelle unten
4. **Tests** (`apps/web/test/auth-flows.test.ts` o. ä.)
   - Betreff unverändert
   - `html` enthält die URL (escaped)
   - `text` unverändert
   - kein `<script>`

## Werte pro Mail
| Feld | E-Mail bestätigen | Passwort zurücksetzen |
|---|---|---|
| subject / title / heading | Bitte bestätige deine E-Mail-Adresse | Neues Passwort für Uni Scrims |
| preheader (versteckt) | Ein Klick, dann ist deine Adresse für Uni Scrims bestätigt. Der Link ist 24 Stunden gültig. | Über diesen Link setzt du ein neues Passwort. Der Link ist 1 Stunde gültig. |
| lead (nach „Hallo,“) | bitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link. | über diesen Link setzt du ein neues Passwort für Uni Scrims. Danach bist du auf allen Geräten abgemeldet. |
| Button | E-Mail-Adresse bestätigen | Neues Passwort setzen |
| Gültigkeits-Pill | Link 24 Stunden gültig | Link 1 Stunde gültig |
| ignore | Hast du dich nicht bei Uni Scrims registriert und auch keine neue Adresse eingetragen, kannst du diese Mail ignorieren. | Hast du das nicht angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist. |

## Aufbau (max. 600 px, eine Spalte)
1. **Hintergrund:** `#0E1116`, Außenabstand 40 px oben/unten
2. **Logo:** `https://uniscrims.com/brand/uniscrims-avatar-512.png`, 40×40, `border-radius:8px`, alt „Uni Scrims“. Die Datei liegt in `apps/web/public/brand/`. Die Basis-URL aus der vorhandenen Konfiguration nehmen, nicht hart codieren, falls es `BASE_URL` o. ä. gibt.
3. **Karte:** `#141820`, Rand 1 px `#262C36`, Radius 12 px, Innenabstand 40 px (mobil 24 px)
   - H1: 30/36 px bold `#F2F4F7`, mobil 26/32
   - „Hallo,“ + Lead: 16/24 px `#C3C8D1`
   - Button (bulletproof `<td>`): `#3D7BFF`, Text `#0E1116` 17 px bold, Padding 16×28, Radius 8 px, mobil volle Breite
   - Gültigkeits-Pill: `#1A1F27`, Text `#F5B84B` (Warning-Token) in Monospace 13 px, mit ●
   - Trennlinie 1 px `#262C36`
   - „Der Button geht nicht? Kopier diesen Link in deinen Browser:“ + URL in `#5A8FFF`, Monospace, `word-break:break-all`
   - Ignore-Hinweis 13/20 px `#8B93A1`
4. **Footer:** „Uni Scrims · Valorant-Scrims für Hochschulteams“ und Links zu Impressum, Datenschutz und Support (13 px `#8B93A1`, unterstrichen)

**Schrift:** `'Space Grotesk', Arial, Helvetica, sans-serif`; Monospace `'Courier New'`. Keine Webfonts laden.

## Dateien
- `E-Mail bestaetigen.html`: fertiges Template, Bestätigungs-Mail
- `Passwort zuruecksetzen.html`: fertiges Template, Passwort-Mail
