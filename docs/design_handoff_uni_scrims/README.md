# Handoff: Uni Scrims – Web-App (alle Screens)

## Overview
Uni Scrims ist eine Scrim-Plattform für Valorant-Teams deutscher Hochschulen. Studierende melden sich mit Discord an, verifizieren sich per Immatrikulationsbescheinigung, bilden Teams (5–10 Spieler), posten Scrim-Anfragen aufs Board, bewerben sich auf Anfragen anderer Teams und geben nach dem Match kurzes Feedback. Die Lobby-Koordination läuft komplett über Discord.

**Nicht bauen** (bewusst ausgeschlossen): Chat, Leaderboards, Stats-Dashboards, Spielerprofile, Notifications-Inbox, Suchleiste. Keine offiziellen Riot/Valorant-Logos, Agent-Art oder Screenshots.

## About the Design Files
Die Dateien in diesem Ordner sind **Design-Referenzen in HTML** – ein klickbarer Prototyp, der Aussehen und Verhalten zeigt, **kein Produktionscode**. Aufgabe: Die Designs in der Ziel-Codebase nachbauen – **Next.js/React + Tailwind + shadcn/ui** (Card, Badge, Button, Input, Select, Textarea, Alert, Tabs, Sheet/DropdownMenu, Progress). Wenn es noch keine Codebase gibt: Next.js (App Router) + Tailwind + shadcn/ui.

- `Uni Scrims.html` – eigenständige Datei, offline im Browser öffnen. Unten rechts gibt es ein **„Prototyp“-Panel** (nur Review-Werkzeug, NICHT nachbauen): Richtung A/B/C, Mobil/Desktop, Screen-Sprung, DM-Banner, leere Zustände.
- `Uni Scrims.dc.html` + `support.js` – Quelle des Prototyps (Markup mit Inline-Styles + Logik-Klasse). Für exakte Werte hier nachsehen.
- `tokens.css` – alle Design-Tokens als shadcn-kompatible CSS-Variablen für alle drei Richtungen.

## Fidelity
**High-Fidelity.** Farben, Typo, Abstände, Radien, Copy und Interaktionen sind final. Pixelgenau mit shadcn/Tailwind nachbauen; Tokens aus `tokens.css` übernehmen.

## ⚠ Richtung wählen
Der Prototyp enthält drei visuelle Richtungen auf identischer Struktur. **Nur eine umsetzen** (oder bewusst als Theme-Switch via `data-dir` am `<html>`):
- **A · Klar** – Geist / Geist Mono, Radius 12/8 px, Karten mit 1px-Border. shadcn-nah, Default.
- **B · Taktisch** – Chakra Petch (Headlines, Buttons, Nav) / IBM Plex Sans (Body) / JetBrains Mono (Labels), Radius 0, abgeschrägte Ecken via `clip-path`, Labels UPPERCASE mit 0.14em Tracking.
- **C · Broadcast** – Barlow Condensed (Headlines, Labels) / Barlow (Body), Radius 4 px, randlose Flächen, große UPPERCASE-Headlines (H1 44 px, Hero 64 px), Board-Karten mit vollflächigem Akzent-Datumsblock.

Board-Karten haben je Richtung ein eigenes Layout (siehe „Board“). Alle anderen Screens unterscheiden sich nur über Tokens.

## Layout-System (alle Screens)
- **Mobile-first.** Content: einspaltig, `max-width: 768px`, zentriert. Horizontales Padding 20 px (<640 px) bzw. 32 px. Main: `padding-top 28px`, `padding-bottom 64px`.
- Vertikaler Rhythmus: Screen-Sektionen `gap 28–32px`, innerhalb Karten `gap 12–18px`, Karten-Padding 20 px (Listenkarten 16–18 px).
- Hit-Targets ≥ 44 px. Inputs/Selects 48 px hoch, Font 16 px (verhindert iOS-Zoom). Primär-Buttons 48–52 px (Login-CTA 56 px); auf Mobile meist volle Breite.
- `color-scheme: dark` am Root (native Date/Time/Select dunkel).

### Header (eingeloggt)
- Sticky, Höhe 64 px, `bg: --background`, unten 1px `--border`. Gleiche 768er-Breite wie Content.
- **Wortmarke**: 10×20 px Akzent-Balken, `skewX(-14deg)`, dann „UNI SCRIMS“ (font-display, 800, 18 px, uppercase, 0.04em). Klick → Board.
- **Desktop (≥640 px)**: Nav-Buttons „Board“, „Meine Scrims“, „Team“, „Verifizierung“, „Konto“ (font-display, 14 px, 600; Höhe 64; inaktiv `--muted-foreground`, Hover/aktiv `--foreground`; aktiv = 2px-Akzentlinie unten, inset 10 px). Dann Outline-Button „Abmelden“ (36 px hoch).
- „Verifizierung“ zeigt einen 6px-Punkt in `--warning`, solange der Status nicht „verifiziert“ ist.
- **Mobile (<640 px)**: Wortmarke + 44×44-Menü-Button (Burger/X, `bg --card`, 1px Border). Öffnet ein Dropdown direkt unter dem Header (volle Breite, starker Schatten): Nav-Zeilen 56 px, font-display 17 px, aktive Zeile `bg --card` + 8px-Akzentquadrat rechts; Trennlinie; „Abmelden“ (muted). Navigation schließt das Menü. (shadcn: Sheet `side="top"` oder Collapsible.)

### Header (ausgeloggt, Login)
Nur Wortmarke, 64 px, Border unten.

### DM-Warnbanner (dismissible)
Direkt unter dem Header, volle Breite, `bg --warning-soft`, Border unten `--warning-line`. Inhalt in 768er-Breite, padding 12 px:
- Warn-Dreieck 20 px (`--warning`)
- Titel **„Wir konnten dir keine Discord-Nachricht schicken“** (14 px, 600)
- Text „Ohne Direktnachrichten verpasst du Bewerbungen und Zusagen.“ + Inline-Link „So behebst du das“ (warning, 600, unterstrichen) → Konto
- X-Button 32×32 rechts → blendet Banner aus (Session).
Wird angezeigt, wenn der Bot dem User keine DM zustellen kann und nicht weggeklickt wurde.

### Erfolgs-Toast
Unter Header/Banner im Content-Container: `bg --success-soft`, 1px `rgba(61,214,140,.3)`, Radius sm, Check-Icon grün, 14 px Text. Auto-Hide nach 3,5 s. (shadcn: Sonner, aber inline-oben positioniert.)

### Footer
Border oben. 768er-Breite, padding 24/32 px, 13 px. Links „Impressum“, „Datenschutz“ (muted), rechts/darunter „Kein offizielles Produkt von Riot Games.“ (faint). Flex-wrap.

### Wiederkehrende Elemente
- **Eyebrow/Label**: font-label, `--label-size`, `--label-weight`, `--label-tracking`, `--label-transform`, `--muted-foreground`.
- **H1**: font-display, `--display-weight`, `--display-transform`, `--display-tracking`, `--h1`, line-height 1.05, `text-wrap: balance`.
- **H2**: wie H1 mit `--h2`, line-height 1.15.
- **Karte**: `bg --card`, `--card-border`, Radius `--radius`, `clip-path: --clip` (B).
- **Primary Button**: `bg --primary`, Text `--primary-foreground` (dunkel – Kontrast!), font-display 700 15–16 px, `--btn-transform`/`--btn-tracking`, Radius `--radius-sm`, `clip-path: --clip-btn` (B). Hover `--primary-hover`.
- **Secondary Button**: transparent, 1px `--border-strong`, Text `--foreground`, Hover `bg --secondary`.
- **Ghost/Link**: kein Rahmen, `--muted-foreground`, Hover `--foreground`.
- **Disabled Primary**: `bg --secondary`, Text `--faint`, `cursor: not-allowed`.
- **Badges** (Höhe 22–26 px, Radius `--radius-pill`, 12–13 px, 600): neutral (`--secondary`), Akzent (`--accent-soft`/`--accent-text`), Erfolg (`--success-soft`/`--success`), Warnung (`--warning-soft`/`--warning`). Status-Badges haben oft einen 6px-Punkt vorne.
- **Team-Avatar**: Quadrat 40–64 px, `bg --secondary`, 1px Border, Radius 8–10 px, Kürzel in font-label 11–16 px 700 (z. B. „TUM“). Eigenes Team: Akzent-Fläche mit dunklem Text. Echte Team-Logos gibt es nicht – Kürzel ist das Design.
- **User-Avatar**: Kreis 40–48 px, `bg --secondary`, Initialen font-label.
- **Input/Select/Textarea**: `bg --input`, 1px `--border`, Radius sm, 16 px. Focus: Border `--ring` + `box-shadow 0 0 0 3px --accent-soft`. Label 14 px 500 darüber, `gap 8px`; optional-Hinweis rechts im Label in `--faint` („optional“, „2–4 Zeichen“, Zähler „0/280“).
- **Zurück-Link**: Chevron-left 16 px + Text 14 px muted, Hover foreground.
- **Leerer Zustand**: 1px dashed `--border-strong`, Radius, padding 40–48/24, zentriert: optional Icon-Kachel 56 px, H2, muted Text (max 340–360 px), Button.
- Icons: Lucide (stroke 2), 14–20 px. Verwendet: menu, x, chevron-left/right, check, clock, layers, map-pin, alert-triangle, shield-check, upload, file, copy, plus, external-link, message-square, log-in, calendar.

## Screens

### 1. Login (ausgeloggt)
Kein App-Header, kein Banner. Stack `gap 56px`, padding-top +24 px.
- Eyebrow in `--accent-text`: „Valorant-Scrims für Hochschulteams“
- Hero-H1 (`--hero`, line-height 1): „Scrims gegen andere Uni-Teams. Ohne Suchen in zehn Discords.“
- 17 px muted, max 520 px: „Postet eure Anfrage aufs Board, bewerbt euch bei anderen Teams und klärt die Lobby direkt auf Discord.“
- Primary 56 px (Mobile 100 % Breite): log-in-Icon + „Mit Discord anmelden“ → Discord-OAuth → danach Verifizierung (Upload).
- Darunter 13 px muted mit shield-check: „Nur für eingeschriebene Studierende deutscher Hochschulen.“
- Sektion „So funktioniert's“ (Eyebrow), 3 Zeilen: Nummer (font-display, 28 px, Akzent, 44 px breit) + Titel (H2) + muted Text:
  - 01 „Mit Discord anmelden“ – „Kein neues Passwort – wir nutzen deinen Discord-Account.“
  - 02 „Studierendenstatus bestätigen“ – „Lade deine Immatrikulationsbescheinigung hoch. Wir prüfen sie von Hand.“
  - 03 „Team bilden, Scrims spielen“ – „5 bis 10 Spieler pro Team. Anfragen posten, bewerben und nach dem Match kurz Feedback geben.“

### 2. Verifizierung – vier Zustände
Eyebrow „Verifizierung“ über allen Zuständen.

**a) Upload**
- H1 „Bestätige deinen Studierendenstatus“; Text „Uni Scrims ist nur für eingeschriebene Studierende. Lade dazu deine aktuelle Immatrikulationsbescheinigung hoch.“
- Select „Hochschule“: Universität Mannheim, RWTH Aachen, Technische Universität München, Karlsruher Institut für Technologie, Ruhr-Universität Bochum, Universität Heidelberg, FAU Erlangen-Nürnberg, „Andere Hochschule …“
- Dropzone: 2px dashed `--border-strong`, padding 36/20, zentriert; Upload-Icon in 52px-Kachel (`--accent-soft`), „Datei auswählen“ (16 px 600), „PDF, JPG oder PNG · max. 10 MB“ (13 px faint). Hover: Border Akzent + `bg --accent-soft`. Drag & Drop + Klick.
- Nach Auswahl: Dateizeile (Karte mit 1px Akzent-Border): File-Icon-Kachel, Dateiname (ellipsis) + Größe, Ghost „Entfernen“.
- „Darauf achten wir“ (Eyebrow) + 3 Zeilen mit grünem Check: „Dein Name ist gut lesbar“, „Aktuelles Semester (WiSe 2026/27)“, „Name der Hochschule ist sichtbar“.
- Info-Box (Karte, shield-check grün): „Was mit deinem Dokument passiert“ – „Nur das Prüfteam sieht die Bescheinigung. Nach der Prüfung wird sie gelöscht – gespeichert bleiben nur Hochschule und Gültigkeit.“ *(Copy vom Produkt-Owner bestätigen lassen.)*
- Primary Block „Zur Prüfung einreichen“ – disabled ohne Datei. → Zustand „In Prüfung“.

**b) In Prüfung**: 64px-Icon-Kachel (Uhr, `--warning-soft`/`--warning`); H1 „Wir prüfen deine Bescheinigung“; „Das dauert meist weniger als 24 Stunden. Sobald wir fertig sind, bekommst du eine Discord-Nachricht.“ *(Dauer bestätigen.)* Zusammenfassungs-Karte (Zeilen 14 px, label muted links / Wert rechts, 1px Trenner): Status „● In Prüfung“ (warning), Hochschule, Eingereicht „23.10.2026, 14:12 Uhr“. Secondary „Board schon mal ansehen“.

**c) Verifiziert**: Icon-Kachel shield-check grün; H1 „Du bist verifiziert“; „Du kannst jetzt Teams gründen oder beitreten und Scrims anfragen.“ Karte: Status „● Verifiziert“ (grün), Hochschule, Gültig bis „31.03.2027 · Ende WiSe“. Buttons: Primary „Zum Board“, Secondary „Zum Team“.

**d) Abgelehnt**: Icon-Kachel Warn-Dreieck in Akzent; H1 „Das hat leider nicht geklappt“; „Wir konnten deinen Studierendenstatus mit diesem Dokument nicht bestätigen.“ Grund-Box (`--accent-soft`, 1px Akzent): Label „Grund“ + „Auf dem Dokument ist kein aktuelles Semester zu erkennen. Bitte lade die Bescheinigung für das WiSe 2026/27 hoch.“ (Grund kommt vom Prüfer.) Primary Block mit Upload-Icon „Neues Dokument hochladen“ → Upload.

### 3. Team – kein Team (erstellen / beitreten)
- H1 „Du bist noch in keinem Team“; „Gründe ein Team für deine Hochschule oder tritt über einen Einladungslink bei. Ein Team hat 5 bis 10 Spieler.“
- Karte „Team gründen“ (H2): Input „Teamname“ (Placeholder „z. B. Mannheim Mavericks“); Input „Kürzel“ (Hinweis „2–4 Zeichen“, maxlength 4, font-label, uppercase, Placeholder „MAV“); Feld „Hochschule“ nicht editierbar (`bg --secondary`): „Universität Mannheim“ + rechts 12 px muted „aus deiner Verifizierung“; Primary Block „Team gründen“.
- Trenner: Linie – „oder“ – Linie (13 px faint).
- Karte „Team beitreten“ (H2): „Frag deine Kapitänin oder deinen Kapitän nach dem Einladungslink und öffne ihn. Oder füge ihn hier ein:“ + Input (Placeholder „uni-scrims.de/einladen/…“) + Secondary „Beitreten“ in einer Zeile.

### 4. Team – Verwaltung
- Kopf: 64px-Avatar „MAV“ (Akzentfläche) + H1 „Mannheim Mavericks“ + „Universität Mannheim“ (muted).
- Kaderstand: „6“ (font-display 28 px) + „ / 10 Spieler“ (18 px faint); rechts Hinweis 13 px muted: „Platz für 4 weitere“ / „Noch N bis zum Minimum“ / „Kader voll“. Progress 8 px (`bg --secondary`, Füllung Akzent bzw. Warnung bei < 5), weiße/bg-farbige 2px-Markierung bei 50 % (= Minimum 5).
- Bei < 5 Spielern Warn-Alert: „Ihr braucht mindestens 5 Spieler, um Scrims anzufragen oder euch zu bewerben.“
- Karte „Spieler einladen“ (H2): „Teile den Link in eurem Team-Discord. Beitreten können nur verifizierte Studierende.“ + Readonly-Feld (font-label 14 px) `uni-scrims.de/einladen/MAV-7K2Q` + Primary mit Copy-Icon „Kopieren“ → 2 s „Kopiert“.
- „Kader“ (Eyebrow) + Liste, Zeilen min. 60 px mit 1px Trenner: Kreis-Avatar Initialen, Discord-Name (font-label 14 px 600), Badge „Kapitänin“/„Kapitän“ (Akzent-soft), „Du“ (faint). Rechts Ghost „Entfernen“ (Hover Akzent-Text + Akzent-soft) – nur für Kapitän sichtbar, nicht für sich selbst.
- Outline-Button in Akzent-Textfarbe „Team verlassen“.
- Beispielkader: lena.exe (Kapitänin, Du), mxrc, tobi.rar, jxnna, kevkev, s0phie.

### 5. Board (Scrim-Anfragen) – Key Screen
- Kopf (flex-wrap, space-between, align-end): Eyebrow „5 offene Anfragen“ + H1 „Scrim-Board“; rechts Primary mit Plus „Anfrage erstellen“ (Mobile: volle Breite unter dem Titel).
- Anfragen nach Tag gruppiert. Gruppen-Kopf: Label in `--foreground` („Donnerstag, 30. Oktober“) – 1px-Linie flex:1 – „2 Anfragen“ (faint). Gruppen `gap 32px`, Karten `gap 12px`.
- Ganze Karte klickbar → Anfrage-Detail.
- Kein Filter, keine Suche.

**Karte A (Klar)**: Karte padding 18, gap 16, Hover Border `--border-strong` + `bg --secondary`.
- Zeile 1: Avatar 44 + Teamname (16 px 600) / Hochschule (13 px muted, ellipsis) + rechts Format-Badge („Bo3“, font-label 12 px, Border).
- Zeile 2 (14 px, wrap, gap 8/18): clock „19:00 Uhr“ (foreground), layers „Gold – Platin“, map-pin „Frankfurt“ (muted).
- Fuß (Border-top, padding-top 14): links „3 Bewerbungen“ (13 px muted) oder Badge „✓ Beworben“ (Akzent-soft); rechts „Ansehen ›“ (14 px 600 `--accent-text`).

**Karte B (Taktisch)**: horizontale Zeile, 1px Border, `clip-path` Ecke oben rechts 16 px, Hover Border Akzent.
- Linke Spalte 96 px (Border-right): Uhrzeit font-label 22 px 700 + „DO 30.10.“ (11 px, 0.12em, uppercase, muted).
- Mitte: Teamname (Chakra Petch 17 px 700 UPPERCASE) + optional Tag „BEWORBEN“ (Akzentfläche, 10 px mono); Hochschule 13 px muted; Tags (mono 11 px uppercase, padding 3/7, 1px Border): Format in Akzent, Rang + Server in `--border-strong`/muted.
- Rechts 36 px: Chevron in Akzent.

**Karte C (Broadcast)**: randlos, `bg --card`, Radius 4, overflow hidden, Hover `bg --secondary`.
- Linker Block 88 px, **vollflächig Akzent**, Text `--primary-foreground`: „DO 30.10.“ (Barlow Condensed 800 14 px, 0.1em) über Uhrzeit (800, 32 px, line-height 1).
- Rechts padding 14/16: Teamname (800, 24 px, UPPERCASE) + rechts Format (800, 20 px, `--accent-text`); Hochschule 14 px muted; Meta-Zeile Barlow Condensed 700 13 px uppercase: Rang (foreground) · Server (muted) · „✓ Beworben“ (accent-text) oder „3 Bewerbungen“ (faint).

**Leer**: Calendar-Icon-Kachel, „Gerade keine offenen Anfragen“, „Seid das erste Team auf dem Board. Andere Uni-Teams können sich dann bei euch bewerben.“, Primary „Anfrage erstellen“.

### 6. Anfrage-Detail + Bewerben – Key Screen
- Zurück „Zurück zum Board“.
- Kopf: Avatar 64 + H1 Teamname + Zeile „Technische Universität München“ + Badge „Verifiziert“ (Erfolg, shield-Icon).
- Detail-Raster: Grid 2 Spalten (Mobile) / 3 (Desktop), `gap 1px` auf `bg --border` (ergibt Haarlinien), Rahmen 1px, Radius. Zellen `bg --card`, padding 16: Label + Wert (font-display 600 18 px). Felder: Datum („Donnerstag, 30.10.“), Uhrzeit („19:00 Uhr“), Format („Bo3“), Maps („Ascent · Bind · Lotus“ oder „Freie Wahl“), Rang („Gold – Platin“), Server („Frankfurt“).
- Optional „Notiz vom Team“ (Eyebrow) + Zitat 16 px: „„Training für die Uni-Liga. Comms gern auf Deutsch, Englisch geht auch.““
- **Bewerben-Karte** (nicht beworben): H2 „Bewerben“; „Du bewirbst dich als **Mannheim Mavericks** · 6 Spieler“; Textarea „Nachricht an {Team}“ mit „optional · 0/280“ (maxlength 280, 3 Zeilen, Placeholder „z. B. Wir sind Gold 3 bis Platin 2 und können ab 18:30.“); Primary Block 52 px „Jetzt bewerben“. → Toast „Bewerbung an {Team} gesendet“.
- **Beworben-Zustand**: Erfolgs-Box (`--success-soft`, Check): „Bewerbung gesendet“ / „{Team} sieht jetzt eure Bewerbung. Bei einer Zusage bekommst du eine Discord-Nachricht.“ + Secondary „Bewerbung zurückziehen“.
- „So geht's weiter“ (Eyebrow), 3 Zeilen mit Nummer (font-label 13 px 700 accent-text): „Das Team sieht eure Bewerbung und nimmt ein Team an.“ / „Bei einer Zusage bekommst du eine Discord-Nachricht.“ / „Die Lobby klärt ihr direkt auf Discord.“

### 7. Anfrage erstellen
- Zurück „Zurück zum Board“; H1 „Scrim-Anfrage erstellen“; „Deine Anfrage erscheint sofort auf dem Board. Ihr entscheidet, welches Team ihr annehmt.“
- Formular `gap 22px`:
  - Grid 2 Spalten: „Datum“ (date), „Uhrzeit“ (time)
  - Select „Format“: „Bo1 · eine Map“, „Bo2 · zwei Maps“, „Bo3 · bis zu drei Maps“
  - Input „Maps“ (optional), Placeholder „z. B. Ascent, Bind – leer lassen für freie Wahl“
  - „Rangbereich“: Grid `1fr auto 1fr` – Select von – „bis“ – Select bis. Ränge: Eisen, Bronze, Silber, Gold, Platin, Diamant, Aufgestiegen, Unsterblich, Radiant
  - Select „Server“: Frankfurt, Paris, London, Stockholm, Madrid, Warschau
  - Textarea „Notiz“ (optional), Placeholder „Was sollten andere Teams wissen?“
  - Primary Block „Anfrage veröffentlichen“ + Ghost „Abbrechen“
- Submit → „Meine Scrims“, Tab „Anfragen“, Toast „Anfrage ist jetzt auf dem Board“.
- Validierung (im Prototyp nicht gezeigt): Datum/Uhrzeit Pflicht und in der Zukunft; „Rang bis“ ≥ „Rang von“; nur Teams mit ≥ 5 Spielern.

### 8. Meine Scrims
- H1 „Meine Scrims“.
- Feedback-Hinweis (wenn offen), klickbare Zeile `bg --accent-soft`, 1px Akzent: message-Icon + „**Wie war's gegen Heidelberg Herons?** Kurzes Feedback geben“ + Chevron → Feedback.
- Tabs (shadcn Tabs, Segment-Look): Container `bg --card`, 1px Border, padding 4, gap 4, horizontal scrollbar auf Mobile. Trigger 40 px, font-display 600 14 px; aktiv `bg --secondary` + foreground, inaktiv muted; Anzahl in font-label 11 px faint. Tabs: **Anstehend · Anfragen · Bewerbungen · Vergangen**.
- **Anstehend**: Karte je bestätigtem Scrim: Badge „● Bestätigt“ (grün) + rechts „Mi 29.10. · 19:00“ (font-label 13 px); überlappende Avatare (eigenes MAV in Akzent + Gegner, -8 px Overlap, 3px Ring in Kartenfarbe) + „gegen Kraken Aachen“ (H2) + „RWTH Aachen · Bo3 · Gold – Platin · Frankfurt“. Discord-Box (`bg --secondary`, padding 14): „Lobby auf Discord klären“ / „Ansprechpartner: `jonas.kra` · Kapitän von Kraken Aachen“ + Secondary „Auf Discord schreiben ↗“ (Deep-Link auf den Discord-User).
- **Anfragen** (eigene): Karte: „Sa 08.11. · 16:00“ (H2) + „Bo3 · Gold – Platin · Frankfurt“; Badge „Offen“ (Akzent) bzw. „Vergeben“ (grün). Label „Bewerbungen (2)“. Je Bewerbung Box `bg --secondary`: Avatar 40 + Team/Hochschule, optional Nachricht in Anführungszeichen (muted), Grid 2 Spalten: Primary „Annehmen“ / Secondary „Ablehnen“. Nach Entscheidung rechts „Angenommen“ (grün) bzw. „Abgelehnt“ (faint). **Annehmen eines Teams lehnt alle anderen automatisch ab** *(bestätigen)*, Toast „{Team} angenommen – beide Teams bekommen eine Discord-Nachricht.“, Scrim erscheint unter „Anstehend“. Ohne Bewerbungen: „Noch keine Bewerbungen. Du bekommst eine Discord-Nachricht, sobald sich ein Team bewirbt.“ Link-Button „Anfrage zurückziehen“ (muted, unterstrichen, Hover Akzent).
- **Bewerbungen**: klickbare Zeilen-Karten: Avatar + Team + „Do 30.10. · 20:30 · Bo1“; Badge „● Ausstehend“ (warning) oder „Abgelehnt“ (neutral). Klick → Detail.
- **Vergangen**: Zeilen-Karten: Avatar + „gegen Heidelberg Herons“ + „Di 21.10. · 19:00 · Bo1“; rechts Primary „Feedback geben“ oder „✓ Feedback gegeben“ (grün, 13 px).
- **Leere Tabs** (gestrichelter Empty-State, H2 + Text + Secondary):
  - Anstehend: „Noch keine bestätigten Scrims“ / „Bewirb dich auf dem Board oder erstelle eine eigene Anfrage.“ / „Zum Board“
  - Anfragen: „Keine offenen Anfragen“ / „Erstelle eine Anfrage, damit sich andere Uni-Teams bei euch bewerben können.“ / „Anfrage erstellen“
  - Bewerbungen: „Noch keine Bewerbungen“ / „Auf dem Board findest du offene Anfragen anderer Teams.“ / „Zum Board“
  - Vergangen: „Noch keine gespielten Scrims“ / „Nach jedem Match kannst du hier kurz Feedback geben.“ / „Zum Board“

### 9. Feedback nach Match
- Zurück „Meine Scrims“; Eyebrow „Feedback · Di 21.10. · Bo1“; H1 „Wie war das Scrim gegen Heidelberg Herons?“; „Drei kurze Fragen, dauert 30 Sekunden.“
- 3 Fragen (16 px 600, Nummer „01“ font-label 12 px accent-text davor), Antworten als Toggle-Buttons im Grid gleich breiter Spalten, 52 px hoch, font-display 600 15 px. Unausgewählt: `bg --card`, 1px `--border`, muted. Ausgewählt: `bg --accent-soft`, 1px `--primary`, foreground. Hover Border muted. (shadcn: ToggleGroup type="single".)
  - „Waren sie pünktlich?“ – Ja / Nein
  - „War das Team fair und respektvoll?“ – Ja / Nein
  - „Würdet ihr wieder gegen sie spielen?“ – Ja / Vielleicht / Nein
- Textarea „Kommentar“ (optional · 0/280), Placeholder „Was lief gut, was nicht?“
- Primary Block „Feedback senden“ – disabled bis alle 3 beantwortet. → „Meine Scrims“ Tab „Vergangen“, Toast „Danke für dein Feedback!“

### 10. Konto
- H1 „Konto“.
- Karte „Discord“ (Eyebrow): Avatar 48 „LE“ + `lena.exe` (font-label 600) / „Angemeldet über Discord“. Darunter:
  - DMs blockiert: Warn-Box „Discord-Nachrichten kommen nicht an“ (warning 600) / „Öffne in Discord die Privatsphäre-Einstellungen des Uni-Scrims-Servers und erlaube „Direktnachrichten von Servermitgliedern“.“ + Secondary „Erneut prüfen“ (schickt Test-DM; Erfolg → Toast „Test-Nachricht zugestellt“, Banner verschwindet).
  - DMs ok: „✓ Discord-Nachrichten kommen an“ (grün 14 px).
- Karte „Studierendenstatus“: Zeilen Status („Verifiziert bis 31.03.2027“ grün / „In Prüfung“ warning / „Nicht verifiziert“ warning / „Abgelehnt“ accent-text), Hochschule, Team („Mannheim Mavericks · Kapitänin“ / „Kein Team“).
- H2 „Konto löschen“ + „Löscht dein Konto, deine Bewerbungen und deine Verifizierung. Das lässt sich nicht rückgängig machen.“ + Outline-Button in Akzent „Konto löschen“ (→ shadcn AlertDialog zur Bestätigung) + Secondary „Abmelden“.

## Interactions & Behavior
- Kein Animations-Overhead: Hover-Farbwechsel ohne/mit 150 ms Transition; Toast 3,5 s; „Kopiert“ 2 s.
- Seitenwechsel scrollt nach oben. Mobile-Menü schließt bei Navigation.
- Breakpoint: < 640 px = Mobile-Header, 20px-Padding, volle Button-Breiten, Detail-Grid 2-spaltig; ≥ 640 px = Desktop-Nav, 32 px, Grid 3-spaltig.
- Aktiver Nav-Punkt: Board auch auf Detail/Erstellen; Meine Scrims auch auf Feedback.
- Zugriffsregeln (Vorschlag): ohne Verifizierung → nur Verifizierung/Konto; ohne Team (≥ 5) → kein Erstellen/Bewerben.
- Focus: sichtbarer Ring in `--ring` (2px, offset 2px) auf allen interaktiven Elementen.

## State Management
- `user` (Discord-ID, Name, Avatar), `dmDeliverable: boolean`, `bannerDismissed` (Session)
- `verification: { status: 'none'|'pending'|'approved'|'rejected', university, submittedAt, validUntil, rejectReason }`
- `team: { name, tag, university, inviteCode, members[{ discordName, isCaptain }] } | null`
- `scrimRequests[{ id, team, dateTime, format, maps?, rankFrom, rankTo, server, note?, applicationsCount, status: 'open'|'filled' }]`
- `applications[{ id, requestId, team, message?, status: 'pending'|'accepted'|'rejected' }]`
- `matches[{ id, opponent, dateTime, format, contactDiscordName, feedbackGiven }]`
- `feedback: { punctual: bool, fair: bool, again: 'yes'|'maybe'|'no', comment? }`
- Discord-DMs werden ausgelöst bei: neuer Bewerbung, Zusage/Absage, Verifizierungsergebnis.

## Design Tokens
Vollständig in `tokens.css` (shadcn-Variablennamen + Zusatzvariablen, drei Richtungen per `[data-dir]`). Akzent ist Elektro-Rot/Koralle:
- A: bg `#0B0C0E`, card `#131519`, secondary `#1B1E23`, input `#0F1114`, border `#262A31`, border-strong `#383D46`, text `#F4F5F7`, muted `#A3A9B4`, faint `#6E7480`, primary `#FF5A4F` (hover `#FF766D`, on-primary `#1C0705`), accent-text `#FF8279`
- B: bg `#07080A`, card `#0D0F12`, secondary `#151920`, border `#232930`, text `#EDEFF2`, primary `#FF4B4B`
- C: bg `#0E0E11`, card `#19191E`, secondary `#24242A`, text `#FFFFFF`, primary `#FF5436`
- Status (alle): success `#3DD68C` (soft 12 %), warning `#F5B84B` (soft 10 %, line 32 %)
- **Text auf Akzent ist immer dunkel** (`--primary-foreground`), nicht weiß – Kontrast ≥ 4.5:1.
- Typo-Skala: H1 32/30/44 px, H2 20/19/26 px, Hero 42/40/64 px, Body 15/15/16 px, Label 12/11/13 px (A/B/C).
- Radius: A 12/8 px, B 0 (clip-path), C 4 px. Pills: A 999 px.
- Schatten: nur Mobile-Menü `0 24px 48px rgba(0,0,0,.6)`.

## Assets
Keine Bilder. Fonts via Google Fonts (Geist, Geist Mono, Chakra Petch, IBM Plex Sans, JetBrains Mono, Barlow, Barlow Condensed – nur die der gewählten Richtung laden, z. B. über `next/font/google`). Icons: lucide-react. Team-„Logos“ sind Kürzel-Avatare.

## Files
- `Uni Scrims.html` – Prototyp offline (Referenz zum Durchklicken)
- `Uni Scrims.dc.html` + `support.js` – Quelle mit exakten Inline-Styles und Beispieldaten (Logik-Klasse am Dateiende)
- `tokens.css` – Tokens für `globals.css`
