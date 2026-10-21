# Uni Scrims – Architektur (MVP)

> Grundlage: `SPEC.md`. Dieses Dokument beschreibt, **wie** das MVP gebaut wird.
> Stack: Node.js + TypeScript, Next.js (App Router), Better Auth, discord.js, PostgreSQL, Prisma, Docker auf eigenem VPS.

---

## 1. Anforderungen in Kurzform

**Funktional:** siehe `SPEC.md`, Abschnitt 7 (P0-1 bis P0-10).

**Nicht-funktional**

| Thema | Annahme / Ziel |
|---|---|
| Last | Klein: ≤ 100 Teams, ≤ 1.000 Nutzer, ein paar hundert Scrims pro Monat. Ein einzelner VPS reicht locker. |
| Latenz | Web-Seiten < 500 ms. Discord-Benachrichtigungen dürfen bis ~15 s verzögert sein, bei Retries auch länger. |
| Verfügbarkeit | Best effort. Kurze Ausfälle bei Deploys sind okay. |
| Zustellung | **At-least-once** mit seltenen Duplikaten. Dauerhaft fehlgeschlagene Nachrichten sind im Admin-Bereich sichtbar. **Kein fachlicher Zustandswechsel hängt am Versand einer Nachricht.** |
| Datenschutz | Uploads nie öffentlich erreichbar, Löschung nach Prüfung (spätestens nach 14 Tagen), keine Discord-Tokens über den Login hinaus, Kontolöschung vollständig. |
| Team / Zeit | 1 Person + Claude Code. 3–4 Wochen Vollzeit, neben dem Studium 6–8 Wochen. Daraus folgt: so wenige bewegliche Teile wie möglich. |

---

## 2. Überblick

```
                    ┌──────────────────────────── VPS (Docker Compose) ─────────────────────────────┐
                    │                                                                               │
 Browser ──HTTPS──► │  Caddy ──► web (Next.js)  ──────┐                                             │
                    │  (TLS)     - Seiten + Server     │                                             │
                    │              Actions             ▼                                             │
                    │            - Better Auth        PostgreSQL ◄────── bot (discord.js)  ◄────────► │ ◄──► Discord API
                    │              (Discord)           ▲  - Domain-Daten   - /setup                    │      (DMs, Channels)
                    │            - Upload + Janitor    │  - Outbox         - Outbox-Sender            │
                    │                  │               │                   - Sweeper (Zeit-Jobs)      │
                    │                  ▼               │                                              │
                    │            Volume: uploads/      │                                              │
                    └──────────────────────────────────┴──────────────────────────────────────────────┘
```

**Drei Prozesse, eine Datenbank:**

1. **web:** Next.js-App. Liefert die Website, schreibt alle fachlichen Änderungen in die DB und legt dabei Benachrichtigungen in eine **Outbox-Tabelle**. Enthält einen kleinen **Janitor** für Uploads, weil nur der Web-Container Zugriff auf das Upload-Volume hat. Ruft beim Login selbst die Discord-API für den Hub-Beitritt auf (braucht dafür ebenfalls `DISCORD_BOT_TOKEN`).
2. **bot:** discord.js-Prozess. Verschickt Outbox-Einträge, bietet `/setup` und führt zeitgesteuerte Zustandswechsel aus (Sweeper). **Keine weiteren Interaktionen:** Alle Buttons in Bot-Nachrichten sind Links in die Web-App.
3. **db:** PostgreSQL. Einzige Quelle der Wahrheit. Web und Bot reden **nie direkt miteinander**, nur über die DB.

Die gemeinsame Fachlogik (Zustandswechsel, Berechtigungen, Validierung) liegt in einem geteilten Package. So verhalten sich Web und Bot garantiert gleich.

---

## 3. Stack und Projektstruktur

### Versionen

In Phase 0 werden **exakte Versionen** in `package.json` gepinnt (ohne `^`/`~`) und hier eingetragen. Während des Baus wird kein Major-Upgrade gemacht.

| Komponente | Version | Hinweise |
|---|---|---|
| Node.js | 24 LTS (lokal 24.21.0) | Next.js 16 braucht ≥ 20.9. Docker-Base-Image `node:24-slim`. `engines: >=24 <25`. |
| pnpm | 12.14.0 | Workspaces, über Corepack (`packageManager` in der Root-`package.json`). Build-Skripte nur für Pakete in `allowBuilds` (`pnpm-workspace.yaml`). |
| Next.js / eslint-config-next | 16.4.2 | `middleware.ts` heißt jetzt `proxy.ts`. Wird hier **nicht** gebraucht: Auth-Checks laufen in Server Actions und Seiten. `serverActions.bodySizeLimit` liegt in 16.4.2 unter `experimental`. |
| React / React DOM | 19.3.1 | |
| Better Auth | 1.7.12 | Discord-Provider, DB-Sessions, Prisma-Adapter. **Die CLI ist jetzt das Paket `auth`** (`pnpm dlx auth@1.7.12 generate`); `@better-auth/cli` endet bei 1.4.x. |
| Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | 7.10.1 | Der npm-Tag `latest` zeigt auf 8-RC, darum explizit 7.10.1. Driver-Adapter `@prisma/adapter-pg`, `prisma.config.ts`, Client-Output außerhalb von `node_modules`, `.env` wird nicht automatisch geladen, `generate` und `seed` explizit aufrufen. **Client überall aus `packages/db` importieren, nie aus `@prisma/client`** (per ESLint-Regel erzwungen). |
| pg | 8.23.1 | Treiber für den Adapter |
| discord.js | 14.27.0 | v15 ist noch Pre-Release, nicht verwenden. Nur Intent `Guilds` nötig. |
| PostgreSQL | 17 | Docker-Image `postgres:17` |
| TypeScript | 6.0.3 | **Nicht 7.x:** typescript-eslint 8.72 unterstützt nur `<6.1`. |
| ESLint / @eslint/js | 9.39.5 | **Nicht 10.x:** `eslint-plugin-react` (über eslint-config-next) unterstützt ESLint 10 noch nicht. |
| typescript-eslint | 8.72.0 | |
| Prettier | 3.9.10 | |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 | |
| shadcn/ui (CLI `shadcn`) | 4.22.1 | Style `base-nova` (Base UI 1.9.0), Klassen-Merge über `cn` 0.5.0 |
| Vitest | 5.0.5 | |
| tsx | 4.23.15 | Bot-Runtime (Dev und Docker), Seed |
| dotenv | 18.0.8 | explizites Laden der Root-`.env` |
| Zod | 4.6.7 | |
| date-fns + @date-fns/tz | 4.4.0 / 1.5.0 | Zeitzonen (Startzeiten in `core/src/time.ts`). In Phase 2 installiert. |
| file-type | 22.2.0 | MIME-Prüfung über Magic Bytes. Wird erst in Phase 1 installiert. |

**Warum Better Auth statt Auth.js (next-auth):** Auth.js wird seit 2025 vom Better-Auth-Team nur noch mit Sicherheitsfixes gepflegt, und next-auth v5 ist weiterhin Beta. Für ein neues Projekt ist Better Auth der aktiv entwickelte Weg.

### Monorepo

```
uni-scrims/
├─ apps/
│  ├─ web/                 # Next.js (App Router, Tailwind, shadcn/ui)
│  │  ├─ app/
│  │  │  ├─ (public)/      # Landing, Impressum, Datenschutz
│  │  │  ├─ board/         # Scrim-Board
│  │  │  ├─ requests/[id]/ # Anfrage + Bewerbungen
│  │  │  ├─ scrims/        # Meine Scrims
│  │  │  ├─ scrims/[id]/   # Scrim-Detail + Feedback-Formular
│  │  │  ├─ team/          # Team anlegen, verwalten, Einladung
│  │  │  ├─ join/[code]/   # Einladungslink
│  │  │  ├─ verify/        # Upload der Immatrikulationsbescheinigung
│  │  │  ├─ account/       # Konto, Löschen
│  │  │  ├─ admin/         # Prüf-Queue, Streitfälle, Sperren, fehlgeschlagene Nachrichten, Bot-Status
│  │  │  └─ api/
│  │  │     ├─ auth/[...all]/           # Better Auth
│  │  │     ├─ admin/uploads/[id]/      # geschützter Datei-Abruf
│  │  │     └─ health/
│  │  ├─ instrumentation.ts # startet den Upload-Janitor
│  │  └─ lib/              # auth, Session-Helper, UI-Utils
│  └─ bot/
│     └─ src/
│        ├─ index.ts       # Client-Start, Registrierung von /setup
│        ├─ commands/      # /setup
│        ├─ outbox/        # Sender-Loop
│        ├─ sweeper/       # Zeit-Jobs
│        └─ messages/      # Embed-Builder pro Notification-Typ
├─ packages/
│  ├─ db/                  # Prisma-Schema, Migrationen, generierter Client, Seed, prisma.config.ts
│  └─ core/                # Fachlogik, Zod-Schemas, Rang-Utils, Berechtigungen, Konstanten (Map-Pool, Zeiten)
├─ docker/
│  ├─ docker-compose.yml
│  ├─ docker-compose.dev.yml
│  └─ Caddyfile
├─ SPEC.md
├─ ARCHITECTURE.md
└─ .env.example
```

**Regel:** `apps/*` enthalten keine Geschäftsregeln. Jede Zustandsänderung läuft über eine Funktion in `packages/core`.

**Zeit-Regel:** Jede `core`-Funktion, die mit Zeit arbeitet, bekommt `now: Date` als Parameter. Web und Bot übergeben `new Date()`, Tests einen festen Zeitpunkt. SQL vergleicht nur mit diesem Parameter, **nie mit `now()` der Datenbank.** Domänenmodelle haben deshalb **keine Zeit-Defaults** (`@default(now())`) im Schema: `core` setzt `createdAt`, `joinedAt` usw. aus `now`. Nur die Better-Auth-Modelle behalten ihre Defaults.

**Vollständige Liste der `core`-Funktionen** (Berechtigungen siehe §7):

| Bereich | Funktionen |
|---|---|
| Login | `handleDiscordLogin` (Hub-Beitritt über einen übergebenen Discord-Aufruf, Ergebnis speichern, Tokens löschen), `recordHubJoinResult`, `clearOAuthTokens` |
| Verifizierung | `submitVerification`, `decideVerification`, `autoRejectStaleVerifications`, `cleanupDecidedFiles`, `cleanupOrphanFiles`, `runUploadJanitor` (die drei Janitor-Schritte aus §5.2) |
| Teams | `createTeam`, `updateTeam`, `regenerateInvite`, `joinTeam`, `leaveTeam`, `transferCaptain`, `removeMember`, `dissolveTeam`, `retireTeamActivity` |
| Anfragen | `createRequest`, `deleteRequest`, `expireRequests` |
| Bewerbungen | `applyToRequest`, `withdrawApplication`, `confirmApplication` |
| Scrims | `cancelScrim`, `openFeedback`, `submitFeedback`, `resolveScrimOutcome` (rein), `resolveDeadlines`, `resolveDispute` |
| Lesen | `getDiscordId`, `findUserByDiscordId`, `getCurrentUser` (Header und Banner), `isAdmin`, `listUniversities`, `getVerificationStatus`, `listPendingVerifications`, `getVerificationFile`, `getMyTeam`, `getTeamByInviteCode`, `getBoard`, `getRequestForm` (Formular "Anfrage erstellen": alle Gründe, warum gerade keine Anfrage geht), `getRequestDetail`, `getScrimDetail`, `getMyScrims`, `getReliability` (für Listen als Batch `getReliabilities`), `isTeamReady`; nur für den Dev-Login: `listSeedUsers` |
| Moderation | `banUser`, `banTeam` |
| Konto | `deleteAccount` |
| Wartung | `purgeOldNotifications` |

Dazu kommen `permissions.ts` (§7), Zod-Schemas für Eingaben (`schemas.ts`), Rang-Utils (`ranks.ts`) Upload-Helfer (`uploads.ts`: Magic-Bytes-Prüfung, Speichern, Löschen), Startzeiten (`time.ts`: 15-Minuten-Raster, Berlin → UTC, Anzeige mit "(Nacht auf …)"), Anzeigenamen für Format und Feedback (`labels.ts`), Outbox-Einträge (`notifications.ts`) und Zeilensperren (`locks.ts`). `config/dev.ts` kapselt das Dev-Flag `DEV_LOGIN`.

**Konstanten** in `packages/core/config/`:
- `maps.ts`: Map-Pool als Liste. Zod validiert Anfragen dagegen. Keine DB-Tabelle.
- `timing.ts`: `FEEDBACK_OFFSET = 3 h`, `FEEDBACK_WINDOW = 72 h`, `REMINDER_OFFSETS = [24 h, 1 h]`, `LATE_CANCEL = 24 h`, `VERIFICATION_TTL = 14 Tage`, `MIN_REQUEST_LEAD = 30 min` (Mindestvorlauf einer Anfrage). Mit `DEV_TIME_OFFSETS=true` werden sie auf Minuten verkürzt (siehe §7).
- `uploads.ts`: `MAX_UPLOAD_BYTES = 5 MB`. Ohne Server-Importe, damit auch das Upload-Formular im Browser vorab prüfen kann (Dateien über dem Body-Limit erreichen `core` sonst nie).

---

## 4. Datenmodell

Alle Zeitpunkte als `timestamptz` in UTC (im Schema `@db.Timestamptz(3)`, auch in den Better-Auth-Modellen). Anzeige in `Europe/Berlin`. **Keine partiellen Indizes und kein Hand-SQL in Migrationen:** Alle Constraints sind normale Unique-Indizes im Prisma-Schema. Zur Laufzeit ist das **einzig erlaubte Roh-SQL** die Zeilensperre `SELECT … FOR NO KEY UPDATE` per `$queryRaw` in interaktiven Transaktionen (§5.3, §5.5, §5.6). `NO KEY UPDATE` statt `UPDATE`: Die Sperren schließen sich weiterhin gegenseitig aus, blockieren aber nicht die `FOR KEY SHARE`-Sperren der Fremdschlüssel-Prüfungen. Mit `FOR UPDATE` lief das Auflösen eines Teams (hält die Team-Zeile, sperrt dann dessen Anfragen) in einen Deadlock mit einer Bewerbung auf eine dieser Anfragen (hält die Anfrage, legt dann eine Notification mit Verweis auf das Team an). Alle anderen Abfragen laufen über den Prisma-Client. **Domänenmodelle ohne `@@map`**, damit die Tabellennamen im Roh-SQL den Modellnamen entsprechen (`"Scrim"`, `"ScrimRequest"`, `"Team"`). Sperren mehrerer Zeilen immer mit `ORDER BY id`. Ein Deadlock- oder Serialisierungsfehler zeigt im Web "Bitte erneut versuchen"; der Sweeper versucht es im nächsten Durchlauf ohnehin wieder.

### Enums

```
Rank            IRON | BRONZE | SILVER | GOLD | PLATINUM | DIAMOND | ASCENDANT | IMMORTAL | RADIANT
                (Reihenfolge = Wert 1–9, für Bereichsvergleiche)
VerifStatus     PENDING | APPROVED | REJECTED
ScrimFormat     ONE_MAP | TWO_MAPS | BO3
RequestStatus   OPEN | BOOKED | CANCELLED | EXPIRED
AppStatus       PENDING | ACCEPTED | REJECTED | WITHDRAWN
ScrimStatus     SCHEDULED | CANCELLED | AWAITING_FEEDBACK | COMPLETED | NO_SHOW | DISPUTED | UNCONFIRMED
FeedbackOutcome PLAYED | OPPONENT_NO_SHOW | WE_COULD_NOT
NotifType       siehe §6.1
NotifChannel    USER_DM | CAPTAIN_DM | TEAM_CHANNEL
NotifStatus     PENDING | SENT | FAILED | CANCELLED
```

### Tabellen

```
University
  id, name, city, slug (unique)

User                                     # Better-Auth-Tabelle "user" + zusätzliche Felder
  id, name, image                         # Better-Auth-Standardfelder (Username, Avatar)
  email                                   # ⚠ siehe §5.1, Platzhalter, nie für Versand genutzt
  universityId? ──► University            # gesetzt bei Freigabe
  universityOther?                        # Freitext bei "Andere"
  verifiedAt?                             # != null ⇒ verifiziert
  bannedAt?
  hubJoinFailedAt?                        # gesetzt, wenn der Server-Beitritt scheiterte
  dmFailedAt?                             # gesetzt bei Discord-Fehler 50007, zurückgesetzt bei erfolgreicher DM
  createdAt
  (Better-Auth-Tabellen session, account, verification gehören dazu)
  ⚑ Die vier Better-Auth-Modelle (User, Session, Account, Verification) sind mit `pnpm dlx auth@1.7.12 generate`
    erzeugt und behalten ihr `@@map` auf "user", "session", "account", "verification". Die Regel "ohne @@map" gilt nur für Domänenmodelle.
    Die Session-Tabelle speichert in 1.7.12 `ipAddress` und `userAgent` (Phase-1-Prüfpunkt 4 bleibt trotzdem zu bestätigen).
  ⚑ Keine eigene discordId-Spalte: Die Discord-User-ID steht in account.accountId (providerId = 'discord').
    Alle Stellen, die sie brauchen (Admin-Prüfung, Hub-Beitritt, Empfänger im Sender, /setup), lesen sie über getDiscordId(userId) bzw. findUserByDiscordId(id) in core.

VerificationRequest
  id, userId ──► User
  pendingUserId? (unique)                 # = userId solange PENDING, sonst null ⇒ max. 1 offene Prüfung
  universityId?, universityOther?         # Freitext max. 200 Zeichen
  filePath?                               # null nach Löschung
  mimeType, sizeBytes
  status (VerifStatus), rejectReason?     # Grund max. 500 Zeichen
  createdAt, decidedAt?, decidedById? ──► User   # null bei automatischer Ablehnung

Team
  id, name                                # 2–40 Zeichen (getrimmt)
  nameNormalized? (unique)                # lowercase + getrimmt ⇒ Name case-insensitiv eindeutig; null nach Auflösung
  tag                                     # 2–5 Zeichen, nicht eindeutig
  rank (Rank)                             # vom Captain änderbar
  game (default 'valorant')
  captainId ──► User (NOT NULL, nicht unique)  # einzige Wahrheit für die Captain-Rolle
  inviteCode? (unique)                    # 12 Zeichen, URL-sicher, kryptografisch zufällig; null nach Auflösung
  discordGuildId?, discordChannelId?
  bannedAt?, dissolvedAt?, createdAt
  ⚑ Team-Zustand: aktiv (beide null) | gesperrt (bannedAt) | aufgelöst (dissolvedAt). Gesperrt und aufgelöst sind im MVP final.

TeamMember
  teamId ──► Team, userId (unique) ──► User   # max. 1 Team pro User
  joinedAt
  ⚑ Der Captain ist immer auch Mitglied (in core erzwungen). Max. 10 Mitglieder (in core erzwungen).

ScrimRequest
  id, teamId ──► Team, createdById ──► User
  game, startsAt, format, rankMin, rankMax, maps (text[]), note?
  status (RequestStatus), createdAt
  Index: (status, startsAt)

Application
  id, requestId ──► ScrimRequest, teamId ──► Team
  message?, status (AppStatus), createdAt, decidedAt?
  unique(requestId, teamId)               # auch nach WITHDRAWN keine zweite Bewerbung

Scrim
  id, requestId (unique) ──► ScrimRequest
  hostTeamId ──► Team, guestTeamId ──► Team
  startsAt, format, maps
  feedbackOpensAt                         # = startsAt + FEEDBACK_OFFSET
  feedbackDeadline                        # = feedbackOpensAt + FEEDBACK_WINDOW
  status (ScrimStatus)
  cancelledByTeamId?, cancelledAt?, lateCancel (bool)   # bei Sperre/Auflösung: cancelledByTeamId = betroffenes Team, lateCancel = false
  noShowTeamId?                           # wer nicht erschienen ist
  resolvedById?, resolvedAt?              # Admin bei Streitfall
  createdAt
  Index: (status, startsAt), (status, feedbackDeadline)

ScrimFeedback
  id, scrimId ──► Scrim, teamId ──► Team  # das antwortende Team
  submittedById ──► User
  outcome (FeedbackOutcome)
  rating? (1–5, über den Gegner; nur bei PLAYED)
  createdAt
  unique(scrimId, teamId)

Notification   (Outbox)
  id, type (NotifType), channel (NotifChannel)
  targetUserId? ──► User                  # nur bei USER_DM
  targetTeamId? ──► Team                  # bei CAPTAIN_DM und TEAM_CHANNEL
  scrimId?, requestId?                    # für Relevanzprüfung und Massen-Stornierung
  payload (jsonb)                         # nur Darstellungsdaten
  scheduledFor                            # Default: now beim Anlegen (aus dem now-Parameter)
  status (NotifStatus), attempts, lastError?
  dedupeKey (unique)                      # <type>:<auslösende Entität laut §6.1>:<teamId|userId>:<channel>
  createdAt, sentAt?
  Index: (status, scheduledFor)

SystemStatus
  id ('bot'), heartbeatAt
```

### Warum so?

- **`Team.captainId` statt Rolle am Mitglied:** Genau ein Captain pro Team ist durch NOT NULL garantiert. "Ein Nutzer in max. 1 aktivem Team" garantiert `TeamMember.userId unique` zusammen mit der Regel "Captain ist immer Mitglied". `captainId` ist bewusst **nicht** unique, damit aufgelöste Teams ihren Captain behalten und er trotzdem ein neues Team gründen kann.
- **Aufgelöste Teams bleiben als Zeile stehen,** weil Scrims ihre Team-ID behalten. `nameNormalized` und `inviteCode` werden auf `null` gesetzt (Postgres erlaubt mehrere NULLs in einem Unique-Index), damit Name und Link frei bzw. ungültig sind. **Alle Lese- und Schreibpfade filtern zentral in `core` auf `dissolvedAt IS NULL`.**
- **`pendingUserId`:** Bildet "max. 1 offene Prüfung" mit einem normalen Unique-Index ab.
- **`verifiedAt` am User:** Board und "spielbereit" brauchen das ständig. Die Historie bleibt in `VerificationRequest`.
- **`feedbackOpensAt` und `feedbackDeadline` gespeichert:** Der Sweeper kann so mit einfachen indizierten Queries arbeiten. Werte werden bei der Buchung aus `timing.ts` berechnet.
- **Absagen durch Moderation** (Sperre, Auflösung) setzen immer `lateCancel = false` und zählen deshalb nie als kurzfristig. Ein eigenes Feld für den Grund gibt es bewusst nicht (es würde dem Gegner eine Sperre verraten).
- **Benachrichtigungen an Teams statt an Personen:** Der Empfänger (aktueller Captain) wird erst beim Senden aufgelöst. Eine Übertragung der Captain-Rolle nach der Buchung ist dadurch kein Problem.
- **`game` an Team und Anfrage:** Kostet nichts und hält P2 (weitere Games) offen.
- **Zuverlässigkeit wird nicht gespeichert,** sondern beim Lesen berechnet (§5.7).
- **Kontolöschung:** Der User wird anonymisiert statt hart gelöscht (`name = "Gelöschter Nutzer"`, `email` auf neuen Platzhalter, `image = null`, Sessions löschen, Uploads löschen, aus dem Team entfernen). So bleiben Team-Statistiken stimmig.
  - **Ungesperrter Nutzer:** auch die `account`-Zeile wird gelöscht. Ein späterer Discord-Login legt einen neuen User an.
  - **Gesperrter Nutzer:** die `account`-Zeile bleibt, aber nur mit `providerId` und `accountId` (ohne Tokens), und `bannedAt` bleibt gesetzt. Ein erneuter Login landet dadurch wieder beim gesperrten, anonymisierten User, und `requireUser` blockiert. So lässt sich eine Sperre nicht durch Löschen umgehen.

---

## 5. Kernabläufe im Detail

### 5.1 Login und Hub-Server ⚠️ wichtig

**Discord-Bots können Nutzern nur DMs schicken, wenn sie mindestens einen Server mit ihnen teilen** (sonst Fehler 50007). Darum gibt es einen offiziellen Uni-Scrims-Hub-Server.

**Login-Ablauf mit Better Auth:**
- Vor dem Login-Button eine Pflicht-Checkbox "mindestens 16 Jahre, Datenschutzerklärung gelesen". Erst dann wird der Button aktiv.
- Discord als Social Provider mit dieser Konfiguration:
  - `disableDefaultScope: true` und `scope: ["identify", "guilds.join"]`. Ohne `disableDefaultScope` kommt der `email`-Scope trotzdem mit.
  - `overrideUserInfoOnSignIn: true`. Der Default ist `false`; ohne diese Option werden Name und Avatar beim Login nicht aktualisiert.
  - `mapProfileToUser` setzt `email` auf den Platzhalter (siehe unten) und `name` auf den Discord-Username (`profile.username`, bei noch nicht umgestellten Konten mit Discriminator als `name#1234`). Ohne das nimmt Better Auth den Anzeigenamen (`global_name`), der weder eindeutig noch in Discord suchbar ist; Captains sollen den gegnerischen Captain aber darüber finden (P0-6). Achtung: Felder mit `input: false` werden von `mapProfileToUser` laut Doku ignoriert; deshalb gibt es keine eigene `discordId`-Spalte, die Discord-ID kommt aus `account.accountId`.
  - Die Zusatzfelder am User (`verifiedAt`, `bannedAt`, `universityId` usw.) als `additionalFields` mit `input: false` deklarieren, damit der Client sie nicht setzen kann. Gesetzt werden sie nur von `core`.
- Bei **jedem** Login (nicht nur beim ersten) versucht ein Better-Auth-Hook den Beitritt (für gesperrte Nutzer übersprungen): `PUT /guilds/{HUB_GUILD_ID}/members/{account.accountId}` mit dem Access-Token des Nutzers im Body und dem Bot-Token im Header. Antwort 201 heißt beigetreten, 204 heißt schon Mitglied. Voraussetzung: Der Bot ist im Hub und hat `CREATE_INSTANT_INVITE`.
- Der Beitritt läuft mit **5 s Timeout**. Jeder Fehler (auch ein Timeout) setzt nur `hubJoinFailedAt`; **der Login läuft immer weiter.**
- Bei Fehler wird `User.hubJoinFailedAt` gesetzt, sonst `null`. Häufigster Fehler: Der Nutzer ist schon in 100 Servern (200 mit Nitro), Discord-Fehler 30001.
- **Danach werden Access- und Refresh-Token aus der `account`-Tabelle entfernt.** Sie werden nur für den Beitritt gebraucht.
- `name` und `image` werden bei jedem Login aktualisiert.
- Der Login-Screen erklärt vorher, dass der Nutzer dem Server hinzugefügt wird und warum.

**In Phase 1 zu verifizieren (mit der gepinnten Version):**
1. Welcher Better-Auth-Hook nach dem OAuth-Callback zuverlässig das frische Access-Token liefert (z. B. Database-Hook auf `account` create/update oder ein After-Hook auf den Callback-Pfad), und dass Tokens danach gelöscht werden können, ohne die Session zu brechen.
2. **E-Mail-Pflichtfeld:** Better Auth erwartet am User eine E-Mail. Ohne `email`-Scope liefert Discord keine. Lösung (laut Doku der vorgesehene Weg): Platzhalter `<Discord-User-ID aus dem Profil>@users.uniscrims.invalid` per `mapProfileToUser`. Die Adresse wird nirgends angezeigt oder verwendet.
3. Sessions liegen in der DB. **Den Cookie-Cache nicht aktivieren** (er ist standardmäßig aus), damit Sperren und Kontolöschung sofort greifen.
4. Welche Felder die `session`-Tabelle in der gepinnten Version speichert (nach Kenntnis IP-Adresse und User-Agent). Das Ergebnis geht in die Datenschutzerklärung.

**Hinweis-Banner auf jeder Seite**, solange `hubJoinFailedAt` oder `dmFailedAt` gesetzt ist: "Wir können dir keine Discord-Nachrichten schicken." Darunter stehen der Hub-Einladungslink und der Hinweis, DMs von Servermitgliedern zu erlauben.

### 5.2 Verifizierung (Upload)

```
User lädt Datei hoch (Server Action)
  → Auth-Check, Nutzer noch nicht verifiziert (`verifiedAt` null), kein PENDING vorhanden, Checkbox bestätigt
  → echte Dateigröße ≤ 5 MB nach dem Einlesen prüfen (nicht nur Content-Length)
  → MIME über Magic Bytes prüfen (file-type): nur PDF, JPEG, PNG; HEIC mit Hinweis ablehnen
  → Datei schreiben: <UPLOAD_DIR>/<uuid>.<ext> (Rechte 0600); filePath speichert nur den Dateinamen
  → VerificationRequest(PENDING, pendingUserId = userId) anlegen
  → schlägt der DB-Insert fehl: Datei sofort löschen

Admin öffnet Queue → Vorschau über /api/admin/uploads/[id]
  → Route prüft Admin-Session
  → Header: Content-Disposition: inline, X-Content-Type-Options: nosniff,
    Cache-Control: no-store; bei Bildern zusätzlich Content-Security-Policy: sandbox
    (bei PDFs nur, wenn die Vorschau in Chrome und Firefox damit funktioniert, in Phase 1 testen)

Admin entscheidet (eine Transaktion)
  → status, decidedAt, decidedById, pendingUserId = null
  → bei APPROVED: User.verifiedAt + universityId setzen (bei "Andere" optional Seed-Hochschule zuordnen)
  → Notification VERIFICATION_RESULT
  → nach dem Commit: Datei löschen, filePath = null
```

**Body-Limit:** Server Actions haben standardmäßig ein Limit von 1 MB. In `next.config.ts` steht `experimental.serverActions.bodySizeLimit: '6mb'` (in Next 16.4.2 unter `experimental`). Zusätzlich in Caddy `request_body { max_size 6MB }`.

**`UPLOAD_DIR`** muss ein absoluter Pfad sein (`resolveUploadDir` in core bricht sonst ab), damit Web, Janitor und Tests nicht vom Arbeitsverzeichnis abhängen. Die Datei-Route `/api/admin/uploads/[id]` ist von den globalen Sicherheits-Headern (§7) ausgenommen und setzt eigene, darunter `frame-ancestors 'self'`. Sonst würde `frame-ancestors 'none'` die PDF-Vorschau im iframe der Queue blockieren.

**Janitor im Web-Prozess** (`instrumentation.ts`, beim Start und dann stündlich): Start nur, wenn `process.env.NEXT_RUNTIME === 'nodejs'`, mit einem Modul-Flag gegen Doppelstart (der Dev-Server ruft `register()` mehrfach auf), als sequenzielle Schleife wie in §6.2 (kein `setInterval`):
1. PENDING-Prüfungen älter als `VERIFICATION_TTL` (14 Tage) → automatisch REJECTED mit Grund "Prüfung nicht rechtzeitig erfolgt", Datei löschen, `VERIFICATION_RESULT` senden.
2. Requests mit Status ≠ PENDING, die noch einen `filePath` haben → Datei löschen, `filePath = null`.
3. Dateien im Upload-Ordner ohne zugehörigen DB-Eintrag, die älter als 24 h sind → löschen.

### 5.3 Anfragen und Bewerbungen

Alle Funktionen in diesem Abschnitt prüfen zuerst die Berechtigung laut §7 (aktueller Captain, selbst verifiziert, nicht gesperrt).

**Zeilensperre auf der Anfrage:** `applyToRequest`, `deleteRequest`, `confirmApplication` und `expireRequests` sperren in einer interaktiven Transaktion zuerst die `ScrimRequest`-Zeile (`SELECT … FROM "ScrimRequest" WHERE id = $1 FOR NO KEY UPDATE` per `$queryRaw`) und prüfen erst danach den Status. Dadurch laufen sie nacheinander, und eine PENDING-Bewerbung existiert nur, solange die Anfrage OPEN ist. Test: paralleles `applyToRequest` und `confirmApplication` hinterlässt keine PENDING-Bewerbung auf einer nicht offenen Anfrage.

- `createRequest`: Team spielbereit und aktiv; max. 5 offene Anfragen; Startzeit im 15-Minuten-Raster zwischen 10:00 und 01:45 Uhr Berliner Zeit, mindestens 30 Minuten nach `now`. Sperrt die `Team`-Zeile, damit parallele Aufrufe das Limit nicht überschreiten. Als offen zählen Anfragen mit OPEN und `startsAt > now`. Das Zeitfenster vermeidet nebenbei die Zeitumstellung (02:00–03:00). Das eingegebene Datum ist das Kalenderdatum des tatsächlichen Starts (01:00 am 22.10. = Nacht von Di auf Mi).
- `applyToRequest`: Team spielbereit und aktiv, nicht das Ersteller-Team; Anfrage OPEN und zukünftig; `unique(requestId, teamId)`. Liegt der Team-Rang außerhalb des Bereichs, wird die Bewerbung trotzdem angelegt; die UI zeigt einen Hinweis. Notification `APPLICATION_RECEIVED`.
- `withdrawApplication`: nur PENDING → WITHDRAWN.
- `deleteRequest`: nur OPEN und vor dem Start → CANCELLED; PENDING-Bewerbungen → REJECTED; `REQUEST_DELETED` an die Bewerber.
- **Board-Standardfilter:** `rankMin ≤ eigenerRang ≤ rankMax`. Die eigenen Anfragen stehen ungefiltert in einem eigenen Abschnitt.

### 5.4 Bestätigen (atomar)

`confirmApplication(requestId, applicationId, actingUserId)` in **einer** Transaktion:

1. Prüfen: Der handelnde Nutzer ist aktueller, verifizierter Captain des Ersteller-Teams. **Beide Teams** sind spielbereit und aktiv (nicht gesperrt, nicht aufgelöst). Sonst Fehler, die Bewerbung bleibt PENDING.
2. Anfrage-Zeile sperren (siehe §5.3), dann `UPDATE ScrimRequest SET status='BOOKED' WHERE id=$1 AND status='OPEN' AND startsAt > $now`. Wenn 0 Zeilen betroffen sind: Fehler "Anfrage nicht mehr offen".
3. `UPDATE Application SET status='ACCEPTED' WHERE id=$2 AND requestId=$1 AND status='PENDING'`. Wenn 0 Zeilen betroffen sind: Rollback.
4. Alle anderen PENDING-Bewerbungen dieser Anfrage auf REJECTED setzen.
5. `Scrim` anlegen mit `feedbackOpensAt` und `feedbackDeadline`. `requestId` ist unique, das ist der zweite Schutz gegen Doppelbuchung.
6. Notifications einfügen:
   - sofort: `SCRIM_BOOKED` für beide Teams (CAPTAIN_DM + TEAM_CHANNEL); `APPLICATION_REJECTED` für die abgelehnten Teams
   - geplant: `REMINDER_24H` und `REMINDER_1H` für beide Teams, **nur wenn der Zeitpunkt in der Zukunft liegt**; `FEEDBACK_PROMPT` zum `feedbackOpensAt`

### 5.5 Absage und Moderation

`cancelScrim(scrimId, actingUserId)`:
- Nur aktueller, verifizierter Captain eines der beiden Teams.
- `UPDATE Scrim SET status='CANCELLED', … WHERE id=$1 AND status='SCHEDULED' AND startsAt > $now`. Wenn 0 Zeilen betroffen sind: Fehler.
- `cancelledByTeamId` = Team des Handelnden, `lateCancel = (startsAt − now < LATE_CANCEL)`.
- Alle PENDING-Notifications mit dieser `scrimId` → CANCELLED. `SCRIM_CANCELLED` an das andere Team.
- Die zugehörige `ScrimRequest` bleibt `BOOKED` und wird nicht neu geöffnet.

`retireTeamActivity(teamId)` wird bei Team-Sperre und Team-Auflösung aufgerufen (eine Transaktion):
- Offene Anfragen → CANCELLED (+ `REQUEST_DELETED` an Bewerber)
- Eigene offene Bewerbungen → WITHDRAWN
- Zukünftige Scrims mit Status SCHEDULED → CANCELLED mit `cancelledByTeamId` = betroffenes Team, `lateCancel = false`, `SCRIM_CANCELLED` an das Gegnerteam

**Team-Lebenszyklus in `core`:**
- `leaveTeam`: Spieler jederzeit, **auch in gesperrten Teams** (sonst säßen die Mitglieder eines gesperrten Teams fest). Captain nur, wenn er das einzige Mitglied ist, dann folgt `dissolveTeam`.
- `transferCaptain`, `removeMember` (nur Captain, nicht sich selbst).
- `dissolveTeam`: `retireTeamActivity`, alle `TeamMember`-Zeilen löschen, `dissolvedAt = now`, `nameNormalized = null`, `inviteCode = null`. **Kein hartes Löschen**, weil Scrims die Team-ID behalten.
- `joinTeam`: nur über den `inviteCode` eines aktiven Teams, max. 10 Mitglieder, Nutzer in keinem anderen Team. Sperrt zuerst die Team-Zeile (`FOR NO KEY UPDATE`), damit zwei gleichzeitige Beitritte das Limit nicht überschreiten.
- `banUser`: `bannedAt` setzen, Sessions löschen. Ist er **kein** Captain, wird er aus dem Team entfernt. Ist er Captain, bleibt er Mitglied und Captain, und das Team wird mit `banTeam` gesperrt. **Entsperren gibt es im MVP nur manuell per DB** (im README beschrieben).
- `banTeam`: `bannedAt` setzen + `retireTeamActivity`.
- `deleteAccount`: wie in §4 beschrieben (gesperrte Nutzer behalten die `account`-Zeile ohne Tokens), zusätzlich alle Notifications mit `targetUserId` des Nutzers löschen; als Captain nur ohne weitere Mitglieder (dann `dissolveTeam`), sonst Fehler "Erst Captain übertragen". Der Nutzer wird **nicht** aus dem Hub-Server entfernt (kein `KICK_MEMBERS`-Recht); das steht in der Datenschutzerklärung.

### 5.6 Feedback und Auswertung

**Feedback läuft ausschließlich über die Web-App** (Scrim-Detailseite). Der Bot verschickt nur den Hinweis mit Link.

`submitFeedback(scrimId, outcome, rating?, actingUserId, now)` in **einer interaktiven Transaktion**:
1. Der Nutzer ist **aktueller**, verifizierter Captain von Host- oder Gastteam.
2. **Scrim-Zeile sperren:** `SELECT … FROM "Scrim" WHERE id = $1 FOR NO KEY UPDATE` per `$queryRaw`. Damit laufen parallele Feedbacks beider Captains und die Sweeper-Auswertung nacheinander.
3. `now ≥ startsAt`, `now < feedbackDeadline` und Status ∈ {SCHEDULED, AWAITING_FEEDBACK}. Bei SCHEDULED wird zuerst auf AWAITING_FEEDBACK gewechselt. Bei einem Endzustand → Fehler "Feedback bereits abgeschlossen". Nach der Frist → Fehler "Feedback-Frist abgelaufen"; die Auswertung übernimmt dann `resolveDeadlines`, damit das Ergebnis nicht davon abhängt, wann der Sweeper läuft.
4. `rating` nur bei PLAYED, dann Pflicht (1–5).
5. Insert in `ScrimFeedback`. Der Unique-Index verhindert eine zweite Antwort; die Antwort ist nicht änderbar.
6. Beide Feedbacks lesen. Liegen beide vor: `resolveScrimOutcome()` anwenden und das Ergebnis mit `UPDATE … WHERE id = $1 AND status = 'AWAITING_FEEDBACK'` schreiben.

`resolveDeadlines(now)` (Sweeper) geht für jeden fälligen Scrim genauso vor: Zeile sperren, Status erneut prüfen, Feedbacks lesen, auswerten, bedingt schreiben.

Test: Zwei parallele `submitFeedback` mit PLAYED ergeben sofort `COMPLETED`.

`resolveScrimOutcome(a, b, deadlineReached)` ist eine **reine Funktion** in `core`; `a` und `b` sind `{ teamId, outcome | null }` (die Team-ID wird für `noShowTeamId` bei fehlender Antwort gebraucht). Sie gibt `null` zurück (weiter warten) oder `{ status, noShowTeamId }`. Sie gilt symmetrisch:

| A | B | Ergebnis |
|---|---|---|
| PLAYED | PLAYED | `COMPLETED` |
| PLAYED | – (Frist) | `COMPLETED` |
| PLAYED | OPPONENT_NO_SHOW | `DISPUTED` |
| PLAYED | WE_COULD_NOT | `DISPUTED` |
| OPPONENT_NO_SHOW | – (Frist) | `NO_SHOW`, noShowTeam = B |
| OPPONENT_NO_SHOW | WE_COULD_NOT | `NO_SHOW`, noShowTeam = B |
| OPPONENT_NO_SHOW | OPPONENT_NO_SHOW | `DISPUTED` |
| WE_COULD_NOT | – (Frist) | `NO_SHOW`, noShowTeam = A |
| WE_COULD_NOT | WE_COULD_NOT | `UNCONFIRMED` |
| – | – (Frist) | `UNCONFIRMED` |
| eine Antwort | – (vor Frist) | `null` (warten) |

**Unit-Test pro Zeile, jeweils auch mit vertauschten Seiten**, plus Test "Antwort nach Endzustand wird abgelehnt".

**Streitfall:** `resolveDispute(scrimId, decision, adminId)` mit `decision` ∈ {`PLAYED` → COMPLETED, `NO_SHOW` + teamId → NO_SHOW, `UNCLEAR` → UNCONFIRMED}.

### 5.7 Zuverlässigkeit

`getReliability(teamId)` liefert:

- `played`: Scrims im Status `COMPLETED`, an denen das Team beteiligt war
- `noShows`: Scrims mit `NO_SHOW` und `noShowTeamId = team`
- `lateCancels`: Scrims mit `CANCELLED`, `lateCancel = true` und `cancelledByTeamId = team`
- `avgRating`: Durchschnitt der Bewertungen, die **andere** Teams über dieses Team abgegeben haben (nur aus `COMPLETED`-Scrims); `null` bei weniger als 3 Bewertungen

---

## 6. Bot

### 6.1 Notification-Typen (vollständig)

| Typ | Auslöser | Ziel / Kanal | Zeitpunkt | Entität im dedupeKey | Relevanzprüfung vor dem Senden |
|---|---|---|---|---|---|
| `VERIFICATION_RESULT` | Admin-Entscheidung oder Auto-Ablehnung | User, USER_DM | sofort | verificationId | Nutzer nicht gelöscht |
| `APPLICATION_RECEIVED` | `applyToRequest` | Ersteller-Team, CAPTAIN_DM | sofort | **applicationId** | Anfrage noch OPEN |
| `APPLICATION_REJECTED` | anderes Team bestätigt | Bewerber-Team, CAPTAIN_DM | sofort | applicationId | – |
| `REQUEST_DELETED` | `deleteRequest`, `retireTeamActivity` | Bewerber-Team, CAPTAIN_DM | sofort | requestId | – |
| `REQUEST_EXPIRED` | Sweeper | Bewerber-Team, CAPTAIN_DM | sofort | requestId | – |
| `SCRIM_BOOKED` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | sofort | scrimId | Scrim noch SCHEDULED, beide Teams aktiv |
| `SCRIM_CANCELLED` | `cancelScrim`, `retireTeamActivity` | jeweils anderes Team, CAPTAIN_DM + TEAM_CHANNEL | sofort | scrimId | – |
| `REMINDER_24H` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | startsAt − 24 h | scrimId | Scrim SCHEDULED, startsAt > now, beide Teams aktiv |
| `REMINDER_1H` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | startsAt − 1 h | scrimId | Scrim SCHEDULED, startsAt > now, beide Teams aktiv |
| `FEEDBACK_PROMPT` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | feedbackOpensAt | scrimId | Scrim in SCHEDULED/AWAITING_FEEDBACK und dieses Team hat noch nicht geantwortet |
| `CHANNEL_BROKEN` | Sender bei Channel-Fehler | betroffenes Team, CAPTAIN_DM | sofort | **ID der fehlgeschlagenen Notification** | – |

Bei allen Typen an Teams gilt zusätzlich: Team ist nicht aufgelöst.

Test: Zwei Bewerbungen auf dieselbe Anfrage erzeugen zwei `APPLICATION_RECEIVED`-Einträge.

Alle Nachrichten enthalten einen **Link-Button** zur passenden Seite (`PUBLIC_BASE_URL/...`). Der gegnerische Captain wird immer mit **Name und Mention** `<@discordId>` ausgegeben (die Mention kann auf fremden Servern als unbekannter Nutzer erscheinen). Alle Nachrichten senden mit `allowedMentions: { parse: [] }`, damit niemand gepingt wird.

**Nutzertext wird entschärft:** Teamnamen und andere Nutzereingaben laufen vor dem Einbetten durch `escapeMarkdown` aus discord.js (in `messages/*`), damit niemand über den Bot maskierte Links verschicken kann. Anfrage-Notizen und Bewerbungsnachrichten werden **nicht** in Bot-Nachrichten übernommen, nur auf der Website angezeigt.

**Bewusst akzeptiert:** Wird ein Team genau während einer Bestätigung gesperrt, kann ein Scrim mit einem gesperrten Team entstehen. Die Relevanzprüfung unterdrückt dann Bestätigung und Reminder; ohne Feedback endet der Scrim nach der Frist als unbestätigt.

`core` legt TEAM_CHANNEL-Einträge immer an. Der Sender verwirft sie mit Status CANCELLED, wenn das Team keinen Channel verknüpft hat.

### 6.2 Outbox-Sender (alle 5 s)

**Sender und Sweeper laufen als sequenzielle Schleifen**: Batch abarbeiten, `await`, dann 5 s (Sender) bzw. 60 s (Sweeper) schlafen. **Nie `setInterval`**, sonst überlappen sich langsame Durchläufe (Rate-Limits) und Einträge werden doppelt gesendet. Der Bot läuft als genau eine Instanz.

```
SELECT * FROM Notification
 WHERE status = 'PENDING' AND scheduledFor <= $now
 ORDER BY scheduledFor LIMIT 20
```

Für jeden Eintrag:

1. **Relevanzprüfung** laut Tabelle. Nicht mehr relevant → CANCELLED.
2. **Empfänger auflösen:** USER_DM → `targetUserId`; CAPTAIN_DM → aktueller `Team.captainId`; TEAM_CHANNEL → `Team.discordChannelId` (fehlt er, CANCELLED).
3. Embed aus `messages/<type>.ts` bauen und senden.
4. Erfolg: `SENT` + `sentAt`; bei DM `User.dmFailedAt = null`.
5. Fehler:
   - **50007 (DM nicht möglich):** `FAILED` ohne Retry, `User.dmFailedAt = now`.
   - **Channel-Fehler** (10003 Unknown Channel, 50001 Missing Access, 50013 Missing Permissions): `FAILED`, `Team.discordChannelId = null`, `CHANNEL_BROKEN` anlegen.
   - **Alles andere:** `attempts++`, `lastError`, `scheduledFor = now + 2^attempts Minuten` (1, 2, 4, 8, 16). Nach 5 Versuchen `FAILED`.
6. Reminder, deren `startsAt` beim Retry schon vorbei ist, werden CANCELLED.

**Duplikate:** Stürzt der Bot genau zwischen Senden und `SENT` ab, kann eine Nachricht doppelt kommen. Das ist akzeptiert (at-least-once).

### 6.3 Sweeper (jede Minute)

Alle Schritte sind idempotent und leiten sich nur aus dem DB-Zustand ab. Nach einem Bot-Ausfall holt der Sweeper alles nach.

1. `expireRequests(now)`: `ScrimRequest` OPEN mit `startsAt <= now` → `EXPIRED`; PENDING-Bewerbungen → REJECTED; `REQUEST_EXPIRED` an die Bewerber.
2. `openFeedback(now)`: `Scrim` SCHEDULED mit `feedbackOpensAt <= now` → `AWAITING_FEEDBACK`. **Unabhängig davon, ob der FEEDBACK_PROMPT zugestellt wurde.**
3. `resolveDeadlines(now)`: `Scrim` AWAITING_FEEDBACK mit `feedbackDeadline <= now` → auswerten mit Zeilensperre (siehe §5.6).
4. `purgeOldNotifications(now)`: Notifications mit Status ≠ PENDING, älter als 30 Tage, löschen (einmal pro Stunde reicht).
5. Heartbeat: `SystemStatus('bot').heartbeatAt = now`. Die Admin-Seite zeigt "Bot offline", wenn der Wert älter als 3 Minuten ist.

### 6.4 Slash-Command `/setup`

- Option `channel` (Text-Channel), Pflicht.
- Prüft: Der aufrufende Discord-User ist Captain eines nicht gesperrten Teams; der Bot hat in dem Channel `ViewChannel`, `SendMessages` und `EmbedLinks`.
- Speichert `discordGuildId` und `discordChannelId` und postet eine Test-Nachricht.
- Antwortet ephemeral mit Erfolg oder einer konkreten Fehlermeldung.

---

## 7. Web: Muster

- **Server Actions** für alle Mutationen. Jede Action läuft gleich ab: Session holen → Zod-Validierung → `core`-Funktion → `revalidatePath`. Es gibt keine separate REST-API.
- **Berechtigungen** zentral in `core/permissions.ts`: `requireUser` (eingeloggt, nicht gesperrt), `requireVerified`, `requireCaptain(teamId)` (aktueller Captain eines aktiven Teams; prüft zuerst die Mitgliedschaft, damit Nicht-Mitglieder für aktive, gesperrte und aufgelöste fremde Teams dieselbe Antwort bekommen und keine Sperre erfahren, §4), `requireActingCaptain(teamId)` (= `requireCaptain` + selbst verifiziert), `requireTeamMember(teamId)`, `requireTeamReady(teamId)`, `requireAdmin`. Admin = die Discord-ID aus `account.accountId` steht in `ADMIN_DISCORD_IDS`. Für Scrim-Aktionen zusätzlich `requireOwnActingCaptain` (für das eigene Team) und `requireScrimActingCaptain` (Captain eines der beiden Scrim-Teams). Die Lesefunktionen nutzen dafür die Prädikate `isCaptainOf`, `isScrimTeam`, `canSeeApplications`, `actingCaptainProblem` und `teamReadyProblem` aus `permissions.ts`, die Team-Regeln `isTeamActive`, `isVerifiedMember` und `isReadyCount` aus `readiness.ts` (Posten, Bewerben und Bestätigen brauchen ein spielbereites Team) sowie die Buchungsregeln `isRequestOpen`, `applicantTeamProblem`, `openRequestLimitProblem` und `requestPostingProblems` aus `requests.ts`, die auch die Mutationen verwenden. Ein `Problem` hat Art (`kind`), Fehlercode und Text. `requireCaptain`, `requireActingCaptain`, `requireTeamReady` und `createRequest` werfen solche Gründe, und die Seiten zeigen denselben Text; die übrigen `require*`-Prüfungen und die Prüfung des Bewerber-Teams (`applicantTeamProblem`) liefern einfache Texte. Unter der Team-Sperre entscheidet in `createRequest` allein `requestPostingProblems` (erster Grund wird geworfen); `getRequestForm` zeigt allen Mitgliedern alle Gründe, und die Seite verlinkt je nach Art dorthin, wo er sich beheben lässt (Team, Verifizierung, Board). Eine Sperre ist im MVP endgültig, deshalb ist sie dann der einzige Grund. Pro Aktion liefern die Lesefunktionen, ob sie erlaubt ist oder warum nicht (`getScrimDetail`: `canCancel`, `canGiveFeedback`; `getRequestDetail`: `apply`, `withdraw`, `remove`, `confirm` und `canConfirm` pro Bewerbung; `getRequestForm`: alle Gründe). Steuerelemente, die nur der Captain je nutzen kann, sehen andere Mitglieder nicht (Link „Anfrage erstellen“ auf dem Board, Teamverwaltung, „Anfrage löschen“). Beim Bewerben, Zurückziehen und Bestätigen und auf `/requests/new` sehen sie stattdessen den Grund („Das kann nur euer Captain.“ bzw. bei gesperrtem Team „Das Team ist gesperrt.“). So bieten Seiten nur Aktionen an, die `core` auch erlaubt, und zeigen sonst den Grund. Die Mutationen prüfen trotzdem selbst in ihrer Transaktion.
- **Sicherheits-Header** für alle Seiten per `headers()` in `next.config.ts`: `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. In Caddy zusätzlich `Strict-Transport-Security`. Kein vollständiges CSP im MVP.
- **Einladungslink ohne Login:** `join/[code]` leitet nicht eingeloggte Besucher zur Login-Seite (mit 16+-Checkbox) und nach dem Login per `callbackURL` zurück auf den Einladungslink (Parameter in Phase 1 mit der gepinnten Version prüfen).
- **Gesperrte und aufgelöste Teams** werden im Board ausgeblendet; ihre Einladungslinks funktionieren nicht.

### Berechtigungstabelle

| Aktion / Seite | Wer |
|---|---|
| Landing, Impressum, Datenschutz | alle |
| Board, Anfrage-Detail (ohne Bewerbungen), Team-Karten | eingeloggt, nicht gesperrt |
| Bewerbungen einer Anfrage | Mitglieder des Ersteller-Teams |
| Scrim-Detail, "Meine Scrims" | Mitglieder der beiden beteiligten Teams |
| Gegnerischer Captain | erst nach der Buchung, für Mitglieder beider Teams |
| Team anlegen, beitreten, verlassen; Upload | eingeloggt, nicht gesperrt |
| Konto löschen (`/account`, nur die Löschaktion) | eingeloggt, **auch gesperrt** |
| Team bearbeiten, Einladung erneuern, Captain übertragen, Mitglied entfernen | aktueller Captain (Verifizierung nicht nötig, damit er das Team aufbauen kann) |
| Anfrage erstellen/löschen, bewerben, zurückziehen, bestätigen, Scrim absagen, Feedback | aktueller Captain, **selbst verifiziert**, nicht gesperrt |
| Admin-Bereich, Datei-Abruf | Admin |

`leaveTeam` funktioniert für Nicht-Captains auch in gesperrten Teams. Nach Verlassen oder Auflösen sind vergangene Scrims für ehemalige Mitglieder nicht mehr sichtbar (gewollt).
- **Zeit:** Eingabe im Formular in Europe/Berlin, Umrechnung nach UTC in `core`. Keine Zeitlogik im Browser.
- **UI:** Tailwind + shadcn/ui, komplett auf Deutsch, mobilfreundlich.

### Entwicklung und Tests

| Env-Variable | Wirkung (nur bei `NODE_ENV=development`, in Production hart deaktiviert) |
|---|---|
| `DEV_LOGIN=true` | "Als Seed-Nutzer einloggen", damit du zwei Teams parallel testen kannst (normales + privates Fenster) |
| `DEV_DM_REDIRECT_DISCORD_ID` | Alle DMs gehen an diese Discord-ID (deinen Account), mit Präfix "[an: <Name>]". Nötig, weil Seed-Nutzer erfundene Discord-IDs haben. |
| `DEV_CHANNEL_ID` | Alle Team-Channel-Posts gehen in diesen Channel |
| `DEV_TIME_OFFSETS=true` | Nur für **manuelle** Tests. Zeiten in Minuten: Reminder 24 h → 3 min, 1 h → 1 min, `FEEDBACK_OFFSET` → 2 min nach Start, `FEEDBACK_WINDOW` → 5 min ab Feedback-Hinweis, Prüf-TTL → 10 min. Erlaubt außerdem Startzeiten ab 5 Minuten in der Zukunft. |

- **Automatische Tests kontrollieren die Zeit über den `now`-Parameter** (siehe Zeit-Regel in §3), nicht über `DEV_TIME_OFFSETS`.
- **Testdatenbank:** zweite Postgres-DB in `docker-compose.dev.yml` (App-DB auf Host-Port 5433, überschreibbar mit `DB_PORT`; Test-DB auf 5434 mit tmpfs, damit sie nicht mit einem lokal installierten Postgres auf 5432 kollidieren), `DATABASE_URL_TEST`. Der Vitest-`globalSetup` setzt `DATABASE_URL` auf `DATABASE_URL_TEST` und bricht ab, wenn beide gleich sind. Vor dem Testlauf `prisma migrate reset --force` gegen die Test-DB. Für DB-Tests in der Vitest-Config `fileParallelism: false`.
- **Unit-Tests** (Vitest) für alle `core`-Funktionen, insbesondere `resolveScrimOutcome` (jede Tabellenzeile, beide Richtungen), `confirmApplication`, `cancelScrim`, `retireTeamActivity`, `getReliability`.
- **Gleichzeitigkeit:** zwei parallele `confirmApplication`-Aufrufe auf derselben Anfrage ergeben genau einen Scrim; zwei parallele `submitFeedback` mit PLAYED ergeben sofort `COMPLETED`; paralleles `applyToRequest` und `confirmApplication` hinterlässt keine PENDING-Bewerbung auf einer nicht offenen Anfrage; zwei parallele `joinTeam` überschreiten das Limit von 10 nicht.

---

## 8. Infrastruktur

### docker-compose (Production)

| Service | Image / Build | Details |
|---|---|---|
| `caddy` | `caddy:2` | Reverse Proxy mit automatischem HTTPS. Ports 80/443. `request_body { max_size 6MB }`. |
| `web` | Build `apps/web` (Next.js `output: standalone`, `node:24-slim`) | `ENV HOSTNAME=0.0.0.0` und `ENV PORT=3000` im Web-Target (Docker setzt `HOSTNAME` sonst auf die Container-ID, und der Standalone-Server lauscht nicht auf localhost). Volume `uploads:/data/uploads`. Healthcheck per Node, weil `node:24-slim` weder `curl` noch `wget` enthält: `node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` |
| `bot` | Build `apps/bot` (`node:24-slim`) | Kein offener Port. Kein Zugriff auf das Upload-Volume. Läuft ohne eigenen Build-Schritt per `node --import tsx` (kein Bundler nötig). |
| `migrate` | **eigenes Build-Target** `migrate` im Dockerfile, basierend auf `packages/db` mit Prisma-CLI, `prisma.config.ts` und `migrations/`; installiert `openssl` für die Schema-Engine | Einmal-Job: `prisma migrate deploy`. Das Web-Image (standalone) enthält weder CLI noch Migrationen. `web` und `bot` starten erst danach (`depends_on: condition: service_completed_successfully`). |
| `db` | `postgres:17` | Volume `pgdata`. Port nicht nach außen freigeben. |

Alle Services mit Log-Rotation: `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }`.

**Stolperstelle Docker-Build:** Next.js `standalone` im pnpm-Monorepo mit dem Prisma-7-Client außerhalb von `node_modules`. Lösung: `outputFileTracingRoot` auf das Monorepo-Root setzen, `packages/db` und `packages/core` per `transpilePackages` einbinden, Prisma-Client im Build-Schritt explizit generieren. Der Client wird erst beim ersten Zugriff erzeugt, weil `next build` die Route-Module ohne `DATABASE_URL` lädt. Die Root-`.env` lädt `next.config.ts` per `dotenv`, weil Next selbst nur `apps/web/.env*` liest. **Der Docker-Build muss schon in Phase 0 einmal grün laufen.**

### Backups

Nächtlich `pg_dump` per Cron auf dem Host, verschlüsselt auf einen externen Speicher (z. B. Storage Box) kopieren und 14 Tage aufbewahren. Uploads werden **nicht** gesichert. Gelöschte Konten bleiben bis zum Ablauf in den Backups; das steht in der Datenschutzerklärung. **Hoster-Snapshots für den VPS deaktivieren**, sonst landen Uploads doch in Backups.

### Server

- Kleiner VPS (2 vCPU, 4 GB RAM) reicht.
- Firewall: nur 22, 80, 443. SSH nur mit Key.
- Updates: `unattended-upgrades`.

### Discord-Einrichtung (Anleitung im README, schon in Phase 0)

1. Discord-Application anlegen; OAuth2-Redirect auf `<BETTER_AUTH_URL>/api/auth/callback/discord` (lokal und Production).
2. Bot-User anlegen. Keine privilegierten Intents nötig.
3. Hub-Server anlegen, Bot einladen mit `CREATE_INSTANT_INVITE`, `ViewChannel`, `SendMessages`, `EmbedLinks`. Im Hub **kein Regel-Screening** (Membership Screening) und eine **niedrige Verifizierungsstufe**, damit per `guilds.join` hinzugefügte Nutzer sofort DMs bekommen können (nicht verifiziert, in Phase 1 testen).
4. Einladungslink für Team-Server generieren (Scopes `bot` + `applications.commands`, Rechte `ViewChannel`, `SendMessages`, `EmbedLinks`).
5. Einen privaten Dev-Channel für `DEV_CHANNEL_ID` anlegen.

### Env-Variablen (`.env.example`)

```
DATABASE_URL=
DATABASE_URL_TEST=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://deine-domain.de
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
HUB_GUILD_ID=
HUB_INVITE_URL=
ADMIN_DISCORD_IDS=123,456
UPLOAD_DIR=/data/uploads
PUBLIC_BASE_URL=https://deine-domain.de   # für Links in Bot-Nachrichten
DEV_LOGIN=false
DEV_DM_REDIRECT_DISCORD_ID=
DEV_CHANNEL_ID=
DEV_TIME_OFFSETS=false
```

### Monitoring

`docker compose logs`, der Bot-Heartbeat und die Liste fehlgeschlagener Nachrichten auf der Admin-Seite. Optional Uptime Kuma als zusätzlicher Container, der `/api/health` prüft.

---

## 9. Trade-offs

| Entscheidung | Gewählt | Alternative | Warum |
|---|---|---|---|
| Kommunikation Web → Bot | Outbox-Tabelle + Polling alle 5 s | Redis-Queue, Postgres `LISTEN/NOTIFY`, HTTP-Aufruf | Kein zusätzlicher Dienst, überlebt Neustarts, Notification entsteht in derselben Transaktion wie die Fachänderung. |
| Feedback | Web-Formular, Discord nur mit Link | Buttons, Sterne und Modal im Bot | Spart alle Interaction-Handler und eine ganze Fehlerklasse; funktioniert auch bei blockierten DMs. Kostet den Nutzer einen Klick. |
| Zeit-Jobs | Sweeper im Bot, Upload-Janitor im Web | Eigener Worker, pg-boss, Cron | Kein zusätzlicher Container. Jeder Job läuft dort, wo er die nötigen Zugriffe hat. Ausfälle werden beim Neustart nachgeholt. |
| API | Server Actions | REST/tRPC | Weniger Code. Eine API lohnt sich erst mit einer zweiten Client-App. |
| Auth | Better Auth mit DB-Sessions | next-auth v5 (Beta, nur Sicherheitsfixes), JWT-Sessions | Aktiv gepflegt. DB-Sessions ohne Cookie-Cache, damit Sperren sofort greifen. Risiko: E-Mail-Pflichtfeld und Hook für den Hub-Beitritt müssen in Phase 1 verifiziert werden. |
| ORM | Prisma 7 ohne partielle Indizes | Drizzle, Prisma mit Preview-Features | Viel Doku. Constraints über Modellierung statt Hand-SQL vermeiden Drift. |
| Uploads | Lokales Docker-Volume | S3-kompatibler Speicher | Dateien leben kurz; keine Daten bei Drittanbietern. |
| Zuverlässigkeit | Beim Lesen berechnen | Gecachte Zähler | Keine Inkonsistenzen; Datenmenge trivial. |
| DMs | Hub-Server mit `guilds.join` bei jedem Login | Nur Team-Channels | Macht DMs in den meisten Fällen möglich. Die Zustellung bleibt aber vom Nutzer abhängig (Serverlimit, DM-Einstellungen). Darum gibt es Banner und Team-Channel als Fallback. |

---

## 10. Was du später überdenken solltest

- **Bot-Verifizierung:** Unverifizierte Bots können nicht in mehr als 100 Servern sein. Ab ~70 Servern (Hub + Team-Server) die Verifizierung bei Discord beantragen (möglich ab 75 Servern, erfordert Ausweis).
- **Mehr als ~50 offene Prüfungen gleichzeitig:** weitere Prüfer in der UI (P1), Semester-Ablauf der Verifizierung (P1).
- **Mehrere Bot-Instanzen:** Dann braucht der Outbox-Sender `FOR UPDATE SKIP LOCKED`.
- **Zuverlässigkeit als gecachte Werte**, falls das Board langsam wird.
- **Eigener Worker-Container**, wenn die Zeit-Jobs schwerer werden.
- **Weitere Games:** Ränge und Map-Pool pro Game auslagern statt als Enum bzw. Konstante.
- **Riot RSO:** neue Tabelle `RiotAccount` am User; die Rang-Felder werden dann automatisch befüllt.

---

## 11. Bau-Reihenfolge für Claude Code

Jede Phase endet mit lauffähigem Stand, grünen Tests und einem Commit. **Erst zur nächsten Phase, wenn das "Fertig wenn" erfüllt ist.**

**Phase 0: Gerüst**
- pnpm-Monorepo, TypeScript strict, ESLint + Prettier, Vitest; exakt gepinnte Versionen laut §3, in die Tabelle eintragen
- `packages/db`: komplettes Prisma-Schema aus §4 inkl. Better-Auth-Tabellen (mit der Better-Auth-CLI erzeugen, den Befehl in der gepinnten Version prüfen, und ins Schema übernehmen; geprüft: `pnpm dlx auth@1.7.12 generate --config <auth.ts> --output <schema.prisma>`); Prisma 7 mit `@prisma/adapter-pg`, `prisma.config.ts`, explizites Laden der `.env`, Client-Output in `packages/db`, Scripts für `generate`, `migrate` und `seed`
- Seed: Hochschul-Liste (große Universitäten, alle DHBW-Standorte, bekannte Uniliga-Valorant-Hochschulen), 2 Test-Teams mit je 5 verifizierten Seed-Nutzern
- `packages/core/config`: Map-Pool und `timing.ts` inkl. `DEV_TIME_OFFSETS`
- `docker-compose.dev.yml` mit App-DB und Test-DB
- Dockerfile mit den Targets `web`, `bot` und `migrate`; der Web-Build läuft einmal grün (siehe §8 Stolperstelle), nachgewiesen über `/api/health`, das den Prisma-Client nutzt
- README: Discord-Einrichtung laut §8
- *Fertig wenn:* `pnpm dev` startet Web und Bot (Bot loggt sich ein), `pnpm db:seed` läuft, `pnpm test` läuft gegen die Test-DB, `docker build` für alle drei Targets ist grün und `docker compose run --rm migrate` gegen eine leere DB ist grün.

**Phase 1: Login, Verifizierung, Teams** (die größte Phase, realistisch 1,5 Wochen Vollzeit)
- 16+-Checkbox vor dem Login; Better Auth mit Discord laut §5.1 (`disableDefaultScope`, `identify guilds.join`, `overrideUserInfoOnSignIn`, `mapProfileToUser`, `additionalFields`), Hub-Beitritt bei jedem Login, Token-Löschung, Cookie-Cache nicht aktivieren; Banner bei `hubJoinFailedAt`/`dmFailedAt`; Dev-Login. **Die vier Prüfpunkte aus §5.1 zuerst verifizieren und das Ergebnis ins README schreiben.**
- Upload-Flow mit Checkbox, Body-Limit, Magic-Bytes-Prüfung; Admin-Queue mit Checkliste; geschützter Datei-Abruf (PDF-Vorschau mit/ohne `sandbox` in Chrome und Firefox testen); Löschen nach Entscheidung; Janitor
- Teams: anlegen, bearbeiten (Name, Kürzel, Rang), Einladungslink, beitreten, verlassen, Captain übertragen, Mitglieder entfernen, auflösen, max. 10 Mitglieder, Anzeige "spielbereit". `retireTeamActivity` ist hier noch ein **Stub** (es gibt noch keine Anfragen/Scrims); die echte Umsetzung samt Tests kommt in Phase 2.
- Berechtigungen laut Tabelle in §7 für alle bis hierhin gebauten Seiten und Aktionen
- Dev-Skript `pnpm bot:test-dm <discordId>`, das einmalig eine DM schickt; prüft die Hub-Annahmen aus §5.1 und §8 (kein Screening, niedrige Verifizierungsstufe)
- *Fertig wenn:* Du kannst dich mit echtem Discord-Account einloggen und landest auf dem Hub-Server; `getDiscordId` liefert deine Discord-ID, und ein Account aus `ADMIN_DISCORD_IDS` sieht den Admin-Bereich; ein nicht eingeloggter Besucher eines Einladungslinks landet nach dem Login wieder dort; `pnpm bot:test-dm` erreicht dich per DM; in der `account`-Tabelle liegen danach keine Tokens; Name und Avatar aktualisieren sich beim nächsten Login; du kannst hochladen, als Admin freigeben (die Datei ist danach physisch weg) und ein Team mit einem zweiten Account per Link füllen; nach Auflösen des Teams kannst du ein neues mit demselben Namen gründen.

**Phase 2: Board, Bewerbungen, Scrims, Feedback**
- `core`: alle Funktionen der Bereiche Anfragen, Bewerbungen, Scrims und Lesen aus §3 sowie die vollständige `retireTeamActivity`, alle mit Tests (siehe §7) und mit `now`-Parameter
- Seiten: Board mit Filtern, Anfrage-Detail mit Bewerbungen und Rang-Hinweis, Meine Scrims, Scrim-Detail mit Feedback-Formular
- Notifications werden bereits in die Outbox geschrieben (noch ohne Sender)
- *Fertig wenn:* Zwei Seed-Teams buchen per Bewerbung und Bestätigung einen Scrim, sagen einen anderen ab und geben Feedback; die Auswertung entspricht der Tabelle; die Outbox enthält genau die erwarteten Einträge laut §6.1; alle Gleichzeitigkeitstests aus §7 sind grün; ein unverifizierter Captain wird bei Scrim-Aktionen abgewiesen.

**Phase 3: Discord-Bot**
- Outbox-Sender mit Embeds für alle Typen aus §6.1, Empfänger-Auflösung, Relevanzprüfung, Fehlerbehandlung und Backoff
- `/setup` mit Rechte-Prüfung
- Sweeper laut §6.3 inkl. Notification-Aufräumen und Heartbeat; Sender und Sweeper als sequenzielle Schleifen (kein `setInterval`)
- *Fertig wenn:* Mit `DEV_TIME_OFFSETS=true`, `DEV_DM_REDIRECT_DISCORD_ID` und `DEV_CHANNEL_ID` läuft ein kompletter Scrim durch: Bewerbungs-DM, Buchung, beide Reminder, Feedback-Hinweis, Feedback über den Link, Auswertung. Alles kommt in deinem Discord an. Nach einem Bot-Neustart mitten im Ablauf wird nichts verpasst.

**Phase 4: Admin, Datenschutz, Deployment**
- Streitfälle entscheiden (inkl. Anzeige "Streitfall" auf der Scrim-Seite), Nutzer/Teams sperren (mit Kaskaden laut §5.5), Liste fehlgeschlagener Nachrichten, Bot-Status; README-Abschnitt "Entsperren per SQL"
- Konto löschen (Anonymisierung laut §4, Captain-Regeln laut §5.5), Impressum- und Datenschutz-Seiten aus Config
- Production-Compose mit Caddy, Migrate-Job und Log-Rotation; Backup-Skript; README mit Deploy-Anleitung für den VPS
- **Vorher erledigt (SPEC §9, offene Punkte 1–4):** Impressum, Datenschutzerklärung, AVV, Hoster-Snapshots aus
- *Fertig wenn:* Production läuft auf deiner Domain mit HTTPS, und zwei echte Discord-Accounts (z. B. du und ein Teammitglied) verifizieren sich, buchen einen Scrim und geben Feedback.
