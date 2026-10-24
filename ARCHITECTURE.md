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
| nodemailer | in Phase 7 exakt gepinnt (mindestens zwei Wochen alte Version) | Versand der Konto-Mails per SMTP (§5.8) |
| uqr | 0.1.3 (Phase 8) | QR-Code der 2FA-Einrichtung als SVG, ohne Abhängigkeiten (§5.9) |

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
│  │  │  ├─ admin/         # Prüf-Queue, Streitfälle, Sperren, fehlgeschlagene Nachrichten, Bot-Status, Statistik, Rollen (ab Phase 8)
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
| Login | `handleDiscordLogin` (Hub-Beitritt über einen übergebenen Discord-Aufruf, Ergebnis speichern, Tokens löschen), ab Phase 7 `discordLoginUserInfo` (Profil für Better Auths Discord-Login, §5.8) und `accountCreateProblem` (Prüfung vor jeder neuen `account`-Zeile), `recordHubJoinResult`, `clearOAuthTokens`, `restoreDeletedUser` (Login, der eine Löschung überholt hat, zurücknehmen, §5.1) |
| Verifizierung | `submitVerification`, `decideVerification`, `autoRejectStaleVerifications`, `cleanupDecidedFiles`, `cleanupOrphanFiles`, `runUploadJanitor` (die drei Janitor-Schritte aus §5.2), `removeFilesAfterCommit` (Dateien nach Entscheidung, Ablehnung oder Sperre löschen) |
| Teams | `createTeam`, `updateTeam`, `regenerateInvite`, `joinTeam`, `leaveTeam`, `transferCaptain`, `removeMember`, `setMemberRole` (Phase 5), `dissolveTeam`, `retireTeamActivity`, `retirementRequestIds`, `linkTeamChannel` (`/setup`), ab Phase 10 `setTeamLogo`, `removeTeamLogo`, `getTeamLogo`, `processTeamLogo` (Bild prüfen, zuschneiden, neu kodieren, §5.11) |
| Anfragen | `createRequest`, `deleteRequest`, `expireRequests` |
| Bewerbungen | `applyToRequest`, `withdrawApplication`, `confirmApplication` |
| Scrims | `cancelScrim`, `openFeedback`, `submitFeedback`, `resolveScrimOutcome` (rein), `resolveDeadlines`, `resolveDispute` |
| Lesen | `getDiscordId`, `findUserByDiscordId`, `getCurrentUser` (Header und Banner, ab Phase 8 mit `staffRole`), `listUniversities`, `getVerificationStatus`, `listPendingVerifications`, `getVerificationFile`, `getMyTeam`, `getTeamByInviteCode`, `getBoard`, `getRequestForm` (Formular "Anfrage erstellen": die Gründe, warum gerade keine Anfrage geht), `getRequestDetail`, `getScrimDetail`, `getMyScrims`, `getReliability` (für Listen als Batch `getReliabilities`), `isTeamReady`; für den Admin-Bereich: `listDisputes`, `listFailedNotifications`, `getBotStatus`, `searchModerationTargets` (Suche auf der Sperren-Seite), `getSuccessMetrics` (Statistik-Seite, Phase 6); nur für den Dev-Login: `listSeedUsers` |
| Moderation | `banUser`, `banTeam`, ab Phase 10 `removeTeamLogoAsAdmin` (Bausteine ohne Berechtigungsprüfung in einer Transaktion: `banUserInTx`, `banTeamInTx`, auch für `reapplyModeration`) |
| Rollen (Phase 8) | `listStaff`, `findStaffCandidates` (Suche auf der Rollen-Seite), `setStaffRole`, `resetStaffTwoFactor`, `setOperator` (nur das Skript, ohne Berechtigungsprüfung), `hasStaffRole` (Staff bekommt Sessions nur über Passwort und Code), `finishTwoFactorSetup` (nach dem Einschalten der 2FA alle Sessions beenden), `endStaffSessions` (Baustein in einer Transaktion: Sessions und 2FA einer Person entfernen, auch für `reapplyModeration`), `staffArea` (welche Admin-Seiten eine Rolle sieht) |
| Konto | `deleteAccount`, `getAccount` (Konto-Seite: ob Löschen gerade geht), `finishInterruptedDeletions` (Sweeper: eine solche Rücknahme nachholen); ab Phase 7 `accountSetupStep` (was dem Konto noch fehlt, §5.8), `completeAccount` (Altkonto vervollständigen), `updateRealName`, `handOverCaptain` (Captain-Rolle von der Konto-Seite, für unvollständige Konten); ab Phase 9 `exportAccountData` (Datenauskunft, §5.10) |
| Bot | `deliverNotification`, `deliverDueNotifications` (Outbox-Sender §6.2; der Bot übergibt die Sendefunktion `Deliver`, wie beim Hub-Beitritt), `runSweeper` (Schritte 1–7 aus §6.3), `recordHeartbeat` (Heartbeat beider Bot-Schleifen) |
| Wartung | `purgeOldNotifications`, `purgeExpiredSessions`, `purgeStaleOAuthTokens`, `reapplyModeration` (Sperren und Löschungen nach dem Einspielen eines Backups nachziehen, §8) |

Dazu kommen `permissions.ts` (§7), Zod-Schemas für Eingaben (`schemas.ts`), Rang-Utils (`ranks.ts`) Upload-Helfer (`uploads.ts`: Magic-Bytes-Prüfung, Speichern, Löschen), Startzeiten (`time.ts`: 15-Minuten-Raster, Berlin → UTC, Anzeige mit "(Nacht auf …)"), Anzeigenamen für Format und Feedback (`labels.ts`), Outbox-Einträge mit einem Zod-Schema für den Payload jedes Typs (`notifications.ts`), Outbox-Sender (`outbox.ts`: Relevanz, Empfänger, Fehlerklassen, Backoff), Sweeper (`sweeper.ts`), Zeilensperren (`locks.ts`) und die Kennzahlen der Statistik-Seite (`stats.ts`, Phase 6). `config/dev.ts` kapselt die Dev-Schalter `DEV_LOGIN`, `DEV_DM_REDIRECT_DISCORD_ID` und `DEV_CHANNEL_ID`.

**Konstanten** in `packages/core/config/`:
- `maps.ts`: Map-Pool als Liste. Zod validiert Anfragen dagegen. Keine DB-Tabelle.
- `timing.ts`: `FEEDBACK_OFFSET = 3 h`, `FEEDBACK_WINDOW = 72 h`, `REMINDER_OFFSETS = [24 h, 1 h]`, `LATE_CANCEL = 24 h`, `VERIFICATION_TTL = 14 Tage`, `MIN_REQUEST_LEAD = 30 min` (Mindestvorlauf einer Anfrage). Mit `DEV_TIME_OFFSETS=true` werden sie auf Minuten verkürzt (siehe §7).
- `uploads.ts`: `MAX_UPLOAD_BYTES = 5 MB`, ab Phase 10 `MAX_LOGO_BYTES = 2 MB`. Ohne Server-Importe, damit auch das Upload-Formular im Browser vorab prüfen kann (Dateien über dem Body-Limit erreichen `core` sonst nie).

---

## 4. Datenmodell

Alle Zeitpunkte als `timestamptz` in UTC (im Schema `@db.Timestamptz(3)`, auch in den Better-Auth-Modellen). Anzeige in `Europe/Berlin`. **Keine partiellen Indizes und kein Hand-SQL in Migrationen:** Alle Constraints sind normale Unique-Indizes im Prisma-Schema. Zur Laufzeit ist das **einzig erlaubte Roh-SQL** die Zeilensperre `SELECT … FOR NO KEY UPDATE` per `$queryRaw` in interaktiven Transaktionen (§5.3, §5.5, §5.6). `NO KEY UPDATE` statt `UPDATE`: Die Sperren schließen sich weiterhin gegenseitig aus, blockieren aber nicht die `FOR KEY SHARE`-Sperren der Fremdschlüssel-Prüfungen. Mit `FOR UPDATE` lief das Auflösen eines Teams (hält die Team-Zeile, sperrt dann dessen Anfragen) in einen Deadlock mit einer Bewerbung auf eine dieser Anfragen (hält die Anfrage, legt dann eine Notification mit Verweis auf das Team an). Alle anderen Abfragen laufen über den Prisma-Client. **Domänenmodelle ohne `@@map`**, damit die Tabellennamen im Roh-SQL den Modellnamen entsprechen (`"Scrim"`, `"ScrimRequest"`, `"Team"`); einzige Ausnahme ist `lockUser` auf der Better-Auth-Tabelle `"user"`. Sperren mehrerer Zeilen immer nach `id` sortiert. **Sperrreihenfolge in allen Transaktionen:** Team (mehrere nach `id`, nur `confirmApplication`) → User (mehrere nach `id`, nur `decideVerification`: geprüfter Nutzer und Admin) → ScrimRequest (mehrere nach `id`: `retireTeamActivity`, `deleteAccount`) → Scrim (mehrere nach `id`: `retireTeamActivity`); Zeilen von `VerificationRequest`, `Application` und `Notification` erst danach. Eine `Application`-Zeile ändert nur, wer die Anfrage der Bewerbung gesperrt hat (Ausnahme `withdrawApplication`, das nur diese eine Zeile ändert und keine weitere Sperre hält). Die User-Zeile sperrt `lockUser` (`createTeam`, `joinTeam`, `submitVerification`, `decideVerification`, `submitFeedback`, `resolveDispute`, Janitor) oder das Update selbst (`banUser`; `deleteAccount` ändert die unique `email` und hält damit `FOR UPDATE`, das auch Fremdschlüssel-Prüfungen auf den Nutzer blockiert). Ein Deadlock- oder Serialisierungsfehler zeigt im Web "Bitte erneut versuchen"; der Sweeper versucht es im nächsten Durchlauf ohnehin wieder.

### Enums

```
Rank            IRON | BRONZE | SILVER | GOLD | PLATINUM | DIAMOND | ASCENDANT | IMMORTAL | RADIANT
                (Reihenfolge = Wert 1–9, für Bereichsvergleiche)
VerifStatus     PENDING | APPROVED | REJECTED
ScrimFormat     ONE_MAP | TWO_MAPS | BO3
RequestStatus   OPEN | BOOKED | CANCELLED | EXPIRED
MemberRole      PLAYER | SUBSTITUTE | COACH        (Phase 5)
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
  email                                   # bis Phase 6 Platzhalter (§5.1); ab Phase 7 die echte, bestätigte Adresse (§5.8),
                                          # Platzhalter nur noch bei Altkonten bis zum Vervollständigen und bei gelöschten Konten
  emailVerified                           # Better-Auth-Feld; ab Phase 7 Voraussetzung für alles außer der Konto-Seite
  firstName?, lastName?                   # Klarname, je 1–50 Zeichen (Phase 7); null bei Altkonten bis zum Vervollständigen
  staffRole? (StaffRole)                  # Phase 8: OPERATOR | ADMIN | REVIEWER, null = keine Rolle (§5.9)
  twoFactorEnabled                        # Better-Auth-Feld des twoFactor-Plugins (Phase 8)
  (Phase 8: Better-Auth-Tabelle twoFactor: secret (verschlüsselt), backupCodes (verschlüsselt), userId, verified,
   failedVerificationCount, lockedUntil; mit @@map wie die anderen Better-Auth-Modelle)
  universityId? ──► University            # gesetzt bei Freigabe
  universityOther?                        # Freitext bei "Andere"
  verifiedAt?                             # != null ⇒ verifiziert
  bannedAt?
  hubJoinFailedAt?                        # gesetzt, wenn der Server-Beitritt scheiterte
  dmFailedAt?                             # gesetzt bei Discord-Fehler 50007, zurückgesetzt bei erfolgreicher DM
  deletedAt?                              # gesetzt von deleteAccount; bleibt, auch wenn ein Login danach den Discord-Namen zurückschreibt
  createdAt
  (Better-Auth-Tabellen session, account, verification gehören dazu)
  ⚑ Die vier Better-Auth-Modelle (User, Session, Account, Verification) sind mit `pnpm dlx auth@1.7.12 generate`
    erzeugt und behalten ihr `@@map` auf "user", "session", "account", "verification". Die Regel "ohne @@map" gilt nur für Domänenmodelle.
    Die Session-Tabelle speichert in 1.7.12 `ipAddress` und `userAgent` (Phase-1-Prüfpunkt 4 bleibt trotzdem zu bestätigen).
  ⚑ Keine eigene discordId-Spalte: Die Discord-User-ID steht in account.accountId (providerId = 'discord').
  ⚑ Ab Phase 7 Unique-Indizes auf account: (providerId, accountId) und (userId, providerId), also eine Discord-ID
    gehört zu genau einem Nutzer, und ein Nutzer hat höchstens eine Verknüpfung pro Anbieter (§5.8).
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
  logoUpdatedAt?                          # Zeitpunkt des aktuellen Logos, null = kein Logo; Version in der Logo-URL (Phase 10)
  ⚑ Team-Zustand: aktiv (beide null) | gesperrt (bannedAt) | aufgelöst (dissolvedAt). Gesperrt und aufgelöst sind im MVP final.

TeamLogo                                  # Phase 10, eigene Tabelle, damit die ~40 Lesepfade mit ganzer Team-Zeile keine Bilddaten laden
  teamId ──► Team (PK)
  data (Bytes)                            # 256×256-WebP, verlustfrei, vom Server erzeugt (§5.11)
  ⚑ Es gibt genau dann eine Zeile, wenn Team.logoUpdatedAt gesetzt ist; beide ändern sich nur zusammen unter der Team-Sperre.

TeamMember
  teamId ──► Team, userId (unique) ──► User   # max. 1 Team pro User
  role (MemberRole, default PLAYER)      # vom Captain änderbar (Phase 5)
  joinedAt
  ⚑ Der Captain ist immer auch Mitglied (in core erzwungen). Max. 10 Mitglieder (in core erzwungen).
  ⚑ Spielbereit zählen nur verifizierte Mitglieder mit PLAYER oder SUBSTITUTE (`countsForReadiness` in `readiness.ts`).
    Die Captain-Rolle bleibt davon getrennt (`Team.captainId`); auch ein Coach kann Captain sein.

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
  id ('bot' = Sweeper, 'outbox' = Sender), heartbeatAt   # eine Zeile pro Bot-Schleife (§6.3)
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
- **Kontolöschung:** Der User wird anonymisiert statt hart gelöscht (`name = "Gelöschter Nutzer"`, `email` auf den neuen Platzhalter `deleted-<userId>@users.uniscrims.invalid`, `image`, `verifiedAt`, `universityId`, `universityOther`, `hubJoinFailedAt` und `dmFailedAt` auf `null`, `deletedAt = now`, Sessions und alle `account`-Zeilen löschen, aus dem Team entfernen). Alle `VerificationRequest`-Zeilen des Nutzers werden samt Dateien gelöscht, sonst bliebe eine offene Prüfung ohne Datei in der Queue. Die Notiz (`note`) aller Anfragen, die der Nutzer selbst erstellt hat (`createdById`), wird geleert, weil sie Freitext mit Kontaktdaten enthalten kann; Bewerbungsnachrichten haben keinen Verfasser und bleiben als Teamdaten stehen. So bleiben Team-Statistiken stimmig. Der neue Platzhalter ist nötig, weil `email` unique ist: Ein späterer Login legt einen User mit dem ursprünglichen Platzhalter an. Der Platzhalter markiert zugleich ein gelöschtes Konto: `requireAccountUser` (und damit jede Berechtigungsprüfung) behandelt es als abgemeldet, und `dmFailedAt`/`hubJoinFailedAt` werden für es nicht mehr geschrieben. Alle Aktionen, die für den Nutzer schreiben, sperren vorher seine User-Zeile oder die Team-Zeile seiner Mitgliedschaft (§4) und prüfen ihn darunter erneut. So kann keine Aktion, die vor der Löschung begonnen hat, danach noch für das Konto schreiben. `deletedAt` bleibt auch dann gesetzt, wenn ein Login, der die Löschung überholt hat, den Discord-Namen zurückschreibt (§5.1); daran erkennt der Sweeper solche Konten.
  - **Gesperrter Nutzer:** Die Sperre wandert auf einen eigenen **Sperr-Platzhalter**: einen neuen User mit `name = "Gelöschter Nutzer"`, eigenem Lösch-Platzhalter als `email`, `bannedAt` des Nutzers und `deletedAt`, der die Discord-`account`-Zeile übernimmt (ohne Tokens und `scope`, nur `providerId`, `accountId` und die Pflichtfelder). Das gelöschte Konto selbst ist danach so anonym wie jedes andere und hat keine Verbindung mehr zur Discord-ID; Anfragen, Feedback oder aufgelöste Teams, die auf es zeigen, verraten die Person also nicht. Ein erneuter Login landet beim Sperr-Platzhalter, und `requireUser` blockiert. So lässt sich eine Sperre nicht durch Löschen umgehen. Bis Phase 6 schrieb Better Auth dabei Name, Avatar und Platzhalter-Mail aus dem Discord-Profil an den Sperr-Platzhalter, und `/account` erlaubte erneutes Löschen; seit Phase 7 liefert `discordLoginUserInfo` dem Platzhalter seine eigenen Werte, er bleibt anonym und gilt als abgemeldet (§5.8). Dieselben Platzhalter legt `reapplyModeration` für gesperrte Discord-Konten an, die eine wiederhergestellte Datenbank nicht kennt (§8).

---

## 5. Kernabläufe im Detail

### 5.1 Login und Hub-Server ⚠️ wichtig

**Discord-Bots können Nutzern nur DMs schicken, wenn sie mindestens einen Server mit ihnen teilen** (sonst Fehler 50007). Darum gibt es einen offiziellen Uni-Scrims-Hub-Server.

**Login-Ablauf mit Better Auth:**
- Vor dem Login-Button eine Pflicht-Checkbox "mindestens 16 Jahre, Datenschutzerklärung gelesen". Erst dann wird der Button aktiv.
- Discord als Social Provider mit dieser Konfiguration:
  - `disableDefaultScope: true` und `scope: ["identify", "guilds.join"]`. Ohne `disableDefaultScope` kommt der `email`-Scope trotzdem mit.
  - `overrideUserInfoOnSignIn: true`. Der Default ist `false`; ohne diese Option werden Name und Avatar beim Login nicht aktualisiert. Ab Phase 7 aus; Name und Avatar übernimmt dann der Login-Hook (§5.8).
  - `mapProfileToUser` setzt `email` auf den Platzhalter (siehe unten) und `name` auf den Discord-Username (`profile.username`, bei noch nicht umgestellten Konten mit Discriminator als `name#1234`). Ohne das nimmt Better Auth den Anzeigenamen (`global_name`), der weder eindeutig noch in Discord suchbar ist; Captains sollen den gegnerischen Captain aber darüber finden (P0-6). Achtung: Felder mit `input: false` werden von `mapProfileToUser` laut Doku ignoriert; deshalb gibt es keine eigene `discordId`-Spalte, die Discord-ID kommt aus `account.accountId`.
  - Die Zusatzfelder am User (`verifiedAt`, `bannedAt`, `universityId` usw.) als `additionalFields` mit `input: false` deklarieren, damit der Client sie nicht setzen kann. Gesetzt werden sie nur von `core`.
- Bei **jedem** Login (nicht nur beim ersten) versucht ein Better-Auth-Hook den Beitritt (für gesperrte Nutzer übersprungen): `PUT /guilds/{HUB_GUILD_ID}/members/{account.accountId}` mit dem Access-Token des Nutzers im Body und dem Bot-Token im Header. Antwort 201 heißt beigetreten, 204 heißt schon Mitglied. Voraussetzung: Der Bot ist im Hub und hat `CREATE_INSTANT_INVITE`.
- Der Beitritt läuft mit **5 s Timeout**. Jeder Fehler (auch ein Timeout) setzt nur `hubJoinFailedAt`; **der Login läuft immer weiter.**
- Bei Fehler wird `User.hubJoinFailedAt` gesetzt, sonst `null`. Häufigster Fehler: Der Nutzer ist schon in 100 Servern (200 mit Nitro), Discord-Fehler 30001.
- **Danach werden Access- und Refresh-Token aus der `account`-Tabelle entfernt.** Sie werden nur für den Beitritt gebraucht. Scheitert das oder läuft der Hook nicht (Absturz, Fehler vor dem Anlegen der Session), löscht der Sweeper sie spätestens 10 Minuten später (§6.3).
- `name` und `image` werden bei jedem Login aktualisiert.
- **Nur die genutzten Better-Auth-Endpunkte sind erreichbar:** `/sign-in/social`, `/callback/:id`, `/sign-out`, `/get-session`, `/error` und der Dev-Login `/dev/sign-in` (der außerhalb der Entwicklung selbst 404 antwortet). Ein before-Hook mit dieser Liste (`apps/web/lib/auth-paths.ts`) beantwortet alle anderen mit 404, z. B. `/update-user`, `/change-email`, `/link-social` oder `/unlink-account`. Sonst könnte jede Session, auch die eines gesperrten Nutzers, Name und Avatar an Discord und an `requireUser` vorbei ändern; Sperren-Suche, Streitfall-Seite und Gegner verlassen sich aber auf den Discord-Username.
- **Löschung während eines Logins:** Better Auth schreibt beim Login ohne Transaktion erst die `account`-Zeile, dann Name, Avatar und Mail. Fehlt die Discord-Verknüpfung danach, weil das Konto genau währenddessen gelöscht wurde, setzt `handleDiscordLogin` den User wieder auf die Lösch-Werte und löscht seine Sessions (`restoreDeletedUser`). Scheitert das (der Hook loggt Fehler nur) oder läuft der Hook gar nicht (Absturz), holt es der Sweeper im nächsten Durchlauf nach (`finishInterruptedDeletions`: `deletedAt` gesetzt, keine `account`-Zeile, aber nicht die Lösch-Mail; §6.3). Bis dahin ist die Session nutzlos: `requireAccountUser` behandelt einen Nutzer ohne Discord-Verknüpfung als abgemeldet, und `getCurrentUser` liefert für ihn `null`, sodass Kopfzeile, Startseite und Login-Seite ihn als abgemeldet zeigen. Erst nach der Rücknahme passt die Platzhalter-Mail nicht mehr, und ein neuer Login legt wieder einen neuen User an (vorher bräche Better Auth ihn mit „account not linked“ ab, weil es den User über die Mail fände). Ist die `account`-Zeile schon weg, wenn Better Auth sie aktualisieren will, bricht der Login ab; war die Löschung vor dem Login fertig, legt er wie immer einen neuen User an.
- Der Login-Screen erklärt vorher, dass der Nutzer dem Server hinzugefügt wird und warum.
- Ab Phase 7 meldet man sich mit E-Mail und Passwort an, Discord wird verknüpft (§5.8). Der Hub-Beitritt, das Löschen der Tokens und das Übernehmen von Name und Avatar laufen dann beim Verknüpfen und bei jedem Discord-Login.

**In Phase 1 zu verifizieren (mit der gepinnten Version):**
1. Welcher Better-Auth-Hook nach dem OAuth-Callback zuverlässig das frische Access-Token liefert (z. B. Database-Hook auf `account` create/update oder ein After-Hook auf den Callback-Pfad), und dass Tokens danach gelöscht werden können, ohne die Session zu brechen.
2. **E-Mail-Pflichtfeld:** Better Auth erwartet am User eine E-Mail. Ohne `email`-Scope liefert Discord keine. Lösung (laut Doku der vorgesehene Weg): Platzhalter `<Discord-User-ID aus dem Profil>@users.uniscrims.invalid` per `mapProfileToUser`. Die Adresse wird nirgends angezeigt oder verwendet.
3. Sessions liegen in der DB. **Den Cookie-Cache nicht aktivieren** (er ist standardmäßig aus), damit Sperren und Kontolöschung sofort greifen.
4. Welche Felder die `session`-Tabelle in der gepinnten Version speichert (nach Kenntnis IP-Adresse und User-Agent). Das Ergebnis geht in die Datenschutzerklärung.

**Hinweis-Banner auf jeder Seite**, solange `hubJoinFailedAt` oder `dmFailedAt` gesetzt ist: "Wir konnten dir keine Discord-Nachricht schicken" mit dem Link "So behebst du das" auf die Konto-Seite. Der Banner lässt sich nicht wegklicken. Auf der Konto-Seite stehen der Hinweis, DMs von Servermitgliedern zu erlauben, und bei `hubJoinFailedAt` zusätzlich der Hub-Einladungslink.

### 5.2 Verifizierung (Upload)

```
User lädt Datei hoch (Server Action)
  → Auth-Check, Nutzer noch nicht verifiziert (`verifiedAt` null), kein PENDING vorhanden, Checkbox bestätigt
  → echte Dateigröße ≤ 5 MB nach dem Einlesen prüfen (nicht nur Content-Length)
  → MIME über Magic Bytes prüfen (file-type): nur PDF, JPEG, PNG; HEIC mit Hinweis ablehnen
  → Datei schreiben: <UPLOAD_DIR>/<uuid>.<ext> (Rechte 0600); filePath speichert nur den Dateinamen
  → in einer Transaktion: User-Zeile sperren (`lockUser`), Nutzer erneut prüfen (nicht gesperrt,
    nicht gelöscht, nicht verifiziert, keine PENDING), VerificationRequest(PENDING,
    pendingUserId = userId) anlegen
  → schlägt die Transaktion fehl: Datei sofort löschen

Admin öffnet Queue → Vorschau über /api/admin/uploads/[id]
  → Route prüft Admin-Session
  → Header: Content-Disposition: inline, X-Content-Type-Options: nosniff,
    Cache-Control: no-store; bei Bildern zusätzlich Content-Security-Policy: sandbox
    (bei PDFs nur, wenn die Vorschau in Chrome und Firefox damit funktioniert, in Phase 1 testen)

Admin entscheidet (eine Transaktion)
  → User-Zeile sperren (User vor VerificationRequest, wie deleteAccount; umgekehrt gab es Deadlocks)
  → status, decidedAt, decidedById, pendingUserId = null (nur solange PENDING; ist die Zeile mit dem
    Konto gelöscht worden: "Prüfung nicht gefunden.")
  → bei APPROVED: User.verifiedAt + universityId setzen (bei "Andere" optional Seed-Hochschule zuordnen)
  → Notification VERIFICATION_RESULT
  → nach dem Commit: Datei löschen, filePath = null
```

**Body-Limit:** Server Actions haben standardmäßig ein Limit von 1 MB. In `next.config.ts` steht `experimental.serverActions.bodySizeLimit: '6mb'` (in Next 16.4.2 unter `experimental`). Zusätzlich in Caddy `request_body { max_size 6MB }`.

**`UPLOAD_DIR`** muss ein absoluter Pfad sein (`resolveUploadDir` in core bricht sonst ab), damit Web, Janitor und Tests nicht vom Arbeitsverzeichnis abhängen. Die Datei-Route `/api/admin/uploads/[id]` ist von den globalen Sicherheits-Headern (§7) ausgenommen und setzt eigene, darunter `frame-ancestors 'self'`. Sonst würde `frame-ancestors 'none'` die PDF-Vorschau im iframe der Queue blockieren.

**Janitor im Web-Prozess** (`instrumentation.ts`, beim Start und dann stündlich): Start nur, wenn `process.env.NEXT_RUNTIME === 'nodejs'`, mit einem Modul-Flag gegen Doppelstart (der Dev-Server ruft `register()` mehrfach auf), als sequenzielle Schleife wie in §6.2 (kein `setInterval`). Ab Phase 7 kommt davor der Schritt `resetLegacyVerifications` (§5.8); jeder Schritt läuft auch, wenn ein früherer scheitert (der Fehler wird geloggt), damit die 14-Tage-Frist nie an einem anderen Schritt hängt:
1. PENDING-Prüfungen älter als `VERIFICATION_TTL` (14 Tage) → automatisch REJECTED mit Grund "Prüfung nicht rechtzeitig erfolgt", Datei löschen, `VERIFICATION_RESULT` senden. Unter der User-Sperre wie die Entscheidung.
2. Requests mit Status ≠ PENDING, die noch einen `filePath` haben → Datei löschen, `filePath = null`.
3. Dateien im Upload-Ordner ohne zugehörigen DB-Eintrag, die älter als 24 h sind → löschen.

**Prüfung ohne Datei:** Nach dem Einspielen eines Backups (Uploads werden nicht gesichert, §8) kann eine PENDING-Prüfung auf eine Datei zeigen, die es nicht mehr gibt. Die Queue zeigt dann "Datei fehlt" statt der Vorschau, und `decideVerification` lehnt eine Freigabe ohne Datei ab ("Die Datei fehlt. Bitte lehne die Prüfung ab …"); der Admin lehnt mit Grund ab, und der Nutzer lädt neu hoch. Bewusst kein automatisches Ablehnen: Ein falsch eingebundenes oder neu angelegtes Upload-Volume sähe genauso aus und würde sonst jede offene Prüfung ablehnen.

### 5.3 Anfragen und Bewerbungen

Alle Funktionen in diesem Abschnitt prüfen zuerst die Berechtigung laut §7 (aktueller Captain, selbst verifiziert, nicht gesperrt).

**Zeilensperre auf der Anfrage:** `applyToRequest`, `deleteRequest`, `confirmApplication` und `expireRequests` sperren in einer interaktiven Transaktion die `ScrimRequest`-Zeile (`SELECT … FROM "ScrimRequest" WHERE id = $1 FOR NO KEY UPDATE` per `$queryRaw`) und prüfen erst danach den Status. Dadurch laufen sie nacheinander, und eine PENDING-Bewerbung existiert nur, solange die Anfrage OPEN ist. Test: paralleles `applyToRequest` und `confirmApplication` hinterlässt keine PENDING-Bewerbung auf einer nicht offenen Anfrage. `applyToRequest` sperrt vorher die eigene `Team`-Zeile (Team vor Anfrage, wie `retireTeamActivity`) und prüft Captain, Sperre und Spielbereitschaft darunter erneut; so zieht eine gleichzeitige Sperre oder Auflösung des Bewerber-Teams die neue Bewerbung zurück.

- `createRequest`: Team spielbereit und aktiv; max. 5 offene Anfragen; Startzeit im 15-Minuten-Raster zwischen 10:00 und 01:45 Uhr Berliner Zeit, mindestens 30 Minuten nach `now`. Sperrt die `Team`-Zeile, damit parallele Aufrufe das Limit nicht überschreiten. Als offen zählen Anfragen mit OPEN und `startsAt > now`. Das Zeitfenster vermeidet nebenbei die Zeitumstellung (02:00–03:00). Das eingegebene Datum ist das Kalenderdatum des tatsächlichen Starts (01:00 am 22.10. = Nacht von Di auf Mi).
- `applyToRequest`: Team spielbereit und aktiv, nicht das Ersteller-Team; Anfrage OPEN und zukünftig; `unique(requestId, teamId)`. Liegt der Team-Rang außerhalb des Bereichs, wird die Bewerbung trotzdem angelegt; die UI zeigt einen Hinweis. Notification `APPLICATION_RECEIVED`.
- `withdrawApplication`: nur PENDING → WITHDRAWN.
- `deleteRequest`: nur OPEN und vor dem Start → CANCELLED; PENDING-Bewerbungen → REJECTED; `REQUEST_DELETED` an die Bewerber.
- **Board-Filter nach Rang:** Mehrere Ränge sind wählbar (`?rang=GOLD&rang=PLATINUM`); eine Anfrage passt, wenn ihr Bereich einen davon enthält (`rankMin ≤ r ≤ rankMax` für ein gewähltes `r`, also kein Bereich von kleinstem bis größtem gewählten Rang). Standard ohne `rang` ist der eigene Team-Rang; ohne Auswahl schickt das Formular `rang=ALL` für alle Ränge. Die eigenen Anfragen stehen ungefiltert in einem eigenen Abschnitt.

### 5.4 Bestätigen (atomar)

`confirmApplication(requestId, applicationId, actingUserId)` in **einer** Transaktion:

1. Prüfen: Der handelnde Nutzer ist aktueller, verifizierter Captain des Ersteller-Teams. **Beide Teams** sind spielbereit und aktiv (nicht gesperrt, nicht aufgelöst). Sonst Fehler, die Bewerbung bleibt PENDING.
2. Zuerst ohne Sperre prüfen, dass der Handelnde Captain des Ersteller-Teams ist (sonst nimmt niemand Sperren), dann beide Team-Zeilen (nach `id` sortiert; das Bewerber-Team nur, wenn die Bewerbung zu dieser Anfrage gehört) und danach die Anfrage-Zeile sperren (Sperrreihenfolge §4, siehe §5.3). Prüfungen aus Schritt 1 laufen unter diesen Sperren; eine gleichzeitige Sperre oder Auflösung eines der Teams kommt so entweder vorher (Fehler) oder danach (sagt den Scrim ab). Dann `UPDATE ScrimRequest SET status='BOOKED' WHERE id=$1 AND status='OPEN' AND startsAt > $now`. Wenn 0 Zeilen betroffen sind: Fehler "Anfrage nicht mehr offen".
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

`retireTeamActivity(teamId)` wird bei Team-Sperre und Team-Auflösung aufgerufen (eine Transaktion, der Aufrufer hält die Team-Zeile):
- Offene Anfragen (OPEN, Start in der Zukunft) → CANCELLED (+ `REQUEST_DELETED` an Bewerber)
- Eigene Bewerbungen auf offene Anfragen → WITHDRAWN
- Zukünftige Scrims mit Status SCHEDULED → CANCELLED mit `cancelledByTeamId` = betroffenes Team, `lateCancel = false`, `SCRIM_CANCELLED` an das Gegnerteam
- Anfragen, deren Start schon vorbei ist, sind nicht mehr offen: Sie lässt der Sweeper wie sonst auch verfallen (§6.3 Schritt 1, `REQUEST_EXPIRED`, Bewerbungen REJECTED).
- Sperrreihenfolge (§4): erst alle betroffenen Anfragen (eigene und die, auf die sich das Team beworben hat; `retirementRequestIds`, nach `id`), dann die Scrims, erst danach Bewerbungen und Notifications. Sonst sperrten zwei Teams, die sich gegenseitig beworben haben und gleichzeitig stillgelegt werden, dieselben zwei Bewerbungen in umgekehrter Reihenfolge.

**Team-Lebenszyklus in `core`:**
- `leaveTeam`: Spieler jederzeit, **auch in gesperrten Teams** (sonst säßen die Mitglieder eines gesperrten Teams fest). Captain nur, wenn er das einzige Mitglied ist, dann folgt `dissolveTeam`.
- `transferCaptain`, `removeMember` (nur Captain, nicht sich selbst), `setMemberRole` (nur Captain, auch für sich selbst), `updateTeam`, `regenerateInvite`: prüfen die Rolle zuerst ohne Sperre (sonst könnte jeder eingeloggte Nutzer fremde Team-Zeilen sperren und deren Buchungen aufhalten), sperren dann die Team-Zeile und prüfen darunter die Rolle erneut. Sonst schriebe eine Umbenennung, die eine gleichzeitige Auflösung überholt, den Namen zurück auf das aufgelöste Team, und er bliebe für immer belegt.
- `dissolveTeam`: `retireTeamActivity`, alle `TeamMember`-Zeilen löschen, `dissolvedAt = now`, `nameNormalized = null`, `inviteCode = null`, ab Phase 10 die `TeamLogo`-Zeile löschen und `logoUpdatedAt = null`. **Kein hartes Löschen**, weil Scrims die Team-ID behalten.
- `joinTeam`: nur über den `inviteCode` eines aktiven Teams, max. 10 Mitglieder, Nutzer in keinem anderen Team. Sperrt zuerst die Team-Zeile (`FOR NO KEY UPDATE`), damit zwei gleichzeitige Beitritte das Limit nicht überschreiten, dann die User-Zeile (`lockUser`), und prüft darunter den Nutzer (gesperrt, gelöscht) und seine Mitgliedschaft erneut. `createTeam` sperrt nur die User-Zeile (das neue Team sieht noch niemand) und prüft ebenso. Eine gleichzeitige Sperre oder Kontolöschung kommt damit entweder zuerst (Beitritt bzw. Gründung wird abgelehnt) oder sieht die neue Mitgliedschaft und bricht mit "Bitte versuch es erneut." ab.
- `banUser`: `bannedAt` setzen, Sessions löschen. Eine PENDING-Prüfung wird ohne Nachricht REJECTED (Grund "Konto gesperrt", `decidedById = null`), ihre Datei nach dem Commit gelöscht (Janitor-Schritt 2 als Rückfall). Ist er **kein** Captain, wird er aus dem Team entfernt. Ist er Captain, bleibt er Mitglied und Captain, und das Team wird mit `banTeam` gesperrt. Der Nutzer wird **nicht** aus dem Hub-Server entfernt (kein `KICK_MEMBERS`-Recht). **Entsperren gibt es im MVP nur manuell per DB** (im README beschrieben).
- `banTeam`: `bannedAt` setzen + `retireTeamActivity`.
- `deleteAccount`: wie in §4 beschrieben (bei gesperrten Nutzern wandert die Discord-Verknüpfung auf einen Sperr-Platzhalter), zusätzlich alle Notifications mit `targetUserId` des Nutzers löschen; als Captain nur ohne weitere Mitglieder (dann `dissolveTeam`), sonst Fehler "Übertrage zuerst die Captain-Rolle." Ausnahme: Ein gesperrtes Team kann die Rolle nicht übertragen; dann wird es aufgelöst (`bannedAt` bleibt). Sperrt zuerst die Team-Zeile, dann schreibt es die User-Zeile (gleiche Reihenfolge wie `leaveTeam`, `joinTeam`, `banUser`, `submitVerification` und `decideVerification`, §4); ob der Nutzer gesperrt ist, liest es aus diesem Update, damit eine gleichzeitige Sperre nicht durch Löschen umgangen wird. Danach sperrt es in einem Zug nach `id` die Anfragen mit seinen Notizen (auch die anderer Teams, die er früher als deren Captain erstellt hat) und die, die das Auflösen seines Teams betrifft, und leert erst dann die Notizen. Die gemeinsame Regel für Funktion und Konto-Seite ist `accountDeletionProblem`. `banUser` sperrt ebenfalls zuerst die Team-Zeile und lehnt Konten ohne Discord-Verknüpfung ab (schon gelöscht: ein neuer Login legte einen neuen, ungesperrten User an).
- Kontolöschung entfernt den Nutzer ebenfalls **nicht** aus dem Hub-Server (kein `KICK_MEMBERS`-Recht); das steht in der Datenschutzerklärung.

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


### 5.8 Konto mit E-Mail und Passwort (ab Phase 7)

Better Auth bekommt `emailAndPassword` dazu; Discord bleibt Social Provider, wird aber verknüpft statt zur Anmeldung angelegt (SPEC N-3).

**Registrierung:** Formular `/register` → Server Action → Zod-Schema in `core` (Vor- und Nachname je 1–50 Zeichen, getrimmt; E-Mail; Passwort 10–128 Zeichen; Pflicht-Checkbox) → `auth.api.signUpEmail` auf dem Server. Der Endpunkt `/sign-up/email` ist nur für diesen Aufruf vom Server offen; von außen antwortet er 404 (Before-Hook: Anfrage ohne HTTP-Request = Aufruf vom Server), damit niemand die Prüfung in `core` umgeht. `requireEmailVerification`, Bestätigungsmail beim Registrieren, Link 24 h gültig, nach dem Klick automatisch angemeldet (`autoSignInAfterVerification`). Mit `requireEmailVerification` antwortet Better Auth auf eine schon registrierte Adresse genauso wie auf eine neue, die Seite zeigt immer „Wir haben dir eine Mail geschickt“. Klarname als `additionalFields` (`firstName`, `lastName`), die nur dieser Server-Aufruf und `core` setzen.

**Anmeldung:** Server Action → `auth.api.signInEmail`; eine unbestätigte Adresse bekommt die Meldung, und Better Auth schickt den Link noch einmal (`sendOnSignIn`). Discord mit `disableImplicitSignUp` und `disableSignUp` (der Client könnte Ersteres mit `requestSignUp` abschalten): Ein Discord-Login findet nur verknüpfte Konten und legt keine an (sonst `error=signup_disabled`). `overrideUserInfoOnSignIn` aktualisiert Name und Avatar; weil es in 1.7.12 auch E-Mail und Bestätigung schreibt, liefert `mapProfileToUser` über `discordLoginUserInfo` (`core`) für ein verknüpftes Konto dessen eigene Adresse, also bleibt sie unverändert. Für einen Sperr-Platzhalter liefert es dessen eigene Werte: Ein gesperrter Nutzer, der sein Konto gelöscht hat, bekommt bei einem neuen Discord-Login nichts mehr an den Platzhalter geschrieben und gilt weiter als abgemeldet.

**Discord verknüpfen:** `/link-social` mit `account.accountLinking`: `trustedProviders: ["discord"]` (Discord liefert ohne `email`-Scope keine bestätigte Adresse), `allowDifferentEmails: true` (der Platzhalter aus `mapProfileToUser` weicht immer ab), `updateUserInfoOnLink: true` (Name und Avatar, nie die Adresse). Bis dahin heißt ein neues Konto „Neues Konto“, nie mit dem Klarnamen. Der After-Hook auf `/callback/:id` sieht beim Verknüpfen keine neue Session; Hub-Beitritt und Token-Löschung laufen deshalb in einem `databaseHooks.account`-Hook, wo die frischen Tokens ankommen: `create` beim Verknüpfen, `update` bei jedem Discord-Login. Davor prüft ein `create.before`-Hook (`accountCreateProblem` in `core`): keine neue `account`-Zeile für gelöschte oder gesperrte Nutzer (eine Verknüpfung oder ein Passwort-Reset, die erst nach Löschung oder Sperre fertig werden) und Discord nur einmal pro Nutzer. Unique-Indizes auf `account` (`providerId`+`accountId`, `userId`+`providerId`) sichern das ab. Schlüpft eine Verknüpfung trotzdem nach einer Löschung durch, entfernt `handleDiscordLogin` sie samt Sessions wieder. Eine Discord-ID, die schon zu einem anderen Konto gehört, lehnt Better Auth ab; gesperrte Discord-IDs hängen an ihrem Sperr-Platzhalter (§4) und fallen damit unter dieselbe Regel. Auf der Konto-Seite lässt sich dasselbe Discord-Konto erneut verbinden; das bringt frische Tokens und damit einen neuen Hub-Beitritt (z. B. wenn er beim ersten Mal scheiterte).

**Was dem Konto fehlt:** `accountSetupStep(user)` in `core` liefert der Reihe nach `COMPLETE_ACCOUNT` (Altkonto ohne Klarname), `VERIFY_EMAIL` (Adresse unbestätigt), `LINK_DISCORD` (keine Discord-Verknüpfung) oder `null`. `requireUser` und alles darauf Aufbauende werfen bei einem Schritt den Fehler `ACCOUNT_INCOMPLETE` mit diesem Schritt; `requirePageUser` leitet auf die passende Seite. `requireAccountUser` (Konto-Seite) lässt unvollständige Konten durch. Als abgemeldet gilt ein Konto weiterhin mit der Lösch-Mail, und neu: mit `deletedAt`, aber ohne Discord-Verknüpfung (ein Login, der eine Löschung überholt hat, §5.1). Ein neues Konto ohne Discord ist dagegen nicht gelöscht, nur unvollständig.

**Altkonten:** Konten von vor Phase 7 haben nur die Discord-Verknüpfung und den Platzhalter. Sie melden sich weiter per Discord an und landen bei `COMPLETE_ACCOUNT`: `completeAccount` setzt unter der User-Sperre Klarname, neue Adresse (`emailVerified = false`) und die `credential`-Zeile mit dem Passwort-Hash, den die Server Action mit Better Auths Hasher berechnet; dann geht die Bestätigungsmail raus. Ist die Adresse vergeben, sagt die Seite das (Ausnahme von SPEC N-3, nur für angemeldete Altkonten). Ein Altkonto-Captain kann die Captain-Rolle auf der Konto-Seite übertragen (`handOverCaptain`), weil die Team-Seite ein vollständiges Konto braucht; sonst könnte er sein Konto nicht löschen, ohne vorher neue Daten anzugeben. Team und Rolle bleiben unberührt. Die Verifizierung nicht (SPEC N-3): Der Upload-Janitor bekommt einen Schritt `resetLegacyVerifications`, der beim Start des Web-Prozesses (also direkt nach dem Deploy) und danach stündlich läuft. Er setzt bei Altkonten (`firstName` null, nicht gelöscht) `verifiedAt`, `universityId` und `universityOther` zurück und lehnt ihre offenen Prüfungen mit dem Grund „Bitte vervollständige dein Konto und lade die Bescheinigung erneut hoch.“ ab (unter der User-Sperre wie die Auto-Ablehnung, `VERIFICATION_RESULT`, Datei danach löschen). Idempotent; nach dem Vervollständigen ist ein Konto kein Altkonto mehr und lädt neu hoch.

**Passwort und E-Mail:** Passwort vergessen über `/request-password-reset` und `/reset-password` (Link 1 h gültig, `revokeSessionsOnPasswordReset`). Passwort ändern mit dem alten Passwort (`/change-password`, beendet die anderen Sitzungen). E-Mail ändern über `/change-email` mit Bestätigungslink an die neue Adresse. Die Auth-Allowlist (§5.1, `lib/auth-paths.ts`) unterscheidet: Über HTTP erreichbar sind nur OAuth (`/sign-in/social`, `/link-social`, `/callback/:id`), die Session, `/verify-email` und `/reset-password/:token` (die Ziele der Mail-Links). Die Konto-Aktionen (`/sign-up/email`, `/sign-in/email`, `/send-verification-email`, `/request-password-reset`, `/reset-password`, `/change-password`, `/change-email`) gehen nur aus den Server Actions (Aufruf ohne HTTP-Request); über HTTP antworten sie 404. `/update-user`, `/unlink-account`, `/set-password` und der Rest bleiben ganz gesperrt. Den Klarnamen ändert `updateRealName` in `core`, nur solange der Nutzer nicht verifiziert ist und keine Prüfung offen hat (unter der User-Sperre, wie `submitVerification`).

**Begrenzung:** Better Auths Rate-Limit läuft nur im HTTP-Router, also nicht bei den Server-Aufrufen der Konto-Aktionen. Die Server Actions zählen deshalb selbst (`lib/rate-limit.ts`, eine Instanz, Speicher im Prozess): Anmelden und Registrieren höchstens 5 pro Minute und IP, Mails anfordern (Bestätigung, Passwort, E-Mail-Wechsel) höchstens 3 pro Minute und IP. Für die HTTP-Endpunkte bleibt Better Auths eigenes Rate-Limit (in Production an). Beide lesen die Client-IP aus `X-Forwarded-For`, das nginx und Caddy selbst setzen (`advanced.ipAddress.ipAddressHeaders`).

**Mails:** `apps/web/lib/mail.ts` verschickt per SMTP (nodemailer, `SMTP_*`, `MAIL_FROM`) reinen Text auf Deutsch: Bestätigung, Passwort zurücksetzen, E-Mail ändern. Better Auth verschickt sie bei Registrierung, Anmeldung, Passwort-Reset und E-Mail-Wechsel im Hintergrund (`advanced.backgroundTasks`): Keine Antwort wartet auf den Mailserver, also verrät weder die Antwortzeit noch ein Fehler, ob eine Adresse registriert ist; Fehlschläge stehen im Log. Nur „Link noch einmal schicken“ auf der Einrichtungsseite wartet und zeigt bei einem Fehler „Die Mail konnte nicht gesendet werden. Bitte versuch es später erneut.“ In der Entwicklung landen Mails im Log, mit `DEV_MAIL_REDIRECT` gehen alle an diese Adresse (Präfix „[an: …]“, wie `DEV_DM_REDIRECT_DISCORD_ID`). Nur das Web verschickt Mails; der Bot bleibt bei Discord.

**Löschen und Sperren:** `deletedUserData` leert zusätzlich `firstName` und `lastName`; `deleteAccount` löscht wie bisher alle `account`-Zeilen, also auch die mit dem Passwort-Hash (`credential`), dazu Better Auths offene Passwort-Reset-Tokens des Nutzers (`verification` mit der User-ID als Wert), und die Adresse wird zur Lösch-Mail. E-Mail, Passwort und Klarname ändern (`requireActiveAccountUser`) dürfen gesperrte Nutzer nicht; ihnen bleibt das Löschen. Bei gesperrten Nutzern wandert wie bisher nur die Discord-Zeile auf den Sperr-Platzhalter. `reapplyModeration` braucht nichts Neues.

**Seed und Dev-Login:** Seed-Nutzer bekommen Klarname, eine Adresse unter `seed.uniscrims.invalid` und `emailVerified = true`, damit der Dev-Login vollständige Konten liefert.

### 5.9 Admins, Prüfer und 2FA (ab Phase 8)

**Rollen:** `User.staffRole` (`OPERATOR`, `ADMIN`, `REVIEWER`, sonst null). `ADMIN_DISCORD_IDS` und `isAdmin` entfallen; alle Admin-Prüfungen lesen die Rolle, `getCurrentUser` liefert sie als `staffRole`. Welche Admin-Seite welche Rolle sieht, legt `staffArea` in `core` fest: Prüf-Queue und Datei-Abruf ab Prüfer, Streitfälle, Sperren, fehlgeschlagene Nachrichten, Bot-Status und Statistik ab Admin, Rollen-Seite nur Betreiber.

**Berechtigung:** `requireStaff(userId, roles)` = `requireUser` (vollständiges Konto, nicht gesperrt), Rolle in `roles` und `twoFactorEnabled`; ohne eingerichtete 2FA wirft es `TwoFactorRequiredError` (Code `TWO_FACTOR_REQUIRED`), und die Admin-Seiten leiten zur Einrichtung. Darauf `requireReviewer`, `requireAdmin` (Admin und Betreiber) und `requireOperator`. `requireStaffMember` verlangt nur die Rolle, nicht die 2FA; damit arbeiten die Einrichtungsseite und ihre Actions. `decideVerification` prüft wie bisher unter der Sperre der Prüfer-Zeile erneut, jetzt mit `requireReviewer`; ein gleichzeitiger Rollenentzug (sperrt dieselbe Zeile) kommt also vorher oder danach.

**Woher eine Staff-Session kommt:** Das `twoFactor`-Plugin verlangt den Code nur bei `/sign-in/email`. Andere Wege zu einer Session, etwa der Discord-Login oder der Link zur neuen Adresse aus der Mail zum E-Mail-Wechsel (Better Auth meldet ohne Session an), überspringen ihn. Deshalb:
1. Ein `databaseHooks.session.create.before` lässt Sessions für Nutzer mit Rolle (`hasStaffRole`) nur unter einer Allowlist von Endpunkten zu (`staffSessionAllowed` in `apps/web/lib/auth-paths.ts`): `/sign-in/email` (mit 2FA tauscht das Plugin diese Session gegen den Code-Schritt), `/two-factor/verify-totp`, `/two-factor/verify-backup-code`, `/change-password` (ersetzt die Session einer angemeldeten Person) und der Dev-Login. Sonst leitet er zur Login-Seite: `error=staff_discord` vom Discord-Callback, `error=staff_link` von einem Mail-Link („öffne den Link, während du angemeldet bist“). Discord verknüpfen bleibt möglich, das legt keine Session an.
2. Jede Rollenänderung löscht die Sessions der Person, ebenso das Zurücksetzen der 2FA.
3. Das Einschalten der 2FA löscht alle Sessions, egal von welcher Seite der erste Code kam: Ein `databaseHooks.user.update.after` unter `/two-factor/verify-totp` ruft `finishTwoFactorSetup`. Danach meldet sich die Person mit Passwort und Code neu an. `/login/2fa` nimmt Codes nur ohne Session an; mit Session prüfte Better Auth den Code gegen sie.

Damit stammt jede Session, die den Admin-Bereich sieht, aus einer Anmeldung mit Passwort und Code. Der Dev-Login umgeht das, er ist nur in der Entwicklung an.

**Race beim Einschalten:** Better Auth prüft den Code und setzt `twoFactorEnabled` ohne unsere Sperren. Läuft dazwischen ein Entzug oder ein Zurücksetzen, stünde die 2FA auf an, ohne Rolle oder ohne Schlüssel. Dann verlangte die Passwort-Anmeldung einen Code, den es nicht gibt. `finishTwoFactorSetup` sperrt deshalb die User-Zeile und schaltet die 2FA in diesem Fall wieder ab; die Einrichtungsseite meldet das.

**2FA:** Better-Auth-Plugin `twoFactor` mit TOTP (Aussteller „Uni Scrims“, 6 Stellen, 30 s) und 10 Backup-Codes; kein E-Mail-OTP, kein „Gerät merken“ (das Plugin überspränge damit den Code). Einrichten über Server Actions: `/two-factor/enable` mit dem Passwort liefert die `otpauth`-URI und die Backup-Codes (QR-Code als SVG mit `uqr`, darunter der Schlüssel zum Abtippen), `/two-factor/verify-totp` mit dem ersten Code setzt `twoFactorEnabled`; dann beendet `finishTwoFactorSetup` alle Sessions (siehe oben). Anmelden: Die Server Action ruft `signInEmail`; bei `twoFactorRedirect` setzt Better Auth ein Cookie für die laufende Anmeldung (10 min), und `/login/2fa` schickt Code oder Backup-Code an `/two-factor/verify-totp` bzw. `/two-factor/verify-backup-code`. Diese Endpunkte sind wie die anderen Konto-Aktionen nur vom Server erreichbar (§5.8) und haben eine eigene Begrenzung (10 Codes pro Minute und IP, weil schon eine Einrichtung mehrere braucht); das Plugin sperrt nach mehreren Fehlversuchen zusätzlich selbst. Nur Konten mit Rolle können 2FA einrichten.

**Rollen-Seite** (`/admin/staff`, nur Betreiber): Liste aller Konten mit Rolle; Suche nach E-Mail (genau) oder Discord-Name (enthält, ab 3 Zeichen) unter vollständigen, nicht gesperrten Konten mit Passwort. `setStaffRole` sperrt die User-Zeile, prüft darunter erneut (nicht der Betreiber selbst, nicht Betreiber als Ziel, vollständig, nicht gesperrt, nicht gelöscht, mit Passwort), setzt die Rolle und löscht die Sessions. Ein Entzug löscht auch die `twoFactor`-Zeile und setzt `twoFactorEnabled = false`. `resetStaffTwoFactor` macht dasselbe ohne die Rolle anzufassen.

**Betreiber:** `setOperator(email)` setzt die Rolle `OPERATOR` (Konto vollständig, mit Passwort, nicht gesperrt) und löscht die Sessions; Skript `apps/bot/src/scripts/set-operator.ts` im Bot-Image (README). Mehrere Betreiber sind möglich, über die Oberfläche lässt sich keiner ändern.

**Sperren und Löschen:** `banUser` lehnt Konten mit Rolle ab („Entziehe zuerst die Rolle.“). `deletedUserData` leert `staffRole` und `twoFactorEnabled`; `deleteAccount` löscht die `twoFactor`-Zeilen.

**Wiederherstellen (Rollen):** Der Export der alten Datenbank (§8, README) enthält zusätzlich alle Konten mit Rolle; `reapplyModeration` setzt die Rollen genau so, also auch entzogene zurück auf null, und löscht bei jeder Änderung die Sessions. Schlüssel enthält der Export nicht. Die zurückgespielten Schlüssel können veraltet sein, etwa wenn nach dem Backup ein verlorenes Gerät zurückgesetzt wurde. Deshalb setzt `reapplyModeration` jede 2FA zurück, und Staff richtet sie beim nächsten Besuch neu ein. Ohne Export (alte Datenbank verloren) prüft der Betreiber die Rollen-Seite und setzt die 2FA dort zurück (README).

### 5.10 Datenauskunft (ab Phase 9)

**Funktion:** `exportAccountData({ userId, now, privacyPolicyUrl, uploadDir })` in `core` (`account-export.ts`) mit `requireAccountUser`: auch gesperrte und unvollständige Konten, keine gelöschten (SPEC N-5). Nur Lesen über den Prisma-Client, in einer Transaktion mit `RepeatableRead`, damit alle Abschnitte denselben Stand zeigen. Das Ergebnis hat deutsche Schlüssel und Anzeigetexte statt Enum-Werten (`labels.ts`; die Status-Texte von Anfragen, Scrims und Benachrichtigungen liegen dafür jetzt in `core`); Zeitpunkte stehen als ISO 8601 in UTC. Jede Abfrage wählt ihre Spalten aus, und Relationen lädt sie einzeln: Prisma lädt Geschwister-Relationen parallel, was die eine Verbindung einer Transaktion nicht erlaubt. Ein Test ordnet jede Spalte jeder Tabelle ein (in der Auskunft oder bewusst nicht, mit Grund), damit eine neue Spalte oder Tabelle nicht still fehlt.

**Abschnitte:**
- `hinweis`, `erstelltAm`: was die Datei ist, Verweis auf die Datenschutzerklärung (Zwecke, Empfänger, Speicherdauer, Rechte) und was fehlt
- `konto`: Konto-ID, Discord-Name (ohne Discord-Verknüpfung `null`, statt des Platzhalters „Neues Konto“), Avatar-URL, E-Mail und ob bestätigt (bei Altkonten `null`, statt des internen Platzhalters, wie auf der Konto-Seite), Vor- und Nachname, Hochschule bzw. Freitext, Zeitpunkte (angelegt, geändert, verifiziert, gesperrt, Hub-Beitritt bzw. DM gescheitert), Rolle, ob 2FA eingerichtet ist, Fehlversuche und Sperre der 2FA (Phase 8)
- `anmeldung`: Discord-ID und wann verknüpft, ob ein Passwort gespeichert ist und wann es zuletzt geändert wurde, offene Links und laufende Anmeldungen aus `verification` (Zeilen mit der User-ID als Wert) nur mit Art und Ablauf
- `sitzungen`: je Session angelegt, zuletzt verlängert (`updatedAt`; Better Auth schreibt die Zeile nur beim Verlängern, nicht bei jeder Nutzung), läuft ab, IP-Adresse, User-Agent
- `prüfungen`: je `VerificationRequest` hochgeladen, Status, entschieden, „von Hand“ oder „automatisch“ (`decidedById` gesetzt, nicht wer), Ablehnungsgrund, Dateityp und -größe, Hochschule bzw. Freitext, ob die Datei noch gespeichert ist (geprüft im Upload-Ordner, weil nach einem Restore `filePath` auf eine fehlende Datei zeigen kann, §8)
- `team`: aktuelles Team wie `findOwnTeam` (eine Mitgliedschaft in einem aufgelösten Team zählt nicht; Name, Kürzel, Rang, gesperrt seit, ab Phase 10 Logo seit), eigene Rolle, Captain ja/nein (`isCaptainOf`), beigetreten; `aufgelösteTeams`: aufgelöste Teams mit `captainId` = Person (Name, Kürzel, gegründet, aufgelöst)
- `anfragen`: Anfragen mit `createdById` = Person (Team, erstellt, Start, Format, Rang-Bereich, Maps, Notiz, Status)
- `feedback`: `ScrimFeedback` mit `submittedById` = Person (eigenes Team, Gegner-Team, Scrim-Start, Antwort, Sterne, abgegeben)
- `nachrichten`: Notifications mit `targetUserId` = Person (heute nur `VERIFICATION_RESULT`) mit Art, Inhalt, Status, Zeitpunkten (angelegt, geplant, gesendet), Zustellversuchen und letztem Fehler; ein Inhalt, der nicht zu seinem Typ passt, bleibt wie gespeichert
- `verwaltung`: eigene Prüf-Entscheidungen (`decidedById`) und Streitfall-Entscheidungen (`resolvedById`) nur mit Datum und Ergebnis, ohne die geprüfte Person bzw. die Teams

**Nicht enthalten:**
- Zugangsdaten: Passwort-Hash, 2FA-Schlüssel und Backup-Codes, Session-Tokens, Tokens offener Mail-Links und laufender Anmeldungen (`verification`); dass es sie gibt, steht in `anmeldung` und `konto`. Discord-Tokens löscht schon der Login (§5.1); stünde doch einer da, fehlt er ebenso.
- Die Datei einer offenen Prüfung, nur ihre Angaben.
- Daten anderer Personen: keine Namen, IDs oder Adressen anderer Nutzer, nicht wer geprüft oder entschieden hat. Teamnamen stehen drin.
- Bewerbungen und Scrims: Teamdaten ohne Verfasser.
- Nachrichten an Teams: Der Empfänger wird erst beim Senden bestimmt (§6.1), sie hängen also an keiner Person.
- Server-Logs, die Zähler des Rate-Limits im Speicher und Backups (Datenschutzerklärung).

**Web:** `GET /api/account/export` (ein Route Handler, weil eine Datei zurückkommt) holt die Session, ruft `exportAccountData` mit `privacyPolicyUrl` = `BETTER_AUTH_URL` + `/datenschutz` (die eigene Adresse des Webs, wie bei den Einladungslinks; fehlt sie, die Adresse der Anfrage) und `UPLOAD_DIR` und antwortet mit eingerücktem JSON: `Content-Disposition: attachment; filename="uni-scrims-daten-<JJJJ-MM-TT>.json"` (Datum in Europe/Berlin), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Ohne Session oder für ein gelöschtes Konto 401. Die Konto-Seite bekommt den Abschnitt „Deine Daten“ mit dem Link „Meine Daten herunterladen“.

### 5.11 Team-Logo (ab Phase 10)

**Verarbeitung:** `processTeamLogo(bytes)` in `team-logo.ts` mit `sharp` (exakt gepinnt, dieselbe Version, die Next schon mitbringt):
1. Höchstens `MAX_LOGO_BYTES` (2 MB); der Typ kommt wie bei `detectUploadType` aus den ersten Bytes (`file-type`), erlaubt sind nur `image/png` und `image/webp`. `image/apng` (PNG mit `acTL`-Chunk) gilt als animiert. Jede Seite höchstens 4096 Pixel, beim Dekodieren zusätzlich `limitInputPixels` = 4096 × 4096, gegen Dekomprimierungsbomben. Animierte Bilder (mehr als eine Seite) werden abgelehnt.
2. Das Bild braucht einen Alphakanal (`hasAlpha`); ob die Fläche wirklich durchsichtig ist, wird nicht geprüft (Entscheidung des Nutzers).
3. Jeder Lesevorgang dreht das Bild zuerst nach seiner EXIF-Ausrichtung aufrecht (`autoOrient`), wie Bildbetrachter es zeigen, und wandelt es in 8-Bit-sRGB mit Alpha (auch 16-Bit- und Graustufenbilder). Nur der Alphakanal kommt als Rohdaten nach JavaScript (ein Byte pro Pixel) und geht an die reine Funktion `logoContentBox`: Rechteck aller Pixel mit Alpha über 8, damit fast unsichtbare Reste den Rand nicht festhalten. Kein Pixel: abgelehnt („komplett durchsichtig“); längere Seite unter 128 px: abgelehnt („zu klein“).
4. Dieses Rechteck ausschneiden und mit `fit: "contain"`, durchsichtigem Hintergrund und Vergrößerung auf 256 × 256 bringen. Die längere Seite füllt das Quadrat, das Logo berührt also mindestens zwei gegenüberliegende Ränder.
5. Ausgabe als verlustfreies WebP. Metadaten (EXIF, GPS, Farbprofile) gehen dabei verloren; die hochgeladene Datei wird nirgends gespeichert.

**Last:** Ein großes Logo braucht kurz einige Dutzend MB und etwas Zeit im Haupt-Thread, und jeder eingeloggte Nutzer kann ein Team gründen. Deshalb läuft in `core` immer nur eine Verarbeitung, höchstens drei warten; weitere bekommen `CONFLICT` („Gerade werden viele Logos hochgeladen …“). Das Web zählt Uploads zusätzlich pro IP wie die Konto-Aktionen (§5.8): 5 pro Minute.

**Schreiben:** `setTeamLogo` und `removeTeamLogo` folgen dem Muster von `updateTeam` (§5.5): Captain ohne Sperre prüfen, Bild außerhalb der Transaktion verarbeiten (CPU-Arbeit hält keine Sperre), dann `lockTeam`, `requireCaptain` erneut, `TeamLogo` schreiben bzw. löschen und `Team.logoUpdatedAt` setzen bzw. leeren. Verifizierung ist nicht nötig, ein gesperrtes Team darf nicht. `removeTeamLogoAsAdmin` braucht `requireAdmin` und geht auch bei gesperrten Teams; aufgelöste Teams haben kein Logo mehr. Es bekommt die `logoVersion`, die der Admin gesehen hat, und lehnt mit `CONFLICT` ab, wenn der Captain inzwischen ein anderes Logo hochgeladen hat.

**Lesen:** Die Lesefunktionen liefern pro Team `logoVersion` (`logoUpdatedAt` in ms oder null): `teamCardSelect`/`toTeamCard`, `getMyScrims`, `getMyTeam`, `getTeamByInviteCode`, `searchModerationTargets`. Das Web baut daraus `/api/teams/<id>/logo?v=<logoVersion>`. Der Route Handler verlangt eine Session (401), `getTeamLogo` prüft `requireUser` (gesperrt oder unvollständiges Konto: 403; die Zuordnung der Fehlercodes teilt sich die Route mit `/api/admin/uploads/[id]`) und liefert für aufgelöste Teams und Teams ohne Logo `NOT_FOUND` (404), sonst Bild und aktuelle Version. Antwort: `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`; `Cache-Control: private, max-age=31536000, immutable` nur, wenn `v` die aktuelle Version ist (ein neues Logo hat eine neue URL), sonst `no-store`, damit eine alte URL nie ein neueres Logo behält.

**Web:** `TeamAvatar` bekommt das Team (`id`, `tag`, `logoVersion`) und zeigt mit Logo das Bild statt des Kürzels (dekorativ, `alt=""`, der Teamname steht daneben), ohne Rahmen und ohne Akzentfarbe für das eigene Team; wo zwei Avatare überlappen (Meine Scrims), bekommt ein eigenes Logo die Kartenfarbe als Hintergrund. Auf der Team-Seite hat der Captain in „Team bearbeiten“ einen Abschnitt „Logo“ (Hochladen, Entfernen, Größenprüfung im Browser wie beim Upload der Bescheinigung). Auf `/admin/bans` zeigen Team-Treffer das Logo und „Logo entfernen“.

**Speicher:** In der Datenbank statt im Upload-Ordner: Der Janitor löscht dort jede Datei ohne Prüfung nach 24 h, Uploads werden nicht gesichert (§8), und der Bot hat das Volume nicht. Ein Logo ist höchstens wenige Dutzend KB groß.

---

## 6. Bot

### 6.1 Notification-Typen (vollständig)

| Typ | Auslöser | Ziel / Kanal | Zeitpunkt | Entität im dedupeKey | Relevanzprüfung vor dem Senden |
|---|---|---|---|---|---|
| `VERIFICATION_RESULT` | Admin-Entscheidung oder Auto-Ablehnung | User, USER_DM | sofort | verificationId | Nutzer nicht gelöscht (`deleteAccount` löscht seine Notifications, §5.5) |
| `APPLICATION_RECEIVED` | `applyToRequest` | Ersteller-Team, CAPTAIN_DM | sofort | **applicationId** | Anfrage noch OPEN |
| `APPLICATION_REJECTED` | anderes Team bestätigt | Bewerber-Team, CAPTAIN_DM | sofort | applicationId | – |
| `REQUEST_DELETED` | `deleteRequest`, `retireTeamActivity` | Bewerber-Team, CAPTAIN_DM | sofort | requestId | – |
| `REQUEST_EXPIRED` | Sweeper | Bewerber-Team, CAPTAIN_DM | sofort | requestId | – |
| `SCRIM_BOOKED` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | sofort | scrimId | Scrim noch SCHEDULED, beide Teams aktiv |
| `SCRIM_CANCELLED` | `cancelScrim`, `retireTeamActivity` | jeweils anderes Team, CAPTAIN_DM + TEAM_CHANNEL | sofort | scrimId | – |
| `REMINDER_24H` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | startsAt − 24 h | scrimId | Scrim SCHEDULED, startsAt > now, beide Teams aktiv |
| `REMINDER_1H` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | startsAt − 1 h | scrimId | Scrim SCHEDULED, startsAt > now, beide Teams aktiv |
| `FEEDBACK_PROMPT` | `confirmApplication` | beide Teams, CAPTAIN_DM + TEAM_CHANNEL | feedbackOpensAt | scrimId | Scrim in SCHEDULED/AWAITING_FEEDBACK, `feedbackDeadline` noch nicht erreicht (auch wenn der Sweeper noch nicht ausgewertet hat) und dieses Team hat noch nicht geantwortet |
| `CHANNEL_BROKEN` | Sender bei Channel-Fehler | betroffenes Team, CAPTAIN_DM | sofort | **ID der fehlgeschlagenen Notification** | – |

Bei allen Typen an Teams gilt zusätzlich: Team ist nicht aufgelöst.

Test: Zwei Bewerbungen auf dieselbe Anfrage erzeugen zwei `APPLICATION_RECEIVED`-Einträge.

Alle Nachrichten enthalten einen **Link-Button** zur passenden Seite (`PUBLIC_BASE_URL/...`). Der gegnerische Captain wird immer mit **Name und Mention** `<@discordId>` ausgegeben (die Mention kann auf fremden Servern als unbekannter Nutzer erscheinen). Er wird wie der Empfänger erst beim Senden aufgelöst (aktueller Captain des anderen Scrim-Teams) und steht in allen Scrim-Nachrichten (`SCRIM_BOOKED`, `SCRIM_CANCELLED`, Reminder, `FEEDBACK_PROMPT`). Alle Nachrichten senden mit `allowedMentions: { parse: [] }`, damit niemand gepingt wird.

**Nutzertext wird entschärft:** Teamnamen und andere Nutzereingaben laufen vor dem Einbetten durch `escapeMarkdown` aus discord.js (in `messages/*`), damit niemand über den Bot maskierte Links verschicken kann. Eckige Klammern werden zusätzlich alle von Hand escapt, weil die Option `maskedLink` nur den ersten Link eines Textes erwischt. Ebenso `<`, damit ein Teamname wie `<@&id>` als Text erscheint und nicht als Rollen- oder Nutzer-Mention. Anfrage-Notizen und Bewerbungsnachrichten werden **nicht** in Bot-Nachrichten übernommen, nur auf der Website angezeigt.

Eine Sperre während der Bestätigung kann keinen Scrim mit einem gesperrten Team erzeugen, weil `confirmApplication` beide Team-Zeilen sperrt (§5.4). Die Relevanzprüfung auf aktive Teams bleibt als zweite Absicherung, z. B. für Änderungen von Hand in der Datenbank.

`core` legt TEAM_CHANNEL-Einträge immer an. Der Sender verwirft sie mit Status CANCELLED, wenn das Team keinen Channel verknüpft hat.

### 6.2 Outbox-Sender (alle 5 s)

**Sender und Sweeper laufen als sequenzielle Schleifen**: Batch abarbeiten, `await`, dann 5 s (Sender) bzw. 60 s (Sweeper) schlafen. **Nie `setInterval`**, sonst überlappen sich langsame Durchläufe (Rate-Limits) und Einträge werden doppelt gesendet. Der Bot läuft als genau eine Instanz.

```
SELECT * FROM Notification
 WHERE status = 'PENDING' AND scheduledFor <= $now
 ORDER BY scheduledFor LIMIT 20
```

Für jeden Eintrag (`deliverNotification` in `core`; der Bot übergibt nur die Sendefunktion und baut die Embeds):

1. **Relevanzprüfung** laut Tabelle. Nicht mehr relevant → CANCELLED. Passt der Payload nicht zum Schema seines Typs → `FAILED` ohne Retry.
2. **Empfänger auflösen:** USER_DM → `targetUserId`; CAPTAIN_DM → aktueller `Team.captainId`; TEAM_CHANNEL → `Team.discordChannelId` (fehlt er, CANCELLED). Hat der Empfänger keine Discord-ID mehr (gelöschtes Konto), CANCELLED. In Dev greifen hier `DEV_DM_REDIRECT_DISCORD_ID` und `DEV_CHANNEL_ID` (§7).
3. Embed aus `messages/<type>.ts` bauen und senden.
4. Erfolg: `SENT` + `sentAt`; bei DM `User.dmFailedAt = null`, außer das Konto wurde inzwischen gelöscht (`updateMany` mit Ausschluss der Lösch-Mail, §4).
5. Fehler (`attempts` zählt die fehlgeschlagenen Sendeversuche):
   - **50007 (DM nicht möglich):** `FAILED` ohne Retry, `User.dmFailedAt = now` (ebenfalls nicht bei einem inzwischen gelöschten Konto).
   - **Channel-Fehler** (10003 Unknown Channel, 50001 Missing Access, 50013 Missing Permissions): `FAILED`, in einer Transaktion, die zuerst die Team-Zeile sperrt (gleiche Reihenfolge wie `leaveTeam`, sonst Deadlock). `Team.discordChannelId = null` nur, wenn der Team-Channel noch der fehlgeschlagene ist (nicht ein inzwischen per `/setup` neu gesetzter, nicht der Dev-Channel), und nur dann `CHANNEL_BROKEN` anlegen. So kommt der Hinweis einmal, auch wenn mehrere Posts in denselben Channel scheitern.
   - **Alles andere:** Nach dem n-ten Fehlschlag (n = 1…5) `lastError` und `scheduledFor = now + 2^(n−1) Minuten` (1, 2, 4, 8, 16). Der 6. Fehlschlag setzt `FAILED`.
   - Jedes `FAILED` setzt `scheduledFor = now`: Ein fehlgeschlagener Eintrag wird nie wieder gesendet, das Feld hält dann den Zeitpunkt des letzten Versuchs. Danach sortiert die Admin-Liste, und davon zählt die Aufbewahrung (§6.3). Ebenso setzt jedes `CANCELLED` (Relevanzprüfung, Absage eines Scrims) `scheduledFor = now`, den Zeitpunkt der Absage.
6. Reminder, deren `startsAt` beim Retry schon vorbei ist, werden CANCELLED (Relevanzprüfung).

Um den Discord-Aufruf liegt **keine Transaktion**: lesen, senden, Ergebnis schreiben. Das Ergebnis wird nur geschrieben, solange der Eintrag noch PENDING ist (`updateMany … WHERE status = 'PENDING'`). Sonst würde ein Retry einen Eintrag wiederbeleben, den z. B. `cancelScrim` währenddessen storniert hat.

**Duplikate:** Stürzt der Bot genau zwischen Senden und `SENT` ab, kann eine Nachricht doppelt kommen. Das ist akzeptiert (at-least-once).

### 6.3 Sweeper (jede Minute)

Alle Schritte sind idempotent und leiten sich nur aus dem DB-Zustand ab. Nach einem Bot-Ausfall holt der Sweeper alles nach. Die Sweeper-Schleife startet mit dem Bot-Prozess und braucht keine Discord-Verbindung; der Sender startet erst nach dem Login, und ein gescheiterter Login wird jede Minute wiederholt, ohne den Prozess zu beenden. So laufen Fristen und Löschungen auch weiter, solange sich der Bot nicht bei Discord anmelden kann.

1. `expireRequests(now)`: `ScrimRequest` OPEN mit `startsAt <= now` → `EXPIRED`; PENDING-Bewerbungen → REJECTED; `REQUEST_EXPIRED` an die Bewerber.
2. `openFeedback(now)`: `Scrim` SCHEDULED mit `feedbackOpensAt <= now` → `AWAITING_FEEDBACK`. **Unabhängig davon, ob der FEEDBACK_PROMPT zugestellt wurde.**
3. `resolveDeadlines(now)`: `Scrim` AWAITING_FEEDBACK mit `feedbackDeadline <= now` → auswerten mit Zeilensperre (siehe §5.6).
4. `finishInterruptedDeletions()`: gelöschte Konten (`deletedAt` gesetzt), denen ein überholender Login Name, Avatar und Mail zurückgeschrieben hat und deren Rücknahme im Login-Hook scheiterte (§5.1), wieder auf die Lösch-Werte setzen und ihre Sessions löschen.
5. `purgeExpiredSessions(now)`: Sessions mit `expiresAt < now` löschen. Better Auth löscht eine abgelaufene Session nur, wenn ihr Cookie noch einmal kommt; ohne diesen Schritt blieben IP-Adresse und User-Agent nie zurückkehrender Geräte unbegrenzt liegen.
6. `purgeStaleOAuthTokens(now)`: Discord-Tokens, deren `account`-Zeile seit mehr als 10 Minuten unverändert ist, löschen. Der Login-Hook löscht sie Sekunden nach dem Login (§5.1); dieser Schritt fängt einen Hook ab, der scheiterte oder wegen eines Absturzes nicht lief.
7. `purgeOldNotifications(now)`: Notifications mit Status ≠ PENDING löschen, sobald `createdAt`, `scheduledFor` **und** (falls gesetzt) `sentAt` älter als 30 Tage sind. `scheduledFor` ist bei fehlgeschlagenen Einträgen der letzte Versuch, bei abgesagten der Zeitpunkt der Absage (§6.2); `sentAt` der tatsächliche Versand, auch wenn er sich nach einem Bot-Ausfall verspätet. So bleibt ein Reminder, der Wochen nach der Buchung scheitert, 30 Tage in der Admin-Liste, und ein abgesagter Reminder für einen Scrim in vielen Wochen wird trotzdem 30 Tage nach der Absage gelöscht. Dieser Schritt läuft nur einmal pro Stunde (direkt nach dem Start, dann eine Stunde nach dem letzten gelungenen Lauf; ein gescheiterter wird im nächsten Durchlauf wiederholt).
8. Heartbeat: Nach jedem Durchlauf schreibt die Sweeper-Schleife `SystemStatus('bot').heartbeatAt` mit der Zeit nach den Schritten (nicht der vom Start, sonst wäre er bei langen Durchläufen schon beim Schreiben alt). Die Outbox-Schleife schreibt nach jedem Durchlauf und nach jeder Nachricht innerhalb eines Durchlaufs höchstens einmal pro Minute `SystemStatus('outbox')`; so zeigt ein durch Rate-Limits langsamer Versand nicht "offline", ein hängender schon. Die Admin-Seite zeigt "Bot offline", wenn einer der beiden Werte älter als 3 Minuten ist, und nennt dann die betroffene Schleife; so fällt auch ein hängender Versand auf. "Bot läuft" heißt also, dass beide Schleifen arbeiten, nicht, dass Discord jede Nachricht annimmt: Scheitert die Zustellung, wiederholt der Sender sie (§6.2), und dauerhaft gescheiterte Nachrichten stehen in der Liste fehlgeschlagener Nachrichten.

`runSweeper(now, { purge })` führt die Schritte 1–7 in dieser Reihenfolge aus, Schritt 7 nur mit `purge`. Ein fehlschlagender Schritt wird geloggt und hält die anderen nicht auf (der nächste Durchlauf versucht es erneut); den Heartbeat schreibt die Schleife danach immer. Die Takt-Entscheidungen der Schleifen (Heartbeat-Drossel, Fälligkeit des Aufräumens) liegen in testbaren Funktionen im Bot (`createHeartbeat`, `outboxTick`, `createPurgeSchedule`, `sweeperTick`).

### 6.4 Slash-Command `/setup`

- Option `channel` (Text-Channel), Pflicht.
- Prüft: Der aufrufende Discord-User ist Captain eines nicht gesperrten Teams (`linkTeamChannel` in core über `findUserByDiscordId` und `requireOwnCaptain`, unter der Team-Sperre erneut geprüft; Verifizierung ist wie bei der Teamverwaltung nicht nötig); der Server ist nicht der Hub (`HUB_GUILD_ID`), denn dort darf der Bot schreiben, und jedes verknüpfte Team würde öffentlich posten; der Bot hat in dem Channel `ViewChannel`, `SendMessages` und `EmbedLinks`.
- Speichert `discordGuildId` und `discordChannelId` und postet eine Test-Nachricht.
- Antwortet ephemeral mit Erfolg oder einer konkreten Fehlermeldung.

---

## 7. Web: Muster

- **Server Actions** für alle Mutationen. Jede Action läuft gleich ab: Session holen → Zod-Validierung → `core`-Funktion → `revalidatePath`. Es gibt keine separate REST-API. Nach Erfolg setzen einige Actions eine Erfolgsmeldung als kurzlebiges Cookie (`flash`, `lib/flash.ts`); die nächste Seite zeigt sie 3,5 s als Toast über dem Inhalt und löscht das Cookie.
- **Berechtigungen** zentral in `core/permissions.ts`: `requireUser` (eingeloggt, nicht gesperrt), `requireVerified`, `requireCaptain(teamId)` (aktueller Captain eines aktiven Teams; prüft zuerst die Mitgliedschaft, damit Nicht-Mitglieder für aktive, gesperrte und aufgelöste fremde Teams dieselbe Antwort bekommen und keine Sperre erfahren, §4), `requireActingCaptain(teamId)` (= `requireCaptain` + selbst verifiziert), `requireTeamMember(teamId)`, `requireTeamReady(teamId)`, `requireAdmin`, `requireOwnCaptain` (= `requireCaptain` für das eigene Team, für `/setup`, wo keine Team-ID mitkommt), `requireAccountUser` (eingeloggt, auch gesperrt, aber nicht gelöscht, also weder mit Lösch-Platzhalter noch ohne Discord-Verknüpfung; nur für die Kontolöschung; ab Phase 7 auch für unvollständige Konten, und als gelöscht gilt ohne Discord-Verknüpfung nur noch ein Konto mit `deletedAt`, §5.8), ab Phase 7 `requireActiveAccountUser` (= `requireAccountUser`, aber nicht gesperrt: Name, E-Mail und Passwort ändern, Altkonto vervollständigen, Captain-Rolle von der Konto-Seite übertragen). Die Mitgliedschaft liest überall `findOwnTeam` (Team des Nutzers, wenn nicht aufgelöst), auch in den Lesefunktionen. Admin = die Discord-ID aus `account.accountId` steht in `ADMIN_DISCORD_IDS` (bis Phase 7; ab Phase 8 die Rolle in `User.staffRole`, `requireStaff` und Co., §5.9). Für Scrim-Aktionen zusätzlich `requireOwnActingCaptain` (für das eigene Team) und `requireScrimActingCaptain` (Captain eines der beiden Scrim-Teams). Die Lesefunktionen nutzen dafür die Prädikate `isCaptainOf`, `isScrimTeam`, `canSeeApplications`, `actingCaptainProblem` (= `captainProblem` für Sperre und Captain-Rolle, dann `captainVerificationProblem`; die einzige Stelle, die diese Reihenfolge festlegt) und `teamReadyProblem` aus `permissions.ts`, die Team-Regeln `isTeamActive` (als Filter `activeTeamWhere`), `isVerifiedMember`, `countsForReadiness` (verifiziert und kein Coach) und `isReadyCount` aus `readiness.ts` (Posten, Bewerben und Bestätigen brauchen ein spielbereites Team) sowie die Buchungsregeln `isRequestOpen` (als Filter `openRequestWhere`), `applicantTeamProblem` (aus der DB: `findApplicantTeamProblem`), `openRequestLimitProblem` und `requestPostingProblems` aus `requests.ts`, die auch die Mutationen verwenden. Ein `Problem` hat Art (`kind`), Fehlercode und Text. Für Sperre, Captain-Rolle, Verifizierung, Spielbereitschaft und Anfrage-Limit werfen `requireCaptain`, `requireActingCaptain`, `requireTeamReady` und `createRequest` solche Gründe, ebenso alles, was darauf aufbaut (`requireOwnActingCaptain`, `requireScrimActingCaptain`, also auch Bewerben, Bestätigen, Absagen und Feedback); die Seiten zeigen denselben Text. Einfache Texte liefern `requireUser`, `requireVerified`, `requireTeamMember`, `requireAdmin`, die Meldungen „Du bist in keinem Team.“ und „Scrim nicht gefunden.“ sowie die Prüfung des Bewerber-Teams (`applicantTeamProblem`). Unter der Team-Sperre liest `createRequest` Mitgliedschaft und Team neu (`requireTeamMember`) und wirft dann den ersten Grund aus `requestPostingProblems`. `getRequestForm` zeigt dem Captain alle Gründe auf einmal (Verifizierung, Spielbereitschaft, Limit), anderen Mitgliedern nur, dass es der Captain tun muss; eine Sperre ist im MVP endgültig und deshalb dann der einzige Grund. Die Seite verlinkt je nach Art dorthin, wo sich der Grund beheben lässt (Team, Verifizierung, Board). Pro Aktion liefern die Lesefunktionen, ob sie erlaubt ist oder warum nicht (`getScrimDetail`: `canCancel`, `canGiveFeedback`; `getRequestDetail`: `apply`, `withdraw`, `remove`, `confirm` und `canConfirm` pro Bewerbung; `getRequestForm`: die Gründe). Steuerelemente, die nur der Captain je nutzen kann, sehen andere Mitglieder nicht (Link „Anfrage erstellen“ auf dem Board, Teamverwaltung, „Anfrage löschen“). Beim Bewerben, Zurückziehen und Bestätigen, auf `/requests/new` sowie beim Absagen und beim Feedback auf der Scrim-Seite sehen sie stattdessen den Grund („Das kann nur euer Captain.“ bzw. bei gesperrtem Team „Das Team ist gesperrt.“). So bieten Seiten nur Aktionen an, die `core` auch erlaubt, und zeigen sonst den Grund. Die Mutationen prüfen trotzdem selbst in ihrer Transaktion.
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
| Gegnerischer Captain | erst nach der Buchung, für Mitglieder beider Teams; in den Scrim-Nachrichten des Bots mit Discord-Mention auch im verknüpften Team-Channel des Gegners, also für alle, die diesen Channel lesen (§6.1, steht in der Datenschutzerklärung) |
| Team anlegen, beitreten, verlassen; Upload | eingeloggt, nicht gesperrt |
| Konto löschen (`/account`, nur die Löschaktion) | eingeloggt, **auch gesperrt** |
| Team bearbeiten, Einladung erneuern, Captain übertragen, Mitglied entfernen, Rollen setzen (Spieler, Ersatz, Coach) | aktueller Captain (Verifizierung nicht nötig, damit er das Team aufbauen kann) |
| Team-Channel verknüpfen (`/setup` in Discord) | aktueller Captain, nicht gesperrt (Verifizierung nicht nötig); nicht auf dem Hub-Server (§6.4) |
| Anfrage erstellen/löschen, bewerben, zurückziehen, bestätigen, Scrim absagen, Feedback | aktueller Captain, **selbst verifiziert**, nicht gesperrt |
| Admin-Bereich, Datei-Abruf | Admin (ab Phase 8 nach Rolle, §5.9) |
| Ab Phase 8: Prüf-Queue, Datei-Abruf | Prüfer, Admin, Betreiber, jeweils mit eingerichteter 2FA |
| Ab Phase 8: Streitfälle, Sperren, fehlgeschlagene Nachrichten, Bot-Status, Statistik | Admin, Betreiber, mit 2FA |
| Ab Phase 8: Rollen vergeben, 2FA zurücksetzen (`/admin/staff`) | Betreiber, mit 2FA |
| Ab Phase 7: Konto-Seite, „Konto vervollständigen“, „Discord verknüpfen“ | eingeloggt, auch mit unvollständigem Konto (§5.8); alles andere aus dieser Tabelle zusätzlich nur mit vollständigem Konto |
| Ab Phase 7: Klarname | die Person selbst und Admins (Prüf-Queue); ab Phase 8 auch Prüfer, und der Betreiber auf der Rollen-Seite |
| Ab Phase 9: Datenauskunft (`/api/account/export`) | eingeloggt, auch gesperrt oder mit unvollständigem Konto, nicht gelöscht; nur die eigenen Daten |
| Ab Phase 10: Team-Logo hochladen, ersetzen, entfernen | aktueller Captain eines nicht gesperrten Teams (Verifizierung nicht nötig) |
| Ab Phase 10: Team-Logo ansehen (`/api/teams/[id]/logo`) | eingeloggt, nicht gesperrt (wie Team-Karten) |
| Ab Phase 10: Team-Logo entfernen (Moderation, `/admin/bans`) | Admin, Betreiber, mit 2FA |

`leaveTeam` funktioniert für Nicht-Captains auch in gesperrten Teams. Nach Verlassen oder Auflösen sind vergangene Scrims für ehemalige Mitglieder nicht mehr sichtbar (gewollt).
- **Zeit:** Eingabe im Formular in Europe/Berlin, Umrechnung nach UTC in `core`. Keine Zeitlogik im Browser.
- **UI:** Tailwind + shadcn/ui, komplett auf Deutsch, mobilfreundlich. Optik nach dem Design-Handoff (Richtung A „Klar“, Tokens in `apps/web/app/globals.css`); Funktionen und Felder bleiben wie in SPEC und hier beschrieben. Abweichung vom Design: Der Header zeigt das Burger-Menü bis 767 px, weil die Desktop-Navigation erst ab 768 px in die Breite passt. Auswahlfelder sind ein eigenes Select auf Base UI (`components/ui/select.tsx`) statt des OS-Menüs, Datumsfelder ein eigener Monatskalender in einem Base-UI-Popover (`components/ui/date-picker.tsx`, Wochen ab Montag, Tage vor `min` gesperrt, Wert wie beim nativen Feld `YYYY-MM-DD`), damit sie überall gleich aussehen und so hoch sind wie die Eingabefelder; ohne JavaScript lässt sich die Auswahl nicht ändern, die Formulare schicken dann den Startwert.

### Entwicklung und Tests

| Env-Variable | Wirkung (nur bei `NODE_ENV=development`, in Production hart deaktiviert) |
|---|---|
| `DEV_LOGIN=true` | "Als Seed-Nutzer einloggen", damit du zwei Teams parallel testen kannst (normales + privates Fenster) |
| `DEV_DM_REDIRECT_DISCORD_ID` | Alle DMs gehen an diese Discord-ID (deinen Account), mit Präfix "[an: <Name>]". Nötig, weil Seed-Nutzer erfundene Discord-IDs haben. |
| `DEV_CHANNEL_ID` | Alle Team-Channel-Posts gehen in diesen Channel, auch von Teams ohne `/setup` (Seed-Captains können `/setup` nicht ausführen), mit Präfix "[an: <Teamname>]" |
| `DEV_TIME_OFFSETS=true` | Nur für **manuelle** Tests. Zeiten in Minuten: Reminder 24 h → 3 min, 1 h → 1 min, `FEEDBACK_OFFSET` → 2 min nach Start, `FEEDBACK_WINDOW` → 5 min ab Feedback-Hinweis, Prüf-TTL → 10 min. Erlaubt außerdem Startzeiten ab 5 Minuten in der Zukunft. |

- **`DEV_HOST`** (Shell-Variable für `pnpm dev`, nicht in der `.env`): bindet den Web-Dev-Server an diese Adresse. Ohne sie lauscht `next dev` auf allen Schnittstellen; auf einem Server mit Dev-Login deshalb `DEV_HOST=127.0.0.1` und Zugriff per SSH-Portweiterleitung (README).
- **Automatische Tests kontrollieren die Zeit über den `now`-Parameter** (siehe Zeit-Regel in §3), nicht über `DEV_TIME_OFFSETS`.
- **Testdatenbank:** zweite Postgres-DB in `docker-compose.dev.yml` (App-DB auf Host-Port 5433, überschreibbar mit `DB_PORT`; Test-DB auf 5434 mit tmpfs, damit sie nicht mit einem lokal installierten Postgres auf 5432 kollidieren), `DATABASE_URL_TEST`. Der Vitest-`globalSetup` setzt `DATABASE_URL` auf `DATABASE_URL_TEST` und bricht ab, wenn beide gleich sind. Vor dem Testlauf `prisma migrate reset --force` gegen die Test-DB. Für DB-Tests in der Vitest-Config `fileParallelism: false`.
- **Unit-Tests** (Vitest) für alle `core`-Funktionen, insbesondere `resolveScrimOutcome` (jede Tabellenzeile, beide Richtungen), `confirmApplication`, `cancelScrim`, `retireTeamActivity`, `getReliability`.
- **Gleichzeitigkeit:** zwei parallele `confirmApplication`-Aufrufe auf derselben Anfrage ergeben genau einen Scrim; zwei parallele `submitFeedback` mit PLAYED ergeben sofort `COMPLETED`; paralleles `applyToRequest` und `confirmApplication` hinterlässt keine PENDING-Bewerbung auf einer nicht offenen Anfrage; zwei parallele `joinTeam` überschreiten das Limit von 10 nicht. Dazu die Fälle der Sperrreihenfolge (§4, `test/races.test.ts`): paralleles `applyToRequest` und `banTeam`/`banUser` hinterlässt keine PENDING-Bewerbung des gesperrten Teams; paralleles `joinTeam`/`createTeam` und `banUser`/`deleteAccount` hinterlässt keine Mitgliedschaft des gesperrten bzw. gelöschten Nutzers in einem aktiven Team; paralleles `submitVerification` und `deleteAccount`/`banUser` hinterlässt keine PENDING-Prüfung und keine Datei; `banUser` und `deleteAccount` parallel lassen die Sperre nie verloren gehen; `decideVerification` bzw. Janitor parallel zu `deleteAccount` oder `banUser` laufen ohne Deadlock; zwei Teams, die sich gegenseitig beworben haben, lassen sich gleichzeitig sperren; `deleteAccount` und das Löschen oder Verfallen einer Anfrage mit seiner Notiz laufen ohne Deadlock; `updateTeam`/`regenerateInvite` parallel zur Auflösung lassen Name und Einladungslink frei; `submitFeedback` parallel zu `deleteAccount` läuft ohne Deadlock.

---

## 8. Infrastruktur

### docker-compose (Production)

| Service | Image / Build | Details |
|---|---|---|
| `caddy` | `caddy:2` | Reverse Proxy mit automatischem HTTPS. Ports 80/443. `request_body { max_size 6MB }`. |
| `web` | Build `apps/web` (Next.js `output: standalone`, `node:24-slim`) | `ENV HOSTNAME=0.0.0.0` und `ENV PORT=3000` im Web-Target (Docker setzt `HOSTNAME` sonst auf die Container-ID, und der Standalone-Server lauscht nicht auf localhost). Volume `uploads:/data/uploads`; das Image legt `/data/uploads` für den Nutzer `node` an, weil ein neues Volume Besitzer und Rechte dieses Ordners übernimmt. `docker/legal` schreibgeschützt nach `/config/legal`. Healthcheck per Node, weil `node:24-slim` weder `curl` noch `wget` enthält: `node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` |
| `bot` | Build `apps/bot` (`node:24-slim`) | Kein offener Port. Kein Zugriff auf das Upload-Volume. Läuft ohne eigenen Build-Schritt per `node --import tsx` (kein Bundler nötig). Den Prisma-Client erzeugt die Stage `bot-build` (die CLI ist eine Dev-Abhängigkeit), das Target `bot` kopiert ihn. |
| `migrate` | **eigenes Build-Target** `migrate` im Dockerfile, basierend auf `packages/db` mit Prisma-CLI, `prisma.config.ts` und `migrations/`; installiert `openssl` für die Schema-Engine | Einmal-Job: `prisma migrate deploy`. Das Web-Image (standalone) enthält weder CLI noch Migrationen. `web` und `bot` starten erst danach (`depends_on: condition: service_completed_successfully`). Enthält außerdem den generierten Client (aus `bot-build`) und den Seed, damit sich die Hochschul-Liste in Production einmalig einspielen lässt: `seed.ts --universities-only` legt nur die Hochschulen an, ohne Test-Teams (README). |
| `db` | `postgres:17` | Volume `pgdata`. Port nicht nach außen freigeben. |

Alle Services mit Log-Rotation: `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }`.

Die Datei ist `docker/docker-compose.yml` und wird aus dem Repo-Root mit `docker compose --env-file .env -f docker/docker-compose.yml …` aufgerufen. Die Container von `web` und `bot` bekommen die Root-`.env` per `env_file`; `DATABASE_URL` setzt die Compose-Datei selbst aus `POSTGRES_PASSWORD` zusammen (deshalb hex, URL-sicher). Caddy bekommt nur `DOMAIN`, die Datenbank nur ihr Passwort.

Belegt auf dem Server schon ein nginx die Ports 80/443, bleibt `caddy` per Compose-Ergänzung aus, `web` wird nur auf `127.0.0.1` veröffentlicht, und nginx übernimmt TLS, HSTS und das Body-Limit (README, „Variante: Server mit vorhandenem nginx“).

**Stolperstelle Docker-Build:** Next.js `standalone` im pnpm-Monorepo mit dem Prisma-7-Client außerhalb von `node_modules`. Lösung: `outputFileTracingRoot` auf das Monorepo-Root setzen, `packages/db` und `packages/core` per `transpilePackages` einbinden, Prisma-Client im Build-Schritt explizit generieren. Der Client wird erst beim ersten Zugriff erzeugt, weil `next build` die Route-Module ohne `DATABASE_URL` lädt. Die Root-`.env` lädt `next.config.ts` per `dotenv`, weil Next selbst nur `apps/web/.env*` liest. **Der Docker-Build muss schon in Phase 0 einmal grün laufen.**

### Backups

Nächtlich `pg_dump` per Cron auf dem Host (`docker/backup.sh`), verschlüsselt auf einen externen Speicher (z. B. Storage Box) kopieren und 14 Tage aufbewahren. Das Alter steht im Namen (UTC); gelöscht wird, was älter als 14 Tage abzüglich zwei Stunden ist, sodass das Backup von vor 14 Nächten in dieser Nacht wegfällt (auch wenn der Cron nach einer Zeitumstellung früher läuft). Die Frist gilt auch bei gescheiterten Läufen: Das Skript löscht alte Backups lokal vor dem Dump und spiegelt mit `--delete` auch ohne neuen Dump. Nur das jüngste Backup bleibt immer erhalten, auch wenn es älter als 14 Tage wird, damit bei dauerhaft scheiterndem Dump nicht gar kein Backup übrig bleibt; das steht in der Datenschutzerklärung. Ist der externe Speicher nicht auflistbar, bricht das Skript ab (dort kann es dann auch nichts löschen). Liegen extern Backups, die noch nicht abgelaufen sind, oder das extern jüngste (ohne neueres lokales), die lokal fehlen (neu aufgesetzter Server), spiegelt es nicht, löscht extern aber die abgelaufenen. Fehlschläge enden mit Fehlercode; die Cron-Zeile schickt dann das Ende des Logs per `MAILTO` (braucht einen Mailer auf dem Server, README). Getestet wird das Skript mit Platzhaltern für Docker und GPG (`docker/test/backup.test.ts`). Uploads werden **nicht** gesichert; Team-Logos (ab Phase 10) liegen in der Datenbank und sind deshalb in den Backups. Ein Logo, das ein Admin nach dem Backup entfernt hat, kommt mit einem Restore zurück (`reapplyModeration` kennt nur Sperren und Löschungen) und muss erneut entfernt werden. Gelöschte Konten bleiben bis zum Ablauf in den Backups; das steht in der Datenschutzerklärung. **Hoster-Snapshots für den VPS deaktivieren**, sonst landen Uploads doch in Backups.

**Wiederherstellen** (README): Web und Bot stehen still, solange die alte Datenbank exportiert und ersetzt wird. Der Dump wird auf dem Rechner mit dem privaten Schlüssel entschlüsselt und per SSH direkt in eine frisch angelegte, leere Datenbank eingespielt (kein unverschlüsselter Dump auf Platte; `--single-transaction`, also alles oder nichts; leer, damit Objekte späterer Migrationen nicht stehen bleiben), danach läuft der Migrate-Job. Sperren und Kontolöschungen nach dem Backup fehlen dann; solange die alte Datenbank lesbar ist, exportiert eine SQL-Abfrage sie (alle gesperrten Teams, auch aufgelöste; gesperrte Nutzer mit Discord-ID; alle Konten mit `deletedAt`), und `reapplyModeration` (Skript `apps/bot/src/scripts/reapply-moderation.ts`, im Bot-Image, liest den Export von stdin) zieht sie nach: ab Phase 8 zuerst die Rollen setzen und jede 2FA zurücksetzen (§5.9), dann Teams sperren, Nutzer über ihre Discord-ID sperren (unbekannte als Sperr-Platzhalter wie nach einer Löschung, §4), Konten erneut löschen. Ein gesperrter oder gelöschter Nutzer, der im Backup noch Captain eines in der alten Datenbank nicht gesperrten Teams ist, gibt die Rolle vorher an das am längsten dabei befindliche Mitglied ab (ohne weitere Mitglieder verlässt er das Team, das sich damit auflöst); sonst träfe die Sperre ein Team, das in der alten Datenbank weiterspielte. Idempotent, ohne Berechtigungsprüfung, nur für den Betrieb; gestartet werden Web und Bot erst, wenn alles geklappt hat. Ist die alte Datenbank verloren, fehlen diese Änderungen (seit dem letzten gelungenen Backup, normalerweise höchstens ein Tag; SPEC §9). Offene Prüfungen ohne Datei zeigt die Queue als "Datei fehlt"; der Admin lehnt sie ab (§5.2).

**Log-Fristen:** Container-Logs rotieren nach Größe (oben). Die nginx-Logs mit IP-Adressen (Variante mit vorhandenem nginx) und das Backup-Log liegen in `/var/log/uni-scrims/` mit eigener logrotate-Regel (täglich, auch leere Dateien, höchstens 14 Tage, README); ein eigener Ordner, damit die Frist nicht von den Regeln anderer Seiten auf dem Server abhängt.

### Server

- Kleiner VPS (2 vCPU, 4 GB RAM) reicht.
- Firewall: für Uni Scrims nur 22, 80, 443. Auf einem geteilten Server öffnet sie zusätzlich die Ports der anderen Dienste; Uni Scrims selbst ist dort nur über nginx erreichbar (`web` auf `127.0.0.1`). Ports, die Docker veröffentlicht, umgehen ufw. SSH nur mit Key.
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
ADMIN_DISCORD_IDS=123,456                 # bis Phase 7; ab Phase 8 Rollen in der Datenbank (§5.9)
UPLOAD_DIR=/data/uploads
PUBLIC_BASE_URL=https://deine-domain.de   # für Links in Bot-Nachrichten
LEGAL_DIR=                                # absoluter Pfad zu impressum.txt und datenschutz.txt; Production: setzt Compose (/config/legal)
DOMAIN=deine-domain.de                    # nur Production: Caddy
POSTGRES_PASSWORD=                        # nur Production: hex, z. B. openssl rand -hex 32
DEV_LOGIN=false
DEV_DM_REDIRECT_DISCORD_ID=
DEV_CHANNEL_ID=
DEV_TIME_OFFSETS=false
SMTP_HOST=                                # ab Phase 7: Konto-Mails (§5.8), z. B. www779.your-server.de
SMTP_PORT=587                             # STARTTLS
SMTP_USER=                                # z. B. noreply@uniscrims.com
SMTP_PASSWORD=
MAIL_FROM="Uni Scrims <noreply@uniscrims.com>"
DEV_MAIL_REDIRECT=                        # nur Entwicklung: alle Mails an diese Adresse; leer = nur ins Log
```

**Impressum und Datenschutzerklärung** liegen als `impressum.txt` und `datenschutz.txt` in `LEGAL_DIR`, außerhalb von Git (Production: `docker/legal/`, schreibgeschützt in den Web-Container gemountet; Gerüst in `docker/legal.example/`). Format: `## ` beginnt eine Überschrift, `- ` einen Listenpunkt, eine Leerzeile beendet einen Absatz; Zeilenumbrüche im Absatz bleiben (Adressen). Die Seiten lesen die Dateien bei jedem Aufruf; fehlt eine, steht dort "Inhalt folgt.". Damit das nicht unbemerkt online geht: Compose bindet `docker/legal` mit `create_host_path: false` ein (fehlt der Ordner, scheitert `up`, statt einen leeren Ordner anzulegen), der Web-Prozess loggt beim Start fehlende oder leere Texte und solche, die noch „TODO“ enthalten (das kopierte, nicht ausgefüllte Gerüst), und die Admin-Seiten zeigen dazu eine Warnung. Der Seitenkopf lädt den Nutzer mit Fehlerbehandlung (getestet in `apps/web/test/header-user.test.ts`), damit Impressum und Datenschutz auch bei nicht erreichbarer Datenbank erscheinen; der Datenbank-Client gibt einen Verbindungsversuch nach 10 s auf, damit eine hängende Datenbank die Seiten nicht unbegrenzt aufhält.

### Monitoring

`docker compose logs`, die Heartbeats der beiden Bot-Schleifen (§6.3) und die Liste fehlgeschlagener Nachrichten auf der Admin-Seite (die 100 zuletzt gescheiterten; wie viele ältere es gibt, steht darunter). Optional Uptime Kuma als zusätzlicher Container, der `/api/health` prüft.

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
- **Vorher erledigt (SPEC §9, Punkte 1–4):** Impressum, Datenschutzerklärung, AVV, Hoster-Snapshots aus
- *Fertig wenn:* Production läuft auf deiner Domain mit HTTPS, und zwei echte Discord-Accounts (z. B. du und ein Teammitglied) verifizieren sich, buchen einen Scrim und geben Feedback.
- *Stand (23.10.2026):* Phase 4 auf Entscheidung des Betreibers ohne diese Abnahme abgeschlossen. Code, Tests (`pnpm test`, `pnpm lint`), Review, Rechtstexte, AVV, Firewall sowie Backup-Skript und Anleitung sind erledigt; Production wurde einmal deployt und wieder gestoppt. Beim Go-Live wird der Server nach der Go-Live-Checkliste im README auf den aktuellen Stand gebracht (Code, Rechtstexte, nginx-Logs mit logrotate, Backup-Cron mit einem ersten geprüften Lauf), und die Abnahme folgt. Weil Posten, Bewerben und Bestätigen spielbereite Teams brauchen (je 5 verifizierte Spieler, SPEC P0-3), geht sie nicht mit nur zwei Accounts: Zwei Teams aus echten Accounts buchen einen Scrim und geben Feedback.

### Nach dem MVP

Punkte aus SPEC P1, freigegeben am 23.10.2026. Wie bisher genau eine Phase nach der anderen; jede wird zu Beginn hier und in SPEC („Nach dem MVP umgesetzt“) im Detail beschrieben.

**Phase 5: Ersatzspieler und Coach** (SPEC N-1)
- Schema: Enum `MemberRole`, `TeamMember.role` mit Default `PLAYER` (§4); Migration ohne Datenverlust (bestehende Mitglieder werden Spieler)
- `core`: Regel `countsForReadiness` in `readiness.ts`, die alle Zählungen der Spielbereitschaft nutzen (Posten, Bewerben, Bestätigen, Team-Seite, Anfrage-Detail); `setMemberRole` wie `removeMember` unter der Team-Sperre; `getMyTeam` liefert die Rolle und zählt nur Spieler und Ersatzspieler
- Seiten: Team-Seite mit Rolle pro Mitglied, für den Captain als Auswahl
- *Fertig wenn:* Der Captain setzt Rollen und die Team-Seite zeigt sie; ein Team mit 4 verifizierten Spielern und einem verifizierten Coach kann nicht posten, mit einem Ersatzspieler statt des Coaches schon; Tests und Lint sind grün.

**Phase 6: Statistik-Seite** (SPEC N-2)
- `core`: `getSuccessMetrics({ adminId, now })` in `stats.ts`, nur für Admins. Liest mit dem Prisma-Client (kein Roh-SQL, kein `now()` der Datenbank) die von Hand entschiedenen Prüfungen, die gebuchten, verfallenen und überfälligen offenen Anfragen mit Start bis `now` (offene zählen als verfallen, damit ein stehender Sweeper die Quote nicht schönt), alle Scrims mit Anfrage-Zeitpunkt, Feedback-Anzahl und Bewertungen sowie die aktiven Teams mit ihren Mitgliedern; Mediane, Quoten und Zeitfenster rechnet es in JS (die Datenmenge ist klein, §1). Spielbereit zählt es mit `countReadyMembers` (§4). Ziel und Stretch stehen als Konstanten in `stats.ts`, jede Kennzahl kommt mit Wert, Fallzahl und ob Ziel und Stretch erreicht sind (ohne Fälle `null`, außer bei der Anzahl spielbereiter Teams). Welche Kennzahlen Momentaufnahmen sind, legen die Schlüsseltypen fest, sodass `tsc` eine vergessene Berechnung meldet. Die Seite rundet Werte auf die angezeigte Genauigkeit ab (`apps/web/lib/metric-format.ts`).
- Zeitfenster: letzte 28 Tage `[now − 28 Tage, now]` und gesamt (bis `now`); „Teams mit ≥ 2 Scrims pro Monat“ zählt gespielte Scrims mit Start in `[now − 30 Tage, now]`.
- Seite `admin/stats` mit Link „Statistik“ in der Admin-Navigation; auf dem Handy eine Karte pro Kennzahl.
- *Fertig wenn:* Ein Admin sieht alle Kennzahlen aus SPEC §8 für beide Zeiträume mit Fallzahl, Ziel und Stretch; Tests mit festem `now` decken jede Kennzahl, die Grenzen der Zeitfenster und den Fall ohne Daten ab; Tests und Lint sind grün.

**Phase 7: Konto mit E-Mail, Passwort und Klarname** (SPEC N-3, §5.8)
- Voraussetzungen (erledigt am 23.10.2026): Postfach `noreply@uniscrims.com` bei Hetzner (Webhosting S), SMTP-Zugang in der `.env`, MX, SPF, DKIM und DMARC bei Cloudflare, eine Testmail ist angekommen; die Datenschutzerklärung ist in der Dev-Kopie ergänzt (E-Mail, Passwort-Hash, Klarname, Hetzner als Mail-Dienst, Zählung pro IP). Offen bis zum Deploy: AVV-Abdeckung des Webhostings prüfen, `SMTP_*` und `MAIL_FROM` in die Production-`.env`, Datenschutzerklärung nach Production kopieren.
- **Prüfpunkte zuerst** (mit 1.7.12 verifizieren, Ergebnis ins README):
  1. `/sign-up/email` ist von außen gesperrt, der Aufruf aus der Server Action geht durch.
  2. Wo beim Verknüpfen und bei der Anmeldung die frischen Discord-Tokens ankommen (z. B. Datenbank-Hook auf `account`), damit Hub-Beitritt und Token-Löschung für beide laufen.
  3. Ein Discord-Login lässt die E-Mail und ihre Bestätigung unverändert und aktualisiert Name und Avatar.
  4. Das Rate-Limit sieht hinter nginx die echte Client-IP.
- Schema: `firstName`, `lastName` am User (nullable); Seed mit vollständigen Konten
- `core`: Registrierungs-Schema, `accountSetupStep` und `ACCOUNT_INCOMPLETE` in `requireUser`, `completeAccount`, `updateRealName`, `resetLegacyVerifications` im Upload-Janitor, Klarname in der Prüf-Queue, `deletedUserData` und `deleteAccount` erweitert
- Web: Better-Auth-Konfiguration (§5.8), Seiten Registrieren, Anmelden, Mail bestätigt, Passwort vergessen und neu setzen, Konto vervollständigen, Discord verknüpfen; Konto-Seite mit Klarname, Passwort und E-Mail ändern; Mail-Versand; Prüf-Queue mit Name und neuem Checklisten-Punkt
- *Fertig wenn:* Lokal laufen Registrierung, Bestätigungsmail, Anmeldung, Passwort vergessen und ändern, E-Mail ändern und das Verknüpfen mit einem echten Discord-Konto samt Hub-Beitritt durch; ein Discord-Konto ohne Uni-Scrims-Konto legt keines an; ein Altkonto wird beim Discord-Login zum Vervollständigen geführt, behält sein Team und verliert seine Verifizierung (offene Prüfungen werden abgelehnt); die Prüf-Queue zeigt den Klarnamen; die Kontolöschung entfernt E-Mail, Passwort und Klarname; Tests und Lint sind grün.
- *Stand (23.10.2026):* abgeschlossen. Code, Tests (`pnpm test`, `pnpm lint`, dazu ein `next build`), Review samt Fixes; die Abläufe im Browser gegen eine Wegwerf-DB, und das Verknüpfen und Anmelden mit einem echten Discord-Konto samt Hub-Beitritt auf dem Dev-Server (dafür musste `http://localhost:3200/api/auth/callback/discord` als Redirect in der Discord-Application stehen). Seit dem 23.10.2026 auch in Production.

**Phase 8: Admins und Prüfer über die Oberfläche, mit 2FA** (SPEC N-4, §5.9)
- **Prüfpunkte zuerst** (mit 1.7.12 verifizieren, Ergebnis ins README):
  1. `signInEmail` aus der Server Action liefert bei eingerichteter 2FA `twoFactorRedirect` und setzt das Cookie der laufenden Anmeldung; `verifyTOTP` bzw. `verifyBackupCode` vom Server legen danach die Session an.
  2. `/two-factor/enable` mit Passwort und `/two-factor/verify-totp` mit Session setzen `twoFactorEnabled`.
  3. `databaseHooks.session.create.before` sieht beim OAuth-Callback den Pfad und kann die Session für Staff ablehnen; der Callback leitet mit einem Fehler weiter. Nach dem Review: Auch `/verify-email` legt ohne Session eine an (E-Mail-Wechsel), deshalb gilt eine Allowlist statt einer Sperrliste (§5.9).
- Schema: Enum `StaffRole`, `User.staffRole`, `User.twoFactorEnabled`, Tabelle `twoFactor` (§4)
- `core`: `requireStaff` und die drei Rollen-Prüfungen statt `ADMIN_DISCORD_IDS`, `staffArea`, Rollen-Funktionen (§3), `banUser`, `deletedUserData`, `deleteAccount` und `reapplyModeration` erweitert; Tests für jede Rolle gegen jede Admin-Funktion, Vergabe und Entzug nur durch den Betreiber, Sperre und Löschung, Rollenentzug parallel zu `decideVerification`
- Web: `twoFactor`-Plugin, Session-Hook, Allowlist; Seiten 2FA einrichten, Code bei der Anmeldung, Rollen-Seite; Admin-Navigation nach Rolle; Skript `set-operator`
- *Fertig wenn:* Der Betreiber (per Skript gesetzt) richtet 2FA ein und meldet sich mit Passwort und Code an; er macht ein bestehendes Konto per E-Mail zum Prüfer; das richtet 2FA ein, sieht nur die Prüf-Queue und kann entscheiden; nach dem Entzug ist der Zugang sofort weg; ein Konto mit Rolle kann sich nicht per Discord anmelden; Tests und Lint sind grün.
- *Stand (23.10.2026):* abgeschlossen. Code, Tests (`pnpm test`, `pnpm lint`, dazu ein `next build`), Review samt Fixes (Staff-Sessions nur über eine Allowlist, Sitzungsende bei jedem Einschalten der 2FA, Race beim Einschalten, 2FA-Reset nach einem Restore); der ganze Ablauf im Browser gegen eine Wegwerf-DB. Seit dem 23.10.2026 auch in Production, mit dem Betreiber per `set-operator` und der ergänzten Datenschutzerklärung.

**Phase 9: Datenauskunft per Knopfdruck** (SPEC N-5, §5.10)
- `core`: `exportAccountData` in `account-export.ts` mit allen Abschnitten aus §5.10; Tests: jeder Abschnitt mit einem vollständig befüllten Konto, keine Zugangsdaten (Passwort-Hash, 2FA-Schlüssel, Backup-Codes, Session- und Link-Tokens kommen im JSON nicht vor), keine Daten anderer Nutzer (Name, E-Mail, ID des Prüfers, des Gegners und der geprüften Person bei eigenen Entscheidungen), gesperrtes und unvollständiges Konto dürfen, gelöschtes nicht
- Web: Route `GET /api/account/export`, Abschnitt „Deine Daten“ auf der Konto-Seite
- Datenschutzerklärung: Abschnitt zu den Rechten um den Download ergänzen (Dev-Kopie und Production)
- *Fertig wenn:* Ein Nutzer lädt auf der Konto-Seite seine Daten herunter, und die Datei enthält alle Abschnitte aus §5.10 ohne Zugangsdaten und ohne Daten anderer Personen; ein gesperrter Nutzer kann sie laden, ein gelöschtes Konto nicht; Tests und Lint sind grün.
- *Stand (24.10.2026):* abgeschlossen. Code, Tests (`pnpm test`, `pnpm lint`, dazu ein `next build`), Review samt Fixes (offene Links, 2FA-Sperre und Zustellfehler in der Auskunft, Abdeckungstest für alle Spalten, Team wie `findOwnTeam`, Datei im Upload-Ordner geprüft, keine Platzhalter als Personendaten); Download im Browser gegen eine Wegwerf-DB. Seit dem 24.10.2026 auch in Production, mit dem ergänzten Abschnitt „Deine Rechte“ der Datenschutzerklärung.

**Phase 10: Team-Logo** (SPEC N-6, §5.11)
- Schema: `Team.logoUpdatedAt`, Tabelle `TeamLogo` (Migration, alles nullable bzw. neu)
- `core`: `processTeamLogo` mit `logoContentBox`, `setTeamLogo`, `removeTeamLogo`, `getTeamLogo`, `removeTeamLogoAsAdmin`; `dissolveTeam` löscht das Logo; `logoVersion` in den Lesefunktionen aus §5.11; `sharp` als Abhängigkeit von `core`. Tests: Zuschnitt (Inhalt berührt mindestens zwei Ränder, breit und hoch), Ablehnungen (JPEG, ohne Alphakanal, komplett durchsichtig, zu klein, zu groß, zu viele Pixel, animiert), Rechte (Mitglied ohne Captain-Rolle, gesperrtes Team, Admin, gesperrter Nutzer beim Abruf), Auflösen löscht, Race `setTeamLogo` gegen Auflösen
- Web: Route `GET /api/teams/[id]/logo`, `TeamAvatar` mit Logo an allen fünf Stellen, Abschnitt „Logo“ auf der Team-Seite, „Logo entfernen“ auf `/admin/bans`
- Datenauskunft: Team mit „Logo seit“; Abdeckungstest um `Team.logoUpdatedAt` und `TeamLogo` ergänzen
- Datenschutzerklärung: Team-Logo im Abschnitt zu Teams (Dev-Kopie; beim Deploy nach Production)
- *Fertig wenn:* Ein Captain lädt ein PNG mit durchsichtigem Rand hoch, und es erscheint zugeschnitten (mindestens zwei Ränder berührt) überall statt des Kürzels; JPEG und Bilder ohne Alphakanal werden mit Text abgelehnt; ein Admin kann ein Logo entfernen, und beim Auflösen verschwindet es; Tests, Lint und Build sind grün, und Web- und Bot-Image bauen mit `sharp`.
- *Stand (24.10.2026):* abgeschlossen. Code, Tests (`pnpm test`, `pnpm lint`, dazu ein `next build`), Web- und Bot-Image lokal gebaut (in beiden lädt `sharp`, im Web über den Pfad, den das kompilierte Bundle nutzt), Review samt Fixes (nur eine Verarbeitung gleichzeitig und Zählung pro IP, EXIF-Ausrichtung, animierte PNGs, Cache nur für die aktuelle Version, Admin entfernt nur das gesehene Logo); Hochladen, Ablehnen, Anzeige und Entfernen im Browser gegen eine Wegwerf-DB. Production läuft noch ohne Phase 10. Beim Deploy: der Migrate-Job legt `Team.logoUpdatedAt` und `TeamLogo` an; den Absatz zum Team-Logo der Datenschutzerklärung nach Production kopieren.
