# Uni Scrims

Scrim-Plattform für Valorant-Teams deutscher Hochschulen: Next.js-Web-App + discord.js-Bot + PostgreSQL im pnpm-Monorepo.

## Quelle der Wahrheit

- `SPEC.md`: **was** gebaut wird (Anforderungen, Flows, Entscheidungen).
- `ARCHITECTURE.md`: **wie** es gebaut wird (Datenmodell, Abläufe, Stack, Phasen in §11).
- Vor jeder Phase beide Dateien lesen. Bei Widerspruch zwischen Code und Doku gilt die Doku. Ist die Doku falsch oder unklar: **fragen**, nicht raten.
- Weicht die Umsetzung bewusst von der Doku ab (z. B. weil eine Annahme aus §5.1 nicht stimmt), die betroffene MD-Datei **im selben Commit** anpassen.

## Arbeitsweise

- Es wird immer genau **eine Phase** aus ARCHITECTURE §11 umgesetzt. Nichts aus späteren Phasen vorziehen.
- **Keine Features erfinden.** Alles, was nicht in SPEC P0 steht, gehört nicht ins MVP. Ideen als Notiz an den Nutzer, nicht als Code.
- Eine Phase ist erst fertig, wenn ihr "Fertig wenn" erfüllt ist und `pnpm test` sowie `pnpm lint` grün sind. Dann committen und auf das OK des Nutzers warten.
- Commits klein und thematisch, Commit-Messages auf Englisch.
- Am Ende jeder Phase `/code-review` laufen lassen. Nur Findings beheben, die Korrektheit oder die Anforderungen aus SPEC/ARCHITECTURE betreffen; Stilvorschläge sind optional.
- Beim Kompaktieren immer erhalten: aktuelle Phase, Liste der geänderten Dateien, offene Prüfpunkte, Test-Befehle.

## Technische Regeln (Kurzfassung, Details in ARCHITECTURE.md)

- Geschäftslogik nur in `packages/core`. `apps/web` und `apps/bot` rufen nur `core`-Funktionen auf.
- Jede zeitabhängige `core`-Funktion bekommt `now: Date` als Parameter. In SQL nie `now()` der Datenbank verwenden.
- Prisma-Client immer aus `packages/db` importieren, nie aus `@prisma/client`.
- Einziges erlaubtes Roh-SQL: Zeilensperren `SELECT … FOR UPDATE` in interaktiven Transaktionen. Domänenmodelle ohne `@@map`.
- Schleifen in Bot und Janitor sequenziell (`await` + sleep), **nie `setInterval`**.
- Versionen exakt pinnen (ohne `^`/`~`), keine Major-Upgrades während des Baus.
- Berechtigungen immer über `core/permissions.ts` laut Tabelle in ARCHITECTURE §7.
- UI-Texte auf Deutsch, mobilfreundlich. Code, Variablen und Kommentare auf Englisch.

## Befehle

pnpm kommt über Corepack (`corepack enable`). Lokale DBs: `docker compose -f docker/docker-compose.dev.yml up -d db db-test` (App-DB :5433, Test-DB :5434).

- `pnpm dev`: Web (:3000) und Bot lokal starten
- `pnpm test`: Vitest; setzt vorher die Test-DB per `prisma migrate reset --force` zurück (Prisma verlangt dafür bei KI-Agenten die ausdrückliche Zustimmung des Nutzers über `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`)
- `pnpm lint`: ESLint + Prettier-Check + `tsc --noEmit` in allen Paketen
- `pnpm format`
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`
- `docker build --target web|bot|migrate .`, `docker compose -f docker/docker-compose.dev.yml run --rm migrate`
