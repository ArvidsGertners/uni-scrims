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
- `DATABASE_URL` setzt die Compose-Datei selbst, ebenso `UPLOAD_DIR` und `LEGAL_DIR` für `web` (der Bot braucht beide nicht; nur das Skript beim Wiederherstellen bekommt `UPLOAD_DIR` im Aufruf). Die `DEV_*`-Schalter sind in Production ohnehin aus.

Rechtstexte anlegen (Format siehe ARCHITECTURE §8):

```sh
mkdir docker/legal && cp docker/legal.example/*.txt docker/legal/
# docker/legal/impressum.txt und docker/legal/datenschutz.txt mit den echten Texten füllen
```

Fehlt `docker/legal`, bricht `dc up` ab (der Ordner wird bewusst nicht automatisch leer angelegt). Fehlt eine der Dateien oder ist sie leer, zeigt die Seite „Inhalt folgt.“; das steht dann beim Start im Log von `web` und als Warnung im Admin-Bereich.

Starten, aus dem Repo-Root:

```sh
alias dc='docker compose --env-file .env -f docker/docker-compose.yml'
dc up -d --build
# einmalig: die Hochschul-Liste (ohne Test-Teams)
dc run --rm migrate ./node_modules/.bin/tsx prisma/seed.ts --universities-only
dc ps    # web "healthy", bot läuft, migrate mit Exit-Code 0 beendet
```

Prüfen: `https://<domain>/api/health` antwortet, `/impressum` und `/datenschutz` zeigen deine Texte (nicht „Inhalt folgt.“), der Login klappt, und der Admin-Bereich zeigt „Bot läuft“ und keine Warnung zu Rechtstexten.

- **Updates:** `git pull && dc up -d --build`. Der Migrate-Job läuft dabei jedes Mal mit; `web` und `bot` starten erst danach.
- **Logs:** `dc logs -f web bot`. Docker rotiert sie (3 × 10 MB pro Container).
- **Datenbank-Konsole:** `dc exec db psql -U uniscrims uniscrims`

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

nginx übernimmt, was sonst im Caddyfile steht: TLS, HSTS und das Body-Limit von 6 MB. Die Logs von Uni Scrims schreibt nginx in einen eigenen Ordner, den es vorher geben muss (sonst scheitert `nginx -t`): `mkdir -p /var/log/uni-scrims`. Zuerst nur den Block für Port 80 anlegen, `nginx -t && systemctl reload nginx`, dann das Zertifikat holen (`certbot certonly --nginx -d <domain>`, die Erneuerung übernimmt `certbot.timer`) und den Block für 443 ergänzen:

```nginx
# Der OAuth-Callback trägt den einmaligen Discord-Code in der URL und wird nicht geloggt.
map $request_uri $uniscrims_loggable {
    ~^/api/auth/callback 0;
    default 1;
}

server {
    listen 80;
    listen [::]:80;
    server_name <domain>;
    access_log /var/log/uni-scrims/nginx-access.log combined if=$uniscrims_loggable;
    error_log /var/log/uni-scrims/nginx-error.log;
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name <domain>;

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
    FROM "user" u WHERE u."deletedAt" IS NOT NULL), '[]')
);
SQL
head -c 200 moderation.json; echo
```

Auch aufgelöste gesperrte Teams gehören in den Export: Im Backup sind sie vielleicht noch aktiv, und ohne die Sperre würde das Skript beim Löschen ihres Captains die Rolle übergeben, statt das Team wieder aufzulösen.

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

Das Skript zeigt, was es nachgezogen hat; ein zweiter Lauf ändert nichts mehr. Es sperrt Teams (auch inzwischen aufgelöste, damit die Löschung ihres Captains sie danach wieder auflöst) und Nutzer erneut (mit allen Folgen der Sperre), legt für gesperrte Discord-Konten, die das Backup nicht kennt, einen Sperr-Platzhalter an und löscht Konten erneut. Ist ein gesperrter oder gelöschter Nutzer im Backup noch Captain eines Teams, das in der alten Datenbank nicht gesperrt war, hatte er die Rolle danach abgegeben: Das am längsten dabei befindliche Mitglied übernimmt sie, und gesperrt bzw. gelöscht wird nur er; war er im Backup das einzige Mitglied, verlässt er das Team, das sich damit auflöst. Dateien von dabei entfernten Prüfungen löscht der Janitor im Web-Prozess (verwaiste Dateien, nach spätestens einem Tag).

Ist die alte Datenbank nicht mehr lesbar, gibt es keinen Export: Sperren und Löschungen seit dem letzten gelungenen Backup (normalerweise höchstens ein Tag) fehlen dann. Betroffene können die Löschung unter „Konto“ wiederholen oder sich melden; Sperren im Admin-Bereich neu setzen. Das ist in SPEC §9 als Risiko festgehalten und steht in der Datenschutzerklärung.

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
-- samt Discord-Verknüpfung und Sessions gelöscht, ein späterer Login legt einen neuen Nutzer an.
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
- Ein gesperrter Spieler wurde aus seinem Team entfernt und muss per Einladungslink neu beitreten.
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
