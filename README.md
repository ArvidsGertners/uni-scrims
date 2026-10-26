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

`UPLOAD_DIR` muss ein **absoluter** Pfad sein, lokal z. B. `/Users/<du>/uni-scrims-uploads` (in Docker `/data/uploads`). Dort liegen hochgeladene Bescheinigungen bis zur Prüfung. Für den Admin-Bereich registrierst du dich, verknüpfst Discord und machst dein Konto per Skript zum Betreiber (siehe „Admins und Prüfer“). `LEGAL_DIR` ist ebenfalls absolut; lokal reicht das Gerüst, z. B. `/Users/<du>/uni-scrims/docker/legal.example`.

Die App-DB läuft auf `localhost:5433`, die Test-DB auf `localhost:5434` (tmpfs, ohne dauerhafte Daten). Ist Port 5433 belegt, kann die App-DB mit `DB_PORT=<port>` auf einen anderen Host-Port gelegt werden.

Entwickeln auf einem Server: `next dev` lauscht sonst auf allen Schnittstellen, mit dem Dev-Login also öffentlich. Dort in der Shell `DEV_HOST=127.0.0.1` setzen (und bei belegtem Port 3000 `PORT=<port>`), die Seite per SSH-Portweiterleitung öffnen und `BETTER_AUTH_URL` sowie `PUBLIC_BASE_URL` auf `http://localhost:<port>` setzen.

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

## Better Auth: geprüfte Annahmen (Phase 7, Version 1.7.12)

Die Prüfpunkte aus ARCHITECTURE §11 Phase 7, am Quellcode geprüft und mit `apps/web/test/auth-flows.test.ts` gegen den echten Handler nachgewiesen (Discord dort durch ein nachgebildetes `fetch` ersetzt):

1. **Konto-Endpunkte nur vom Server:** Aufrufe über `auth.api` kommen ohne HTTP-Request (`ctx.request` fehlt). Der Before-Hook lässt `/sign-up/email`, `/sign-in/email`, `/send-verification-email`, `/request-password-reset`, `/reset-password`, `/change-password` und `/change-email` nur so durch; über HTTP antworten sie 404 (`lib/auth-paths.ts`). Better Auths eigenes Rate-Limit läuft nur im HTTP-Router, also nicht bei diesen Aufrufen; die Server Actions zählen deshalb selbst (`lib/rate-limit.ts`).
2. **Frische Discord-Tokens:** Beim Verknüpfen gibt es keine neue Session, der After-Hook auf `/callback/:id` sieht also nichts. Die Tokens kommen mit der `account`-Zeile an: `create` beim Verknüpfen, `update` bei jedem Discord-Login (`updateAccountOnSignIn`). Ein `databaseHooks.account`-Hook ruft dort `handleDiscordLogin` auf: Profil holen, Hub-Beitritt, Tokens löschen.
3. **E-Mail bleibt beim Discord-Login:** `overrideUserInfoOnSignIn` schreibt in 1.7.12 auch `email` und `emailVerified` aus dem Profil, das `mapProfileToUser` liefert. Das liefert deshalb für ein verknüpftes Konto dessen eigene Adresse (`discordLoginUserInfo` in core) und für einen Sperr-Platzhalter dessen eigene Werte; Name und Avatar kommen aus demselben Profil, ohne zweiten Abruf. `disableImplicitSignUp` lässt einen Discord-Login ohne verknüpftes Konto mit `error=signup_disabled` scheitern; `disableSignUp` zusätzlich, weil der Client `disableImplicitSignUp` mit `requestSignUp: true` aushebeln kann. Ein `databaseHooks.account.create.before` verhindert eine zweite Discord-Verknüpfung pro Nutzer und neue Zeilen für gelöschte oder gesperrte Nutzer (z. B. eine Verknüpfung, deren OAuth-Status noch von vor der Löschung stammt). Verknüpfen braucht `trustedProviders: ["discord"]` (ohne `email`-Scope ist nichts bestätigt) und `allowDifferentEmails` (der Platzhalter weicht immer ab); eine Discord-ID an einem anderen Konto lehnt Better Auth ab.
4. **Client-IP:** `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]`. nginx (`proxy_set_header X-Forwarded-For $remote_addr`) und Caddy setzen den Header selbst, ohne den des Clients anzuhängen, und der Web-Container ist von außen nicht erreichbar. Dasselbe liest `lib/rate-limit.ts`. Ohne Proxy (lokal) fehlt der Header, dann teilen sich alle Anfragen einen Zähler.

Weitere Beobachtungen: Mit `requireEmailVerification` antwortet die Registrierung auf eine schon registrierte Adresse wie auf eine neue und legt nichts an. Der Bestätigungslink meldet mit `autoSignInAfterVerification` an. `/change-email` schickt bei bestätigter Adresse einen Link an die neue Adresse, die erst nach dem Klick gilt.

## Konto-Mails (ab Phase 7)

Versand per SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, siehe `.env.example`), in Production über das Postfach `noreply@uniscrims.com` bei Hetzner (Webhosting, `www779.your-server.de:587`). DNS bei Cloudflare: MX auf `www779.your-server.de`, SPF `v=spf1 a mx ~all`, DKIM unter `default2610._domainkey`, DMARC `v=DMARC1; p=none`. Lokal (alles außer `NODE_ENV=production`) gehen Mails nur ins Log von `web` (nur der Text), mit `DEV_MAIL_REDIRECT=<deine Adresse>` stattdessen alle an diese Adresse. Die Konto-Mails haben seit dem 25.10.2026 zusätzlich eine HTML-Fassung (`apps/web/lib/mail-html.ts`, Vorlage aus `docs/design_handoff_emails`); ihr Logo lädt das Mailprogramm von `BETTER_AUTH_URL`, lokal also nicht.

## Admins und Prüfer (ab Phase 8)

Rollen stehen in der Datenbank (`user.staffRole`, ARCHITECTURE §5.9). Den **Betreiber** setzt ein Skript; das Konto muss vollständig sein (Name, bestätigte Adresse, Discord, Passwort):

```sh
# Production
dc run --rm --no-deps bot node --import tsx src/scripts/set-operator.ts du@example.org
# lokal
pnpm --filter @uni-scrims/bot set-operator du@example.org
```

Danach sind alle Sitzungen des Kontos beendet. Beim nächsten Aufruf von `/admin` richtest du die Zwei-Faktor-Anmeldung ein (Passwort, QR-Code, erster Code, Backup-Codes sicher aufbewahren); dann meldest du dich einmal neu an, ab jetzt mit Passwort und Code. Mit Discord meldet sich ein Konto mit Rolle nicht mehr an. Admins und Prüfer vergibst du unter `/admin/staff` an bestehende Konten.

Betreiber-Gerät verloren und keine Backup-Codes mehr: 2FA per SQL zurücksetzen (`dc exec db psql -U uniscrims uniscrims`), danach richtest du sie neu ein:

```sql
BEGIN;
DELETE FROM "twoFactor" WHERE "userId" = (SELECT id FROM "user" WHERE email = 'du@example.org');
UPDATE "user" SET "twoFactorEnabled" = false WHERE email = 'du@example.org';
DELETE FROM session WHERE "userId" = (SELECT id FROM "user" WHERE email = 'du@example.org');
COMMIT;
```

Für Admins und Prüfer macht das der Betreiber auf der Rollen-Seite („2FA zurücksetzen“).

## Better Auth: geprüfte Annahmen (Phase 8, Version 1.7.12)

Die Prüfpunkte aus ARCHITECTURE §11 Phase 8, nachgewiesen in `apps/web/test/auth-flows.test.ts`:

1. **Anmeldung mit Code:** `signInEmail` aus der Server Action liefert bei eingerichteter 2FA `{ twoFactorRedirect: true }`, löscht die eben angelegte Session wieder und setzt ein signiertes Cookie für die laufende Anmeldung (10 min). `verifyTOTP` bzw. `verifyBackupCode` vom Server legen dann die Session an; ein Backup-Code gilt einmal. Nach fünf falschen Codes einer Anmeldung und nach mehreren Fehlversuchen insgesamt sperrt das Plugin selbst.
2. **Einrichten:** `enableTwoFactor` braucht das Passwort und legt Schlüssel und Backup-Codes verschlüsselt an (`verified = false`); erst `verifyTOTP` mit Session setzt `twoFactorEnabled` und tauscht die Session aus. Dieses Einschalten löst `databaseHooks.user.update.after` mit `ctx.path = "/two-factor/verify-totp"` aus; `finishTwoFactorSetup` beendet dort alle Sitzungen. Bei der Anmeldung mit Code ändert das Plugin den User nicht.
3. **Staff-Sessions nur aus Passwort und Code:** Das Plugin fragt den Code nur bei `/sign-in/email`. `databaseHooks.session.create.before` sieht den Endpunkt in `ctx.path` (beim Discord-Login `/callback/:id`, beim Link zur neuen Adresse `/verify-email`) und lässt Staff nur unter der Allowlist in `auth-paths.ts` durch. Sonst wirft er eine Weiterleitung: Der Discord-Callback reicht sie durch (`/login?error=staff_discord`), `/verify-email` ebenso (`/login?error=staff_link`), und es entsteht keine Session; die Adresse bleibt unverändert. Discord verknüpfen legt keine Session an und geht weiter.

## Discord-Profilbilder (ab Phase 12)

Der Server speichert eine Kopie des Discord-Profilbilds beim Verknüpfen und bei jeder Anmeldung über Discord (ARCHITECTURE §5.12); der Browser lädt nie etwas von Discord. Für Konten, die schon vor Phase 12 verknüpft waren, holt ein Skript die Bilder einmal nach (nacheinander, Ausgabe: geladen, übersprungen, gescheitert):

```sh
# Production, einmal nach dem Deploy von Phase 12
dc run --rm --no-deps -T bot node --import tsx src/scripts/backfill-avatars.ts </dev/null
# lokal
pnpm --filter @uni-scrims/bot backfill-avatars
```

## Admin-Bereich auf eigener Adresse (ab Phase 13)

Mit `ADMIN_URL` (z. B. `https://admin.uniscrims.com`, eine Subdomain von `BETTER_AUTH_URL`) liegt der Admin-Bereich unter dieser Adresse; `/admin` auf der Hauptadresse leitet dorthin (ARCHITECTURE §5.13). Die Anmeldung gilt für beide Adressen. Ohne `ADMIN_URL`, etwa lokal, bleibt er unter `/admin`.

Einmalig beim Deploy von Phase 13, als root und vor dem Eintrag in der `.env`:

1. DNS (Cloudflare): A-Record `admin` auf die Server-IP, wie die Hauptadresse „DNS only“.
2. Zertifikat für beide Namen: `certbot --nginx --expand -d <domain> -d admin.<domain>`; im vHost steht `admin.<domain>` mit in beiden `server_name` (siehe „Variante: Server mit vorhandenem nginx“), dann `nginx -t && systemctl reload nginx`. Mit Caddy reicht der DNS-Eintrag, das Caddyfile bedient fest `<domain>` und `admin.<domain>` (`ADMIN_URL` ist dann `https://admin.<domain>`; ohne DNS-Eintrag scheitert das Zertifikat für `admin.` im Log).
3. `ADMIN_URL=https://admin.<domain>` in die `.env`, dann `dc up -d --build`.

Mit `ADMIN_URL` heißen die Cookies anders (`uni-scrims.*` statt `better-auth.*`) und gelten für beide Adressen: Nach dem Deploy mit `ADMIN_URL` (und nach jedem späteren Ein- oder Ausschalten) sind alle einmal abgemeldet. Das Session-Cookie geht an jede Subdomain der Hauptadresse; lass deshalb keine Subdomain auf einen fremden Dienst zeigen.

Mit `ADMIN_URL` darf der Web-Server nicht an `127.0.0.1` gebunden sein (siehe Prüfpunkt 1); das Image bindet `0.0.0.0`. Lokal (`DEV_HOST=127.0.0.1`) deshalb ohne `ADMIN_URL` arbeiten; der Admin-Bereich liegt dann unter `/admin`.

### Geprüfte Annahmen (Phase 13, Next 16.4.2, Better Auth 1.7.12)

Geprüft mit dem Web-Image (gebaut ohne `ADMIN_URL`, gestartet mit) gegen eine Wegwerf-Datenbank, zwei Testnamen per `--host-resolver-rules` in Chromium, und in `apps/web/test/admin-cookies.test.ts` und `proxy.test.ts`:

1. **Laufzeit:** Der Proxy liest `process.env.ADMIN_URL` erst zur Laufzeit; das ohne `ADMIN_URL` gebaute Image schreibt mit `ADMIN_URL` beim Start um. Next schreibt nur dann intern um, wenn das Ziel denselben Origin hat wie die gebundene Adresse; im Proxy normalisiert Next `127.0.0.1` aber zu `localhost`. Ein Server auf `127.0.0.1` hält das Ziel deshalb für extern, und die Anfrage kreist über die Weiterleitung von `/admin`. Im Container (`0.0.0.0`) tritt das nicht auf.
2. **Server Actions:** Rolle geben und entziehen auf `/staff` des Admin-Hosts laufen über die umgeschriebene Route, und die Seite zeigt danach ohne Neuladen den neuen Stand (`revalidatePath` mit dem internen Pfad).
3. **Cookies:** Session-Cookie und das Cookie der laufenden 2FA-Anmeldung tragen `Domain=<Hauptdomain>`; `trustedOrigins` enthält `ADMIN_URL`. Better Auth lässt seine Origin-Prüfung in Tests aus; im Browser meldet „Abmelden“ auf dem Admin-Host überall ab.
4. **Rückweg:** Ohne Session führt der Admin-Host zu `/login` der Hauptadresse; nach Passwort und Code (und schon nach dem Passwort, solange die 2FA fehlt, zur Einrichtung) geht es auf die absolute Admin-Adresse zurück. Nach der Einrichtung zeigt die Anmeldung der Hauptadresse die Erfolgsmeldung. Weil das Admin-Layout zuerst prüft, führt der Rückweg zur Startseite des Admin-Bereichs (bis Phase 13 die Prüf-Queue, ab Phase 14 die Übersicht), nicht zur ursprünglich aufgerufenen Admin-Seite.

## Dev-Login

Mit `NODE_ENV=development` und `DEV_LOGIN=true` gibt es unter `/dev-login` eine Liste der Seed-Nutzer. Ein Klick loggt dich ohne Discord als dieser Nutzer ein. So kannst du zwei Teams parallel testen (normales und privates Fenster). In Production ist die Seite aus, und der Endpoint `/api/auth/dev/sign-in` antwortet mit 404.

## Discord-Bot

Der Bot (`apps/bot`) verschickt die Benachrichtigungen aus der Outbox (alle 5 s), führt die Zeit-Jobs aus (Sweeper, jede Minute: Anfragen verfallen lassen, Feedback öffnen, Scrims auswerten, abgebrochene Kontolöschungen abschließen, abgelaufene Sessions und liegengebliebene Discord-Tokens löschen, stündlich alte Benachrichtigungen löschen) und bietet `/setup`. Beide Schleifen schreiben einen Heartbeat. Der Sweeper läuft ab dem Start des Prozesses, auch wenn der Discord-Login scheitert (der wird jede Minute wiederholt). Er muss als **genau eine Instanz** laufen. Nach einem Neustart holt er alles nach, was in der Zwischenzeit fällig wurde; Reminder, deren Scrim schon begonnen hat, verwirft er.

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

Den Stand zeigt die Tabelle `Notification` (`status`, `attempts`, `lastError`); `SystemStatus` enthält die Heartbeats der beiden Bot-Schleifen (`bot` für den Sweeper, `outbox` für den Versand).

## Discord-Einrichtung

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application anlegen. Unter **OAuth2** den Redirect `<BETTER_AUTH_URL>/api/auth/callback/discord` eintragen, einmal für lokal (`http://localhost:3000/api/auth/callback/discord`) und einmal für Production. Client-ID und Client-Secret nach `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET`.
2. Unter **Bot** den Bot-User anlegen und das Token nach `DISCORD_BOT_TOKEN`. Es sind **keine privilegierten Intents** nötig.
3. Den **Hub-Server** "Uni Scrims" anlegen und den Bot mit den Rechten `CREATE_INSTANT_INVITE`, `ViewChannel`, `SendMessages` und `EmbedLinks` einladen. Im Hub **kein Regel-Screening** (Membership Screening) aktivieren und eine **niedrige Verifizierungsstufe** wählen, damit per `guilds.join` hinzugefügte Nutzer sofort DMs bekommen können (wird in Phase 1 getestet). Server-ID nach `HUB_GUILD_ID`, einen dauerhaften Einladungslink nach `HUB_INVITE_URL`.
4. Einladungslink für Team-Server erzeugen (OAuth2 → URL Generator): Scopes `bot` und `applications.commands`, Rechte `ViewChannel`, `SendMessages`, `EmbedLinks`.
5. Einen privaten Dev-Channel anlegen und dessen ID nach `DEV_CHANNEL_ID`.

Discord-IDs kopieren: In Discord unter Einstellungen → Erweitert den Entwicklermodus aktivieren, dann Rechtsklick → "ID kopieren".

## Discord-Hub einrichten (Struktur)

Jeder, der Discord verknüpft, landet automatisch im Hub (§5.1). Damit er dort nicht nur `#general` sieht, bekommt der Hub diese Struktur. Der Bot der Plattform braucht dafür keine weiteren Rechte. Am 26.10.2026 wurde sie einmalig per Skript angelegt, mit einem eigenen Bot „Server Setup“ mit Administrator-Rechten (die Texte postete der Uni-Scrims-Bot, die Einladung auf `#willkommen` erzeugte ebenfalls er, damit sie bleibt, wenn der Setup-Bot den Server verlässt). Von Hand geht es genauso; die Reihenfolge ist wichtig, vor allem Schritt 5 vor Schritt 6.

| Kategorie | Kanäle | Wer darf schreiben |
|---|---|---|
| INFO | `#willkommen`, `#regeln`, `#ankündigungen` | nur „Team“ und der Bot (für die Texte) |
| HILFE | `#support`, `#feedback` (Feedback zur Plattform) | alle, Slowmode 30 s |
| COMMUNITY | `#allgemein` | alle, Slowmode 10 s |
| INTERN (privat) | der Dev-Channel | nur „Team“ und der Bot |

1. **Rolle „Team“** anlegen (Servereinstellungen → Rollen) und dir und den Admins geben, mit „Nachrichten verwalten“ und „Mitglieder timeouten“. Die Rolle des Bots („Uni Scrims“) bleibt, wie sie ist.
2. **Kategorie INFO** mit den drei Kanälen. In den Berechtigungen der Kategorie für `@everyone`: „Nachrichten senden“, „Nachrichten in Threads senden“ und „Threads erstellen“ (öffentlich und privat) aus, „Reaktionen hinzufügen“ an; für „Team“: „Nachrichten senden“ an; für die Rolle des Bots „Nachrichten senden“ und „Links einbetten“ an. Die Kanäle mit der Kategorie synchronisieren.
3. **Kategorie HILFE** mit `#support` (Slowmode 30 s) und `#feedback` (Slowmode 30 s), **Kategorie COMMUNITY** mit `#allgemein` (Slowmode 10 s). Keine besonderen Rechte.
4. **Kategorie INTERN**: für `@everyone` „Kanal ansehen“ aus; für „Team“ an; für die Rolle des Bots „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“ an. Dann den Dev-Channel hineinziehen und mit der Kategorie synchronisieren. Seine ID bleibt, `DEV_CHANNEL_ID` ändert sich nicht.
5. **Neuen Einladungslink** auf `#willkommen` erzeugen (Rechtsklick → Leute einladen → Link bearbeiten: läuft nie ab, keine Begrenzung) und `HUB_INVITE_URL` in der `.env` von Production und Entwicklung ersetzen, danach `web` neu starten (`dc up -d web`). Der Link steht im Discord-Knopf auf `/support` und im Hinweis, wenn der Beitritt zum Hub gescheitert ist. **Erst danach** Schritt 6: Einladungen hängen an ihrem Kanal, und löscht man den Kanal des alten Links, führt der Knopf ins Leere.
6. `#general` und den Standard-Sprachkanal löschen.
7. **Servereinstellungen:**
   - Übersicht: Standard-Benachrichtigungen „Nur @Erwähnungen“ (sonst meldet Discord jedem automatisch beigetretenen Mitglied jede Nachricht), Systemnachrichten bei Beitritt aus, Server-Icon `apps/web/public/brand/uniscrims-avatar-512.png`.
   - Sicherheit: Verifizierungsstufe **niedrig** lassen und **kein Regel-Screening** einschalten, sonst bekommen per `guilds.join` beigetretene Nutzer keine DMs (Punkt 3 unter „Discord-Einrichtung“). Die Community-Funktion von Discord ist nicht nötig.
8. Die Texte unten in `#willkommen` und `#regeln` posten.

Moderation: Ein Kick hält nur bis zur nächsten Anmeldung über Discord, denn dabei tritt das Konto dem Hub wieder bei (§5.1). Dauerhaft wirkt nur ein Bann im Hub; dann bekommt die Person keine DMs mehr, und die Website zeigt ihr den Hinweis zum gescheiterten Beitritt. Für Sperren auf der Plattform gibt es den Admin-Bereich.

**`#willkommen`**

```
**Willkommen bei Uni Scrims!**
Uni Scrims ist die Scrim-Plattform für Valorant-Teams deutscher Hochschulen: Anfragen aufs Board posten, bei anderen Teams bewerben, die Lobby direkt auf Discord klären. → https://uniscrims.com

**Warum bist du hier?** Beim Verknüpfen deines Discord-Kontos bist du diesem Server beigetreten, damit dir der Bot Bewerbungen, Zusagen und Erinnerungen per DM schicken kann.
• Erlaube in den Privatsphäre-Einstellungen dieses Servers „Direktnachrichten von Servermitgliedern“.
• Verlässt du den Server, kommen keine DMs mehr an. Zurück kommst du über https://uniscrims.com/support.

Fragen? → #support

**Welcome to Uni Scrims!**
Uni Scrims is the scrim platform for Valorant teams of German universities: post requests on the board, apply to other teams, sort out the lobby directly on Discord. → https://uniscrims.com

**Why are you here?** When you linked your Discord account, you joined this server, so the bot can send you applications, confirmations and reminders by DM.
• In this server's privacy settings, allow "Direct messages from server members".
• If you leave the server, DMs stop arriving. You can come back through https://uniscrims.com/support.

Questions? → #support
```

**`#regeln`**

```
**Regeln**
1. Bleib respektvoll: keine Beleidigungen, kein Hass, keine Diskriminierung.
2. Kein Spam und keine Werbung, auch keine Einladungen zu anderen Servern.
3. Keine persönlichen Daten posten, weder deine noch die anderer.
4. Ob ein Scrim stattgefunden hat, gebt ihr im Feedback auf der Scrim-Seite an; bei Streit entscheidet ein Admin. Das gehört nicht in den Chat.
5. Hilfe gibt es in #support oder per Mail an support@uniscrims.com.
Wer gegen die Regeln verstößt, kann vom Server ausgeschlossen werden. Außerdem gelten die Richtlinien von Discord.

**Rules**
1. Be respectful: no insults, no hate, no discrimination.
2. No spam and no advertising, including invites to other servers.
3. Don't post personal data, neither yours nor anyone else's.
4. Whether a scrim took place goes into the feedback on the scrim page; in a dispute an admin decides. It doesn't belong in the chat.
5. Get help in #support or by email to support@uniscrims.com.
Breaking the rules can get you removed from the server. Discord's guidelines apply as well.
```

## Production (VPS)

**Vorher erledigt** (SPEC §9, Punkte 1–4): Impressum geklärt, Datenschutzerklärung geschrieben, AVV mit dem Hoster abgeschlossen, Hoster-Snapshots und -Backups ausgeschaltet (sonst landen Uploads doch in Backups), Ablauf für die Datenauskunft festgelegt.

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

Auf einem geteilten Server (siehe „Variante: Server mit vorhandenem nginx“) vor `ufw enable` auch die Ports der anderen Dienste freigeben (`ss -tlnp` zeigt, was lauscht) und SSH auf dem Port, den der Server tatsächlich nutzt; sonst sperrt `ufw enable` sie aus. Uni Scrims selbst braucht dort keinen eigenen Port, `web` lauscht nur auf `127.0.0.1`.

Docker nach der [offiziellen Anleitung](https://docs.docker.com/engine/install/) installieren. Docker umgeht mit veröffentlichten Ports die ufw-Regeln; veröffentlicht werden nur 80 und 443 (Caddy), die Datenbank nicht.

Beim Domain-Anbieter einen A-Eintrag (und ggf. AAAA) auf die Server-IP setzen. In der Discord-Application den Redirect `https://<domain>/api/auth/callback/discord` eintragen (Discord-Einrichtung, Schritt 1).

### Einrichten und starten

```sh
git clone <repo> /opt/uni-scrims && cd /opt/uni-scrims
cp .env.example .env && chmod 600 .env
```

In der `.env`:

- `DOMAIN=<domain>`, `BETTER_AUTH_URL=https://<domain>`, `PUBLIC_BASE_URL=https://<domain>`, `ADMIN_URL=https://admin.<domain>` (Admin-Bereich, ab Phase 13; der DNS-Eintrag für `admin.<domain>` muss wie der für `<domain>` auf den Server zeigen)
- `BETTER_AUTH_SECRET` mit `openssl rand -base64 32`, `POSTGRES_PASSWORD` mit `openssl rand -hex 32` (hex, weil es in `DATABASE_URL` steht)
- Discord-Werte, `HUB_GUILD_ID`, `HUB_INVITE_URL` (`ADMIN_DISCORD_IDS` gibt es seit Phase 8 nicht mehr; eine alte Zeile stört nicht)
- `CONTACT_EMAIL`: die Kontaktadresse auf der Support-Seite (ab Phase 17), z. B. `support@uniscrims.com`; leer verweist die Seite auf das Impressum
- `DATABASE_URL` setzt die Compose-Datei selbst, ebenso `UPLOAD_DIR` und `LEGAL_DIR` für `web` (der Bot braucht beide nicht; nur das Skript beim Wiederherstellen bekommt `UPLOAD_DIR` im Aufruf). Die `DEV_*`-Schalter sind in Production ohnehin aus.

Rechtstexte anlegen (Format siehe ARCHITECTURE §8):

```sh
mkdir docker/legal && cp docker/legal.example/*.txt docker/legal/
# docker/legal/impressum.txt und docker/legal/datenschutz.txt mit den echten Texten füllen,
# die englischen Fassungen *.en.txt ebenso (sonst zeigt die englische Seite den deutschen Text)
```

Fehlt `docker/legal`, bricht `dc up` ab (der Ordner wird bewusst nicht automatisch leer angelegt). Fehlt eine der Dateien oder ist sie leer, zeigt die Seite „Inhalt folgt.“; das steht dann beim Start im Log von `web` und als Warnung im Admin-Bereich, ebenso, solange ein Text noch „TODO“ enthält (das Gerüst ist nicht fertig ausgefüllt).

Starten, aus dem Repo-Root:

```sh
alias dc='docker compose --env-file .env -f docker/docker-compose.yml'
dc up -d --build
# einmalig: die Hochschul-Liste (ohne Test-Teams)
dc run --rm migrate ./node_modules/.bin/tsx prisma/seed.ts --universities-only
dc ps    # web "healthy", bot läuft, migrate mit Exit-Code 0 beendet
```

Prüfen: `https://<domain>/api/health` antwortet, `/impressum` und `/datenschutz` zeigen deine Texte (nicht „Inhalt folgt.“), der Login klappt, und der Admin-Bereich zeigt „Bot läuft“ und keine Warnung zu Rechtstexten.

- **Updates:** `git pull && dc up -d --build`. Der Migrate-Job läuft dabei jedes Mal mit; `web` und `bot` starten erst danach. Löscht ein Update eine Spalte (zuletzt Phase 20: `Team.rank`), liefen die alten Container zwischen Migration und Neustart gegen ein Schema ohne diese Spalte; dann so: `dc build && dc stop web bot && dc up -d`. Nicht in Git und deshalb von Hand nachzuziehen: die Rechtstexte in `docker/legal/` (beschreibt ein Update die Datenverarbeitung anders, die Datenschutzerklärung anpassen; die Seiten lesen sie bei jedem Aufruf) und die Einrichtung auf dem Server aus diesem README (nginx, logrotate, Cron).
- **Logs:** `dc logs -f web bot`. Docker rotiert sie (3 × 10 MB pro Container).
- **Datenbank-Konsole:** `dc exec db psql -U uniscrims uniscrims`

### Go-Live-Checkliste

Production wurde nach Phase 4 einmal deployt und wieder gestoppt (ARCHITECTURE §11). Vor dem Start mit echten Nutzern auf dem Server:

1. Code auf den aktuellen Stand bringen (`git pull` bzw. `git push` wie unten) und `dc up -d --build`.
2. `docker/legal/impressum.txt` und `docker/legal/datenschutz.txt` auf den aktuellen Stand bringen, ebenso die englischen Fassungen `*.en.txt`; der Admin-Bereich darf keine Warnung zu Rechtstexten zeigen.
3. Mit vorhandenem nginx: Server-Blöcke mit den Logs in `/var/log/uni-scrims/` und `/etc/logrotate.d/uni-scrims` wie unten anlegen, dann `nginx -t && systemctl reload nginx` und `logrotate -d /etc/logrotate.d/uni-scrims`.
4. Backups einrichten (Schlüssel, Cron mit `MAILTO`, siehe Backups), `docker/backup.sh` einmal von Hand laufen lassen, prüfen, dass das Backup extern liegt, und es auf deinem Rechner probeweise entschlüsseln: `gpg --decrypt uniscrims-<zeit>.dump.gpg | head -c 5` zeigt `PGDMP`.
5. Prüfen wie oben (Health über HTTPS, Rechtstexte, Login, „Bot läuft“), dazu: Der Login fügt dich dem Hub-Server hinzu, eine DM des Bots kommt an (z. B. das Prüfergebnis), und eine Bescheinigung knapp unter 5 MB lässt sich hochladen (Body-Limit von Caddy bzw. nginx).
6. Abnahme aus ARCHITECTURE §11 (Phase 4): Posten, Bewerben und Bestätigen brauchen spielbereite Teams (je mindestens 5 verifizierte Spieler, SPEC P0-3). Zwei solche Teams aus echten Accounts buchen einen Scrim, bekommen Buchung und Reminder per Discord und geben Feedback.

### Variante: Server mit vorhandenem nginx

Belegt auf dem Server schon nginx die Ports 80/443 (z. B. weil dort weitere Seiten laufen), bleibt Caddy aus. Eine Ergänzung zur Compose-Datei, nur auf dem Server, `docker/docker-compose.vps.yml` (in `.git/info/exclude` eintragen):

```yaml
services:
  caddy:
    profiles: ["caddy"]
  web:
    ports:
      - "127.0.0.1:3100:3000"
```

Die Compose-Befehle laufen dann mit beiden Dateien (`backup.sh` und das Einspielen beim Wiederherstellen nehmen nur die Haupt-Datei; für `exec db` ist das dasselbe, weil die Ergänzung `db` nicht ändert). `DOMAIN` muss trotzdem in der `.env` stehen, weil die Compose-Datei es verlangt:

```sh
alias dc='docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.vps.yml'
```

nginx übernimmt, was sonst im Caddyfile steht: TLS, HSTS und das Body-Limit von 6 MB. Die Logs von Uni Scrims schreibt nginx in einen eigenen Ordner, den es vorher geben muss (sonst scheitert `nginx -t`): `mkdir -p /var/log/uni-scrims`. Zuerst nur den Block für Port 80 anlegen, `nginx -t && systemctl reload nginx`, dann das Zertifikat holen (`certbot certonly --nginx -d <domain> -d admin.<domain>`, die Erneuerung übernimmt `certbot.timer`) und den Block für 443 ergänzen:

```nginx
# Der OAuth-Callback trägt den einmaligen Discord-Code in der URL und wird nicht geloggt.
map $request_uri $uniscrims_loggable {
    ~^/api/auth/callback 0;
    default 1;
}

server {
    listen 80;
    listen [::]:80;
    server_name <domain> admin.<domain>;
    access_log /var/log/uni-scrims/nginx-access.log combined if=$uniscrims_loggable;
    error_log /var/log/uni-scrims/nginx-error.log;
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name <domain> admin.<domain>;

    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    access_log /var/log/uni-scrims/nginx-access.log combined if=$uniscrims_loggable;
    error_log /var/log/uni-scrims/nginx-error.log;
    client_max_body_size 6m;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Die Logs von Uni Scrims liegen in diesem eigenen Ordner, damit ihre Frist nicht von der logrotate-Regel der anderen Seiten abhängt (und die Muster sich nicht überschneiden, sonst bricht logrotate mit „duplicate log entry“ ab). Die Datenschutzerklärung sagt 14 Tage; dafür `/etc/logrotate.d/uni-scrims` anlegen (gilt auch für das Backup-Log, siehe Backups):

```
/var/log/uni-scrims/*.log {
    daily
    rotate 13
    maxage 14
    missingok
    ifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        [ -s /run/nginx.pid ] && kill -USR1 "$(cat /run/nginx.pid)" || true
    endscript
}
```

Täglich rotiert, 13 alte Dateien plus die aktuelle: höchstens 14 Tage. `ifempty` (der Standard, hier ausdrücklich) rotiert auch leere Dateien; mit `notifempty` fiele an einem Tag ohne Einträge, typisch für das Fehler-Log, die Rotation aus und mit ihr das Löschen alter Dateien (`maxage` greift nur bei einer Rotation). Prüfen mit `logrotate -d /etc/logrotate.d/uni-scrims` und `systemctl status logrotate.timer` (läuft täglich).

Ohne gemeinsames Git-Remote lässt sich der Code direkt auf den Server pushen: dort einmal `git init -b main /opt/uni-scrims && git -C /opt/uni-scrims config receive.denyCurrentBranch updateInstead`, danach lokal `git push <ssh-host>:/opt/uni-scrims main` statt `git pull`, dann `dc up -d --build`.

### Backups

`docker/backup.sh` sichert die Datenbank: `pg_dump`, verschlüsselt mit deinem öffentlichen GPG-Schlüssel, 14 Tage lokal in `/var/backups/uni-scrims` und per `rsync --delete` gespiegelt auf einen externen Speicher (z. B. Hetzner Storage Box). Uploads werden bewusst nicht gesichert.

1. Auf deinem eigenen Rechner ein Schlüsselpaar erzeugen (`gpg --quick-generate-key "Uni Scrims Backup"`) und den öffentlichen Schlüssel exportieren (`gpg --export --armor <key-id> > backup.asc`). Der private Schlüssel bleibt dort; ohne ihn sind die Backups wertlos.
2. Auf dem Server, **alles als root** (der Cron-Job läuft als root und liest dessen Schlüsselbund und SSH-Schlüssel): `apt install gpg rsync`, `gpg --import backup.asc`, einen SSH-Key für root beim externen Speicher hinterlegen und dort den Zielordner anlegen. Einmal `ssh -p <port> <user>@<host>` aufrufen und den Host-Key bestätigen; sonst scheitert `rsync` im Cron mit „Host key verification failed“.
3. Cron für root (`crontab -e`), jede Nacht um 3:30 Uhr. `MAILTO` schickt die Ausgabe gescheiterter Läufe per Mail (braucht einen Mailer auf dem Server, z. B. `apt install bsd-mailx` mit einem Relay); ohne Mailer stehen Fehler nur im Log:

```
MAILTO=<deine-mail>
30 3 * * * BACKUP_GPG_RECIPIENT=<key-id> BACKUP_REMOTE=<user>@<host>:uni-scrims BACKUP_SSH_PORT=23 /opt/uni-scrims/docker/backup.sh >> /var/log/uni-scrims/backup.log 2>&1 || tail -n 20 /var/log/uni-scrims/backup.log
```

(`BACKUP_SSH_PORT=23` gilt für die Storage Box, sonst weglassen. `mkdir -p /var/log/uni-scrims`; das Log rotiert mit der Regel aus „Variante: Server mit vorhandenem nginx“, auf einem Server ohne nginx dieselbe Datei `/etc/logrotate.d/uni-scrims` ohne den `postrotate`-Block anlegen.)

Das Alter eines Backups steht in seinem Namen (UTC). Jeder Lauf löscht die Backups, die älter als 14 Tage abzüglich zwei Stunden sind; so fällt das Backup von vor 14 Nächten in dieser Nacht weg, auch wenn der Cron nach einer Zeitumstellung eine Stunde früher läuft. Die 14 Tage gelten auch, wenn ein Lauf scheitert: Das Skript löscht alte Backups lokal zuerst und spiegelt danach auch ohne neuen Dump (`--delete` entfernt sie extern), endet aber mit Fehlercode. Nur das jüngste Backup bleibt immer, auch wenn es älter wird; so gibt es bei einem dauerhaft scheiternden Dump noch eines. Sobald wieder ein Dump gelingt, fällt es weg. Ist der externe Speicher nicht erreichbar, bricht es ab; dann bleiben extern alte Backups liegen, bis der nächste Lauf durchkommt. Deshalb Fehlermails ernst nehmen. Automatisch getestet wird das Skript mit Platzhaltern für Docker und GPG (`docker/test/backup.test.ts`).

Nach einem Neuaufsetzen des Servers zuerst die Backups vom externen Speicher zurückholen, bevor der Cron wieder läuft: `rsync -a -e "ssh -p <port>" <user>@<host>:uni-scrims/ /var/backups/uni-scrims/`. Fehlen lokal Backups, die extern noch nicht abgelaufen sind, oder das extern jüngste (wenn lokal kein neueres liegt), spiegelt das Skript nicht, statt sie extern per `--delete` zu löschen: Es löscht extern nur die abgelaufenen und endet mit Fehlercode.

Gelöschte Konten stehen bis zum Ablauf (14 Tage, beim jüngsten Backup nach gescheiterten Läufen länger) noch in den Backups; das steht in der Datenschutzerklärung.

#### Wiederherstellen

Die Wiederherstellung ersetzt die Datenbank durch den Stand des Backups. Sperren und Kontolöschungen danach fehlen dann; sie werden aus der alten Datenbank exportiert und mit einem Skript nachgezogen. Auf dem Server als root, im Repo-Ordner, mit dem `dc`-Alias:

1. Web und Bot anhalten, damit sich nichts mehr ändert, dann Sperren und Löschungen exportieren, solange die alte Datenbank noch lesbar ist. Die Datei ist nur für root lesbar:

```sh
dc stop web bot
install -m 600 /dev/null moderation.json
dc exec -T db psql -U uniscrims -d uniscrims -At > moderation.json <<'SQL'
SELECT json_build_object(
  'bannedTeams', COALESCE((SELECT json_agg(json_build_object('id', t.id))
    FROM "Team" t WHERE t."bannedAt" IS NOT NULL), '[]'),
  'bannedUsers', COALESCE((SELECT json_agg(json_build_object('id', u.id, 'discordId', a."accountId"))
    FROM "user" u JOIN account a ON a."userId" = u.id AND a."providerId" = 'discord'
    WHERE u."bannedAt" IS NOT NULL), '[]'),
  'deletedUsers', COALESCE((SELECT json_agg(json_build_object('id', u.id))
    FROM "user" u WHERE u."deletedAt" IS NOT NULL), '[]'),
  'staff', COALESCE((SELECT json_agg(json_build_object('id', u.id, 'role', u."staffRole"))
    FROM "user" u WHERE u."staffRole" IS NOT NULL), '[]')
);
SQL
head -c 200 moderation.json; echo
```

Auch aufgelöste gesperrte Teams gehören in den Export: Im Backup sind sie vielleicht noch aktiv, und ohne die Sperre würde das Skript beim Löschen ihres Captains die Rolle übergeben, statt das Team wieder aufzulösen. Die Rollen (`staff`, ab Phase 8) setzt das Skript genau wie in der alten Datenbank, auch zurück auf keine Rolle: So kommen Rechte, die nach dem Backup entzogen wurden, nicht zurück.

2. Die alte Datenbank durch eine leere ersetzen und das Backup einspielen. In eine leere Datenbank, damit Tabellen oder Typen späterer Migrationen nicht stehen bleiben; `--single-transaction` spielt alles oder nichts ein. Entschlüsselt wird auf dem Rechner mit dem privaten Schlüssel und direkt per SSH eingespielt, so liegt nirgends ein unverschlüsselter Dump. Ab dem `dropdb` ist die alte Datenbank weg; der Export aus Schritt 1 ist dann die einzige Quelle für das Nachziehen.

```sh
# auf deinem Rechner: das Backup vom externen Speicher holen
rsync -e "ssh -p <port>" <user>@<host>:uni-scrims/uniscrims-<zeit>.dump.gpg .
# auf dem Server
dc exec -T db dropdb -U uniscrims --force uniscrims && dc exec -T db createdb -U uniscrims uniscrims
# auf deinem Rechner: einspielen, danach die heruntergeladene Kopie löschen
gpg --decrypt uniscrims-<zeit>.dump.gpg | ssh root@<server> \
  'cd /opt/uni-scrims && docker compose --env-file .env -f docker/docker-compose.yml exec -T db pg_restore -U uniscrims -d uniscrims --single-transaction --exit-on-error' \
  && rm uniscrims-<zeit>.dump.gpg
```

Scheitert das Einspielen, bleibt die Datenbank leer: Ursache beheben und `dropdb`/`createdb` und das Einspielen wiederholen.

3. Schema auf den Stand des Codes bringen, Sperren und Löschungen nachziehen und erst dann starten. Das Skript liest den Export von stdin, weil der Bot-Container als anderer Nutzer läuft und die Datei nicht lesen darf. Scheitert ein Schritt, startet nichts, und der Export bleibt erhalten; nach der Fehlerbehebung den Block wiederholen (Migrate-Job und Skript sind idempotent):

```sh
dc run --rm migrate \
  && dc run --rm --no-deps -T -e UPLOAD_DIR=/data/uploads bot \
    node --import tsx src/scripts/reapply-moderation.ts < moderation.json \
  && dc start web bot \
  && shred -u moderation.json
```

Das Skript zeigt, was es nachgezogen hat; ein zweiter Lauf ändert nichts mehr. Es setzt die Rollen wie in der alten Datenbank und setzt jede 2FA zurück: Du, Admins und Prüfer richtet sie beim nächsten Besuch des Admin-Bereichs neu ein. Es sperrt Teams (auch inzwischen aufgelöste, damit die Löschung ihres Captains sie danach wieder auflöst) und Nutzer erneut (mit allen Folgen der Sperre), legt für gesperrte Discord-Konten, die das Backup nicht kennt, einen Sperr-Platzhalter an und löscht Konten erneut. Ist ein gesperrter oder gelöschter Nutzer im Backup noch Captain eines Teams, das in der alten Datenbank nicht gesperrt war, hatte er die Rolle danach abgegeben: Das am längsten dabei befindliche Mitglied übernimmt sie, und gesperrt bzw. gelöscht wird nur er; war er im Backup das einzige Mitglied, verlässt er das Team, das sich damit auflöst. Dateien von dabei entfernten Prüfungen löscht der Janitor im Web-Prozess (verwaiste Dateien, nach spätestens einem Tag).

Ist die alte Datenbank nicht mehr lesbar, gibt es keinen Export: Sperren und Löschungen seit dem letzten gelungenen Backup (normalerweise höchstens ein Tag) fehlen dann. Betroffene können die Löschung unter „Konto“ wiederholen oder sich melden; Sperren im Admin-Bereich neu setzen. Rollen auf der Rollen-Seite prüfen und bei allen Admins und Prüfern „2FA zurücksetzen“, die eigene 2FA per SQL wie oben: Ein nach dem Backup entzogener Zugang oder zurückgesetzter Schlüssel gilt sonst wieder. Das ist in SPEC §9 als Risiko festgehalten und steht in der Datenschutzerklärung.

Offene Prüfungen, deren Datei nach dem Einspielen fehlt (Uploads sind nicht im Backup), zeigt die Prüf-Queue mit „Datei fehlt“; freigeben geht dann nicht. Mit Grund ablehnen, z. B. „Bitte erneut hochladen“; die Nutzer bekommen eine DM und können neu hochladen.

## Entsperren per SQL

Sperren gibt es im Admin-Bereich, Entsperren im MVP nur per Datenbank (`dc exec db psql -U uniscrims uniscrims`):

```sql
-- Nutzer über die Discord-ID finden
SELECT u.id, u.name, u."bannedAt", u."deletedAt" FROM "user" u
  JOIN account a ON a."userId" = u.id
  WHERE a."providerId" = 'discord' AND a."accountId" = '<discord-id>';
-- Entsperren. Hat der Nutzer sein Konto während der Sperre gelöscht, ist die gefundene Zeile ein
-- Sperr-Platzhalter ("deletedAt" gesetzt), der nur die Discord-ID für die Sperre hält: Er wird
-- samt Discord-Verknüpfung und Sessions gelöscht; danach kann sich die Person neu registrieren und
-- Discord verknüpfen (seit Phase 7 legt ein Discord-Login kein Konto an).
BEGIN;
DELETE FROM "user" WHERE id = '<user-id>' AND "deletedAt" IS NOT NULL;
UPDATE "user" SET "bannedAt" = NULL WHERE id = '<user-id>';
COMMIT;

-- Team finden und entsperren
SELECT id, name, "bannedAt" FROM "Team" WHERE name ILIKE '%<name>%' AND "dissolvedAt" IS NULL;
UPDATE "Team" SET "bannedAt" = NULL WHERE id = '<team-id>';
```

Was das Entsperren **nicht** zurückholt:

- Abgesagte Scrims, gelöschte Anfragen und zurückgezogene Bewerbungen bleiben so.
- Ein gesperrter Spieler wurde aus seinem Team entfernt (seit Phase 21 aus allen Teams, in denen er nicht Captain war) und muss per Einladungslink neu beitreten.
- Bei einem gesperrten Captain Nutzer und Team zusammen entsperren. Soll nur das Team wieder spielen, in einer Transaktion einen anderen Captain setzen und den gesperrten Ex-Captain aus dem Team nehmen (wie bei jedem gesperrten Spieler, SPEC Edge Cases):

```sql
BEGIN;
UPDATE "Team" SET "captainId" = '<user-id eines Mitglieds>', "bannedAt" = NULL WHERE id = '<team-id>';
DELETE FROM "TeamMember" WHERE "userId" = '<user-id des gesperrten Ex-Captains>';
COMMIT;
```

  Ein gesperrter Captain eines aktiven Teams könnte weder die Rolle übertragen noch sein Konto löschen.
- Eine offene Prüfung wurde bei der Sperre abgelehnt und die Datei gelöscht; nach dem Entsperren muss der Nutzer die Bescheinigung neu hochladen.
- Hat ein gesperrter Nutzer sein Konto gelöscht, bleibt es gelöscht: Ein neuer Login nach dem Entsperren legt einen neuen Nutzer an, ohne Verifizierung, ohne Team und ohne Verbindung zum alten Konto.
