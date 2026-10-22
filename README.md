# Uni Scrims

Scrim-Plattform für Valorant-Teams deutscher Hochschulen: Next.js-Web-App, discord.js-Bot und PostgreSQL in einem pnpm-Monorepo.

- `SPEC.md`: was gebaut wird
- `ARCHITECTURE.md`: wie es gebaut wird (Datenmodell, Abläufe, Stack, Phasen)

## Struktur

```
apps/web        Next.js (App Router, Tailwind, shadcn/ui)
apps/bot        discord.js-Bot
packages/core   Fachlogik und Konstanten (Map-Pool, Zeiten)
packages/db     Prisma-Schema, Migrationen, generierter Client, Seed
docker/         Compose-Dateien, Caddyfile, Backup-Skript, Gerüst der Rechtstexte
Dockerfile      Targets web, bot, migrate
```

## Voraussetzungen

- Node.js 24 LTS
- pnpm über Corepack: `corepack enable` (die Version kommt aus `packageManager` in `package.json`)
- Docker (für die lokalen Datenbanken und die Images)

## Lokales Setup

```sh
corepack enable
pnpm install
cp .env.example .env        # Werte eintragen, siehe "Discord-Einrichtung"
docker compose -f docker/docker-compose.dev.yml up -d db db-test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`UPLOAD_DIR` muss ein **absoluter** Pfad sein, lokal z. B. `/Users/<du>/uni-scrims-uploads` (in Docker `/data/uploads`). Dort liegen hochgeladene Bescheinigungen bis zur Prüfung. Für den Admin-Bereich deine Discord-ID in `ADMIN_DISCORD_IDS` eintragen. `LEGAL_DIR` ist ebenfalls absolut; lokal reicht das Gerüst, z. B. `/Users/<du>/uni-scrims/docker/legal.example`.

Die App-DB läuft auf `localhost:5433`, die Test-DB auf `localhost:5434` (tmpfs, ohne dauerhafte Daten). Ist Port 5433 belegt, kann die App-DB mit `DB_PORT=<port>` auf einen anderen Host-Port gelegt werden.

## Befehle

| Befehl | Wirkung |
|---|---|
| `pnpm dev` | Web (http://localhost:3000) und Bot lokal starten |
| `pnpm test` | Vitest; setzt vorher die Test-DB mit `prisma migrate reset --force` zurück |
| `pnpm lint` | ESLint, Prettier-Check, TypeScript-Check aller Pakete |
| `pnpm format` | Prettier schreibt |
| `pnpm db:generate` | Prisma-Client nach `packages/db/src/generated` erzeugen |
| `pnpm db:migrate` | `prisma migrate dev` gegen die App-DB |
| `pnpm bot:test-dm <discordId>` | Schickt einmalig eine Test-DM über den Bot. Prüft, ob der Hub-Server DMs erlaubt (Fehler 50007 = kein gemeinsamer Server oder DMs blockiert) |
| `pnpm db:seed` | Hochschulen und zwei Test-Teams mit je 5 verifizierten Nutzern anlegen (idempotent) |
| `pnpm --filter @uni-scrims/db seed:universities` | nur die Hochschul-Liste, ohne Test-Teams (so läuft es in Production) |

### Docker

```sh
docker build --target web -t uni-scrims-web .
docker build --target bot -t uni-scrims-bot .
docker build --target migrate -t uni-scrims-migrate .

# Migrationen per Einmal-Job gegen die Compose-DB
docker compose -f docker/docker-compose.dev.yml run --rm migrate
```

### Better-Auth-Tabellen neu erzeugen

Die Modelle `User`, `Session`, `Account` und `Verification` in `packages/db/prisma/schema.prisma` stammen aus der Better-Auth-CLI (Paket `auth`, nicht mehr `@better-auth/cli`):

```sh
pnpm dlx auth@1.7.12 generate --config <pfad/zu/auth.ts> --output <schema.prisma> -y
```

Das Ergebnis wird von Hand ins Schema übernommen. Die Zusatzfelder am `User` (`verifiedAt`, `bannedAt` usw.) stehen direkt im Schema.

## Better Auth: geprüfte Annahmen (Phase 1, Version 1.7.12)

Die Prüfpunkte aus ARCHITECTURE §5.1, geprüft am Quellcode von `better-auth@1.7.12`:

1. **Hook mit frischem Access-Token:** Ein `hooks.after` auf `/callback/:id` (`lib/auth.ts`). Beim ersten Login legt Better Auth die `account`-Zeile mit Tokens an. Bei jedem weiteren Login überschreibt es Access- und Refresh-Token (`updateAccountOnSignIn` ist standardmäßig an). Der Callback endet mit einem Redirect, den Better Auth als `APIError` abfängt; die After-Hooks laufen trotzdem, und `ctx.context.newSession` ist gesetzt. Der Hook macht den Hub-Beitritt und löscht danach die Tokens (`handleDiscordLogin` in core). Die Session hängt nicht an den Tokens. `encryptOAuthTokens` ist aus, die Tokens liegen also lesbar in der DB, bis sie gelöscht werden.
2. **E-Mail-Pflichtfeld:** Ohne `email`-Scope bricht der Callback mit `email_not_found` ab. `mapProfileToUser` setzt deshalb `<Discord-ID>@users.uniscrims.invalid`. Mit `disableDefaultScope: true` fordert die Autorisierungs-URL nur `identify guilds.join` an.
3. **Cookie-Cache:** standardmäßig aus (`session.cookieCache.enabled`), wird nicht gesetzt.
4. **Session-Felder:** Die `session`-Tabelle speichert `ipAddress` und `userAgent` (aus den Request-Headern). Das muss in die Datenschutzerklärung.

`callbackURL` für Einladungslinks: Die Login-Seite nimmt `?callbackURL=/join/<code>` an (nur Pfade derselben Seite) und gibt den Wert an `signIn.social` weiter. Better Auth leitet nach dem Callback dorthin zurück.

## Dev-Login

Mit `NODE_ENV=development` und `DEV_LOGIN=true` gibt es unter `/dev-login` eine Liste der Seed-Nutzer. Ein Klick loggt dich ohne Discord als dieser Nutzer ein. So kannst du zwei Teams parallel testen (normales und privates Fenster). In Production ist die Seite aus, und der Endpoint `/api/auth/dev/sign-in` antwortet mit 404.

## Discord-Bot

Der Bot (`apps/bot`) verschickt die Benachrichtigungen aus der Outbox (alle 5 s), führt die Zeit-Jobs aus (Sweeper, jede Minute: Anfragen verfallen lassen, Feedback öffnen, Scrims auswerten, alte Benachrichtigungen löschen, Heartbeat) und bietet `/setup`. Er muss als **genau eine Instanz** laufen. Nach einem Neustart holt er alles nach, was in der Zwischenzeit fällig wurde; Reminder, deren Scrim schon begonnen hat, verwirft er.

**Team-Channel verknüpfen:** Der Captain lädt den Bot mit dem Einladungslink für Team-Server (Discord-Einrichtung, Schritt 4) auf seinen Server und ruft dort `/setup channel:#kanal` auf. Der Bot braucht in dem Channel die Rechte „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“ und postet zur Bestätigung eine Test-Nachricht. Kann er später nicht mehr in den Channel schreiben, entfernt er die Verknüpfung und schreibt dem Captain eine DM. Der Bot registriert `/setup` bei jedem Start global.

### Lokal mit echten Discord-Nachrichten testen

Seed-Nutzer haben erfundene Discord-IDs. Mit diesen Variablen in der `.env` landet trotzdem alles bei dir (nur mit `NODE_ENV=development`, das `pnpm dev` setzt):

| Variable | Wirkung |
|---|---|
| `DEV_DM_REDIRECT_DISCORD_ID` | deine Discord-ID: alle DMs gehen an dich, mit Präfix „[an: <Name>]“ |
| `DEV_CHANNEL_ID` | alle Team-Channel-Posts gehen in diesen Channel, auch von Teams ohne `/setup`, mit Präfix „[an: <Teamname>]“ |
| `DEV_TIME_OFFSETS=true` | Reminder 3 und 1 min vor Start, Feedback-Hinweis 2 min nach Start, Feedback-Frist 5 min danach; Startzeiten ab 5 min in der Zukunft |
| `PUBLIC_BASE_URL` | `http://localhost:3000`, damit die Link-Buttons lokal funktionieren |

Ablauf eines kompletten Scrims (mit `DEV_LOGIN=true`):

1. `pnpm dev`. Im normalen Fenster als Captain von Team A einloggen, im privaten Fenster als Captain von Team B (`/dev-login`).
2. A erstellt eine Anfrage zum nächsten 15-Minuten-Slot, der mindestens 5 Minuten entfernt ist. B bewirbt sich → DM „Neue Bewerbung“.
3. A bestätigt → je eine DM „Scrim gebucht“ und ein Channel-Post für beide Teams.
4. 3 und 1 Minute vor Start: Reminder. 2 Minuten nach Start: Feedback-Hinweis. Über den Button „Feedback geben“ antworten beide Captains → der Scrim ist sofort ausgewertet. Antwortet nur einer, wertet der Sweeper nach der Frist (Start + 7 min) aus.
5. Neustart-Test: den Bot zwischendurch beenden und später wieder starten. Fällige Nachrichten und Zeit-Jobs werden nachgeholt.

Den Stand zeigt die Tabelle `Notification` (`status`, `attempts`, `lastError`); `SystemStatus` enthält den Heartbeat des Bots.

## Discord-Einrichtung

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application anlegen. Unter **OAuth2** den Redirect `<BETTER_AUTH_URL>/api/auth/callback/discord` eintragen, einmal für lokal (`http://localhost:3000/api/auth/callback/discord`) und einmal für Production. Client-ID und Client-Secret nach `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET`.
2. Unter **Bot** den Bot-User anlegen und das Token nach `DISCORD_BOT_TOKEN`. Es sind **keine privilegierten Intents** nötig.
3. Den **Hub-Server** "Uni Scrims" anlegen und den Bot mit den Rechten `CREATE_INSTANT_INVITE`, `ViewChannel`, `SendMessages` und `EmbedLinks` einladen. Im Hub **kein Regel-Screening** (Membership Screening) aktivieren und eine **niedrige Verifizierungsstufe** wählen, damit per `guilds.join` hinzugefügte Nutzer sofort DMs bekommen können (wird in Phase 1 getestet). Server-ID nach `HUB_GUILD_ID`, einen dauerhaften Einladungslink nach `HUB_INVITE_URL`.
4. Einladungslink für Team-Server erzeugen (OAuth2 → URL Generator): Scopes `bot` und `applications.commands`, Rechte `ViewChannel`, `SendMessages`, `EmbedLinks`.
5. Einen privaten Dev-Channel anlegen und dessen ID nach `DEV_CHANNEL_ID`.

Discord-IDs kopieren: In Discord unter Einstellungen → Erweitert den Entwicklermodus aktivieren, dann Rechtsklick → "ID kopieren".

## Production (VPS)

**Vorher erledigt** (SPEC §9, offene Punkte 1–4): Impressum geklärt, Datenschutzerklärung geschrieben, AVV mit dem Hoster abgeschlossen, Hoster-Snapshots und -Backups ausgeschaltet (sonst landen Uploads doch in Backups), Ablauf für die Datenauskunft festgelegt.

### Server vorbereiten

Ein kleiner VPS (2 vCPU, 4 GB RAM) mit Debian oder Ubuntu reicht.

```sh
# Firewall: nur SSH, HTTP und HTTPS
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443 && ufw enable
# SSH nur mit Key: in /etc/ssh/sshd_config "PasswordAuthentication no", dann
systemctl reload ssh
# Sicherheitsupdates automatisch
apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
```

Docker nach der [offiziellen Anleitung](https://docs.docker.com/engine/install/) installieren. Docker umgeht mit veröffentlichten Ports die ufw-Regeln; veröffentlicht werden nur 80 und 443 (Caddy), die Datenbank nicht.

Beim Domain-Anbieter einen A-Eintrag (und ggf. AAAA) auf die Server-IP setzen. In der Discord-Application den Redirect `https://<domain>/api/auth/callback/discord` eintragen (Discord-Einrichtung, Schritt 1).

### Einrichten und starten

```sh
git clone <repo> /opt/uni-scrims && cd /opt/uni-scrims
cp .env.example .env && chmod 600 .env
```

In der `.env`:

- `DOMAIN=<domain>`, `BETTER_AUTH_URL=https://<domain>`, `PUBLIC_BASE_URL=https://<domain>`
- `BETTER_AUTH_SECRET` mit `openssl rand -base64 32`, `POSTGRES_PASSWORD` mit `openssl rand -hex 32` (hex, weil es in `DATABASE_URL` steht)
- Discord-Werte, `HUB_GUILD_ID`, `HUB_INVITE_URL`, `ADMIN_DISCORD_IDS`
- `DATABASE_URL`, `UPLOAD_DIR` und `LEGAL_DIR` setzt die Compose-Datei selbst. Die `DEV_*`-Schalter sind in Production ohnehin aus.

Rechtstexte anlegen (Format siehe ARCHITECTURE §8):

```sh
mkdir docker/legal && cp docker/legal.example/*.txt docker/legal/
# docker/legal/impressum.txt und docker/legal/datenschutz.txt mit den echten Texten füllen
```

Starten, aus dem Repo-Root:

```sh
alias dc='docker compose --env-file .env -f docker/docker-compose.yml'
dc up -d --build
# einmalig: die Hochschul-Liste (ohne Test-Teams)
dc run --rm migrate ./node_modules/.bin/tsx prisma/seed.ts --universities-only
dc ps    # web "healthy", bot läuft, migrate mit Exit-Code 0 beendet
```

Prüfen: `https://<domain>/api/health` antwortet, der Login klappt, und der Admin-Bereich zeigt „Bot läuft“.

- **Updates:** `git pull && dc up -d --build`. Der Migrate-Job läuft dabei jedes Mal mit; `web` und `bot` starten erst danach.
- **Logs:** `dc logs -f web bot`. Docker rotiert sie (3 × 10 MB pro Container).
- **Datenbank-Konsole:** `dc exec db psql -U uniscrims uniscrims`

### Backups

`docker/backup.sh` sichert die Datenbank: `pg_dump`, verschlüsselt mit deinem öffentlichen GPG-Schlüssel, 14 Tage lokal in `/var/backups/uni-scrims` und per `rsync --delete` gespiegelt auf einen externen Speicher (z. B. Hetzner Storage Box). Uploads werden bewusst nicht gesichert.

1. Auf deinem eigenen Rechner ein Schlüsselpaar erzeugen (`gpg --quick-generate-key "Uni Scrims Backup"`) und den öffentlichen Schlüssel exportieren (`gpg --export --armor <key-id> > backup.asc`). Der private Schlüssel bleibt dort; ohne ihn sind die Backups wertlos.
2. Auf dem Server: `apt install gpg rsync`, `gpg --import backup.asc`, einen SSH-Key für root beim externen Speicher hinterlegen und dort den Zielordner anlegen.
3. Cron für root (`crontab -e`), jede Nacht um 3:30 Uhr:

```
30 3 * * * BACKUP_GPG_RECIPIENT=<key-id> BACKUP_REMOTE=<user>@<host>:uni-scrims BACKUP_SSH_PORT=23 /opt/uni-scrims/docker/backup.sh >> /var/log/uni-scrims-backup.log 2>&1
```

(`BACKUP_SSH_PORT=23` gilt für die Storage Box, sonst weglassen.)

Wiederherstellen:

```sh
gpg --decrypt uniscrims-<zeit>.dump.gpg > restore.dump    # auf dem Rechner mit dem privaten Schlüssel
dc stop web bot
dc exec -T db pg_restore -U uniscrims -d uniscrims --clean --if-exists < restore.dump
dc start web bot
```

Gelöschte Konten stehen bis zum Ablauf (14 Tage) noch in den Backups; das steht in der Datenschutzerklärung.

## Entsperren per SQL

Sperren gibt es im Admin-Bereich, Entsperren im MVP nur per Datenbank (`dc exec db psql -U uniscrims uniscrims`):

```sql
-- Nutzer über die Discord-ID finden und entsperren
SELECT u.id, u.name, u."bannedAt" FROM "user" u
  JOIN account a ON a."userId" = u.id
  WHERE a."providerId" = 'discord' AND a."accountId" = '<discord-id>';
UPDATE "user" SET "bannedAt" = NULL WHERE id = '<user-id>';

-- Team finden und entsperren
SELECT id, name, "bannedAt" FROM "Team" WHERE name ILIKE '%<name>%' AND "dissolvedAt" IS NULL;
UPDATE "Team" SET "bannedAt" = NULL WHERE id = '<team-id>';
```

Was das Entsperren **nicht** zurückholt:

- Abgesagte Scrims, gelöschte Anfragen und zurückgezogene Bewerbungen bleiben so.
- Ein gesperrter Spieler wurde aus seinem Team entfernt und muss per Einladungslink neu beitreten.
- Bei einem gesperrten Captain sind Nutzer und Team getrennt zu entsperren.
- Hat ein gesperrter Nutzer sein Konto gelöscht, landet ein neuer Login nach dem Entsperren beim anonymisierten Konto, ohne Verifizierung und ohne Team.
