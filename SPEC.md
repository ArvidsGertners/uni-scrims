# Uni Scrims – MVP-Spec

> Arbeitstitel. Scrim-Plattform exklusiv für Valorant-Teams deutscher Hochschulen.
> Form: Web-App + Discord-Bot mit gemeinsamer Datenbank, gehostet auf eigenem VPS mit Docker. Nicht-kommerziell.
> Umfang: in 3–4 Wochen Vollzeit per Claude Code baubar, neben dem Studium realistisch 6–8 Wochen.
> Technische Umsetzung: siehe `ARCHITECTURE.md`.

---

## 1. Problem

Uni-Valorant-Teams (v. a. im Umfeld der Uniliga) suchen Scrims über große, allgemeine Discord-Server und LFG-Channels. Dort sind sie mit externen Teams gemischt, das Rang-Niveau ist unklar, No-Shows sind häufig und es gibt keine Verbindlichkeit. Captains verlieren pro Woche viel Zeit mit Koordination, und Uni-Teams finden sich untereinander kaum, obwohl sie ähnliche Zeitfenster (Abende, Semesterrhythmus) und ähnliche Ziele haben.

**Ohne Lösung:** weniger Scrims, schlechtere Vorbereitung auf Uniliga-Spieltage, Frust bei Captains.

---

## 2. Ziele

1. **Uni-exklusiv:** Nur Studierende mit geprüfter Immatrikulationsbescheinigung können Teams bilden und scrimmen.
2. **Schnell zum Scrim:** Ein Captain kann in unter 2 Minuten eine Anfrage posten oder sich auf eine bewerben.
3. **Verbindlichkeit:** No-Shows werden sichtbar, damit die Show-up-Rate über 90 % liegt.
4. **Wenig Reibung:** Bewerbungen, Bestätigungen und Reminder kommen automatisch über Discord, wo die Teams eh sind.

---

## 3. Non-Goals (bewusst nicht im MVP)

| Nicht drin | Warum |
|---|---|
| Andere Games (LoL, CS, RL …) | Erst ein Game richtig machen. Datenmodell aber game-agnostisch anlegen (siehe P2). |
| Teams außerhalb Deutschlands | Eine Zeitzone, eine Sprache, ein Semesterrhythmus. |
| Verifizierung per Uni-Mail | Domain-Listen pflegen ist zu aufwendig. Es gibt nur den Upload-Weg. |
| E-Mail-Versand jeglicher Art | Alle Benachrichtigungen laufen über Discord. Kein Mail-Dienst nötig. |
| Rang-Verifizierung über die Riot-API | Braucht Riot-Freigabe (RSO). Ränge werden selbst angegeben. |
| Automatisches Matchmaking | Ein Board mit Filtern reicht bei wenigen Dutzend Teams. |
| Interaktive Bot-Buttons (Feedback in Discord) | Feedback läuft über die Web-App, Discord verlinkt nur dorthin. Spart viel Bot-Logik und funktioniert auch bei blockierten DMs. |
| Benachrichtigung über neue Anfragen | Bei wenigen Teams reicht das Board. Später möglich (P1). |
| Turniere, Ligen, Ranglisten | Das macht die Uniliga. Kein Konkurrenzprodukt. |
| Match-Stats, VOD-Upload, Ergebnistracking | Kein Kernproblem und viel Aufwand. |
| Chat zwischen Teams | Discord existiert. Wir zeigen nur den Discord-Namen des Captains an. |
| Einzelspieler-Börse (LFT/LFP) | Anderer Use Case, später möglich. |
| Monetarisierung | Nicht geplant. |
| Mobile App | Web-App responsive bauen reicht. |

---

## 4. Personas

- **Captain:** Organisiert Scrims für sein Team. Hauptnutzer.
- **Spieler:** Mitglied im Team, muss sich verifizieren.
- **Admin:** Du bzw. ein kleines Team. Prüft Immatrikulationsbescheinigungen, klärt Streitfälle, sperrt Teams.

---

## 5. User Stories

### Captain
1. Als Captain will ich mich mit Discord anmelden, damit ich kein extra Passwort brauche.
2. Als Captain will ich ein Team anlegen und Mitspieler per Einladungslink hinzufügen, damit unser Roster auf der Plattform steht. Die Spieler dürfen von verschiedenen Hochschulen sein.
3. Als Captain will ich den Team-Rang anpassen können, damit er im Laufe des Semesters aktuell bleibt.
4. Als Captain will ich eine Scrim-Anfrage mit Datum, Uhrzeit, Format und gewünschtem Rang-Bereich posten, damit passende Teams sie finden.
5. Als Captain will ich offene Anfragen nach Datum und Rang filtern, damit ich schnell einen passenden Gegner sehe.
6. Als Captain will ich mich mit einem Klick auf eine Anfrage bewerben, damit der Ersteller uns als Gegner auswählen kann.
7. Als Ersteller einer Anfrage will ich alle Bewerbungen mit Rang und Zuverlässigkeit sehen und eine davon bestätigen, damit ich meinen Gegner selbst aussuche.
8. Als Captain will ich nach der Bestätigung den Discord-Namen des gegnerischen Captains sehen, damit wir die Lobby absprechen können.
9. Als Captain will ich vor dem Scrim automatisch erinnert werden, damit wir nicht vergessen anzutreten.
10. Als Captain will ich einen gebuchten Scrim absagen können, damit der Gegner rechtzeitig Bescheid weiß.
11. Als Captain will ich die Zuverlässigkeit eines Teams (Scrims gespielt, No-Shows, kurzfristige Absagen) sehen.
12. Als Captain will ich nach dem Scrim über einen Link aus Discord kurz angeben, ob er stattgefunden hat, und ihn bewerten, damit unzuverlässige Teams auffallen.
13. Als Captain will ich unseren Discord-Server mit dem Team verknüpfen, damit Bestätigungen und Reminder auch in unserem Team-Channel landen.

### Spieler
14. Als Spieler will ich meine Immatrikulationsbescheinigung hochladen und meine Hochschule angeben, damit ich verifiziert werde und spielen darf.
15. Als Spieler will ich den Status meiner Prüfung sehen und per Discord-DM erfahren, wenn sie entschieden ist.
16. Als Spieler will ich ein Team verlassen können.
17. Als Spieler will ich mein Konto samt Daten löschen können.

### Admin
18. Als Admin will ich hochgeladene Immatrikulationsbescheinigungen in einer Queue anhand einer festen Checkliste prüfen und freigeben oder ablehnen, damit nur echte Studierende teilnehmen.
19. Als Admin will ich gemeldete Streitfälle (z. B. strittige No-Shows) sehen und entscheiden.
20. Als Admin will ich Teams oder Nutzer sperren können.
21. Als Admin will ich sehen, welche Benachrichtigungen dauerhaft nicht zugestellt werden konnten.

### Edge Cases
- Ein Team hat weniger als 5 verifizierte Spieler: Es kann nicht posten, sich bewerben oder Bewerbungen bestätigen. Das Team sieht, wer noch fehlt bzw. in Prüfung ist. Bereits gebuchte Scrims bleiben bestehen.
- Ein Spieler ist noch in Prüfung: Er ist schon im Team, zählt aber nicht als verifiziert.
- Der Ersteller bestätigt eine Bewerbung: Alle anderen Bewerbungen werden automatisch abgelehnt, und die Teams bekommen Bescheid.
- Zwei Bestätigungen gleichzeitig (Doppelklick, zwei Tabs): Es zählt nur die erste.
- Das Bewerber-Team ist zum Zeitpunkt der Bestätigung nicht mehr spielbereit oder gesperrt: Bestätigung schlägt mit klarer Meldung fehl, die Bewerbung bleibt offen.
- Bis zur Startzeit wurde keine Bewerbung bestätigt: Die Anfrage verfällt, alle Bewerber bekommen Bescheid.
- Ein Team bewirbt sich auf die eigene Anfrage: wird verhindert.
- Ein Team bewirbt sich außerhalb des Rang-Bereichs: erlaubt, mit Hinweis. Der Ersteller entscheidet.
- Ein Team hat seine Bewerbung zurückgezogen: Es kann sich auf dieselbe Anfrage nicht erneut bewerben.
- Der Captain verlässt das Team: nur nach Übertragung der Captain-Rolle. Ist er das einzige Mitglied, wird das Team beim Verlassen aufgelöst.
- Ein Team wird gesperrt oder aufgelöst: Seine offenen Anfragen werden gelöscht, seine offenen Bewerbungen zurückgezogen und seine künftigen Scrims abgesagt. Das Gegnerteam bekommt Bescheid, und die Absage zählt für niemanden als kurzfristig.
- Ein Spieler wird gesperrt: Er wird aus seinem Team entfernt. Ein gesperrter Captain bleibt im Team, das Team wird mitgesperrt. Die übrigen Mitglieder können das gesperrte Team verlassen und ein neues gründen oder einem anderen beitreten.
- Der Captain ist selbst noch nicht verifiziert: Er kann das Team verwalten und einladen, aber keine Scrim-Aktionen ausführen.
- Der Bot ist nicht auf dem Team-Server: Benachrichtigungen gehen dann nur per DM an den Captain.
- DMs kommen nicht an (Hub-Server-Beitritt gescheitert, DMs blockiert): dauerhafter Hinweis auf der Website, bis eine DM wieder zugestellt wurde.

---

## 6. Kernflows

### Flow A: Onboarding
1. Vor dem Login: Pflicht-Checkbox "Ich bin mindestens 16 Jahre alt und habe die Datenschutzerklärung gelesen". Dann Login mit Discord. Der Nutzer wird dabei automatisch dem offiziellen Uni-Scrims-Discord-Server hinzugefügt (nötig, damit der Bot DMs schicken kann). Das wird vor dem Login erklärt.
2. Verifizierung: Hochschule aus einer Liste wählen (oder "Andere" mit Freitext), Immatrikulationsbescheinigung als PDF/JPG/PNG hochladen. Vorher Pflicht-Checkbox mit Kurzinfo: was gespeichert wird, wozu und wann es gelöscht wird. Der Status steht dann auf "in Prüfung".
3. Ein Admin prüft anhand der Checkliste (siehe 7, P0-2) und gibt frei oder lehnt ab (mit Grund). Bei "Andere" ordnet er die Hochschule nach Möglichkeit einem Eintrag der Liste zu. Der Nutzer bekommt eine Discord-DM. **Die Datei wird nach der Entscheidung gelöscht.** Gespeichert bleiben nur Status, Hochschule, Dateityp, Dateigröße, Ablehnungsgrund, Zeitpunkte und wer geprüft hat.
4. Prüfungen, die nach 14 Tagen noch offen sind, werden automatisch abgelehnt und die Datei gelöscht. Der Nutzer kann neu hochladen.
5. Team anlegen (Name, Kürzel, Team-Rang) oder einem Team per Einladungslink beitreten. Das geht auch schon, während die Prüfung läuft.
6. Optional: Bot auf den Team-Server einladen und mit `/setup` verknüpfen.

### Flow B: Scrim posten, bewerben, bestätigen
1. Captain A erstellt eine Anfrage: Datum, Startzeit, Format, Rang-Bereich, optional Maps und Notiz.
2. Die Anfrage erscheint auf dem Board.
3. Captain B klickt "Bewerben" (optional mit kurzer Nachricht). Captain A bekommt eine Bot-DM mit Link-Button "Ansehen".
4. Captain A sieht alle Bewerbungen mit Rang, Hochschulen und Zuverlässigkeit und klickt bei einer auf "Bestätigen".
5. Der Scrim ist gebucht. Beide Captains bekommen eine Bestätigung (DM + Team-Channel) mit Zeit, Format und dem gegnerischen Captain. Die übrigen Bewerber erhalten eine Absage.
6. Bewerber können ihre Bewerbung zurückziehen, solange sie nicht bestätigt ist. Danach ist keine erneute Bewerbung auf dieselbe Anfrage möglich.

### Flow C: Vor und nach dem Scrim
1. **Reminder:** 24 h und 1 h vor Start an beide Captains bzw. Team-Channels. Ein Reminder, dessen Zeitpunkt bei der Buchung schon vorbei ist, entfällt.
2. **Absage:** möglich bis zum Start. Unter 24 h vor Start zählt sie als "kurzfristige Absage". Absagen mit mehr als 24 h Vorlauf zählen nirgends.
3. **Feedback:** Ab Startzeit kann jeder Captain auf der Scrim-Seite der Web-App Feedback geben. 3 h nach Start bekommen beide Captains eine Discord-Nachricht mit Link zur Scrim-Seite.
   - Ergebnis: "Hat stattgefunden" / "Gegner nicht erschienen" / "Wir konnten nicht"
   - Bei "Hat stattgefunden" zusätzlich eine Bewertung des Gegners mit 1–5 Sternen
   - Pro Team genau eine Antwort, danach nicht mehr änderbar
4. **Auswertung:** sobald beide Teams geantwortet haben, spätestens an der **Feedback-Frist** (72 h nach dem Feedback-Hinweis, also Start + 75 h). Vorher bleibt der Scrim offen.

| Team A | Team B | Ergebnis |
|---|---|---|
| Hat stattgefunden | Hat stattgefunden | Gespielt |
| Hat stattgefunden | keine Antwort bis Frist | Gespielt |
| Hat stattgefunden | Gegner nicht erschienen | Streitfall |
| Hat stattgefunden | Wir konnten nicht | Streitfall |
| Gegner nicht erschienen | keine Antwort bis Frist | No-Show von B |
| Gegner nicht erschienen | Wir konnten nicht | No-Show von B |
| Gegner nicht erschienen | Gegner nicht erschienen | Streitfall |
| Wir konnten nicht | keine Antwort bis Frist | No-Show von A |
| Wir konnten nicht | Wir konnten nicht | Unbestätigt (keiner wird bestraft) |
| keine Antwort | keine Antwort bis Frist | Unbestätigt |

Die Tabelle gilt symmetrisch (A und B vertauschbar). Antworten nach der Auswertung werden abgelehnt.

5. **Streitfall:** Der Admin entscheidet "Gespielt", "No-Show von Team X" oder "Unklar" (= Unbestätigt). Solange er nicht entschieden hat, zeigt die Scrim-Seite beiden Teams "Streitfall, der Admin entscheidet". Eine eigene Benachrichtigung gibt es dafür nicht.

---

## 7. Anforderungen

### P0: Must-Have

**P0-1 Discord-Login und Zugriff**
- [ ] Vor dem Login Pflicht-Checkbox "mindestens 16 Jahre, Datenschutzerklärung gelesen"
- [ ] Login und Logout über Discord
- [ ] Außer Landing, Impressum und Datenschutz ist alles nur für eingeloggte, nicht gesperrte Nutzer sichtbar (Board, Anfragen, Team-Karten). Wer was genau sehen und tun darf, regelt die Berechtigungstabelle in ARCHITECTURE §7.
- [ ] Beim ersten Login wird ein Nutzer mit Discord-ID, Username und Avatar angelegt; Username und Avatar werden bei jedem Login aktualisiert
- [ ] Bei jedem Login wird der Beitritt zum Uni-Scrims-Server versucht; scheitert er, sieht der Nutzer einen dauerhaften Hinweis mit Einladungslink

**P0-2 Verifizierung per Immatrikulationsbescheinigung**
- [ ] Hochschul-Auswahl aus einer Seed-Liste (mindestens alle großen Universitäten, alle DHBW-Standorte und alle Hochschulen mit bekannten Uniliga-Valorant-Teams; nur Name und Ort) plus "Andere" mit Freitext
- [ ] Pflicht-Checkbox mit Kurzinfo zum Datenschutz (was, wozu, wann gelöscht)
- [ ] Upload als PDF/JPG/PNG, max. 5 MB; HEIC wird mit Hinweis "Foto bitte als JPG/PNG" abgelehnt
- [ ] Dateien sind nie öffentlich erreichbar; nur Admins können sie ansehen
- [ ] Freigeben oder Ablehnen mit Grund; beim Ablehnen ist ein erneuter Upload möglich
- [ ] Nach der Entscheidung wird die Datei sofort physisch gelöscht
- [ ] Offene Prüfungen werden nach 14 Tagen automatisch abgelehnt, die Datei wird gelöscht
- [ ] Der Nutzer bekommt eine Discord-DM mit dem Ergebnis
- [ ] Max. 1 offene Prüfung pro Nutzer; bereits verifizierte Nutzer können nicht erneut hochladen
- [ ] **Prüf-Checkliste für Admins** (in der Queue angezeigt): Bescheinigung gilt für das aktuelle Semester; Hochschule stimmt mit der Auswahl überein; Dokument vollständig und lesbar; keine offensichtliche Bearbeitung
- [ ] Bewusst akzeptiertes Restrisiko: Ob die Bescheinigung wirklich dem Uploader gehört, ist nicht prüfbar. Missbrauch wird über Sperren behandelt.

**P0-3 Teams**
- [ ] Team anlegen: Name (eindeutig, Groß-/Kleinschreibung egal), Kürzel (2–5 Zeichen, nicht eindeutig), Team-Rang (Iron bis Radiant)
- [ ] Captain kann Name, Kürzel und Team-Rang ändern
- [ ] Mitglieder dürfen von verschiedenen Hochschulen sein; die Team-Karte zeigt die vertretenen Hochschulen (max. 3, danach "+n")
- [ ] Einladungslink, den der Captain erneuern kann
- [ ] Max. 10 Mitglieder pro Team; ein Nutzer ist in max. 1 Team
- [ ] Genau ein Captain pro Team; Captain-Rolle übertragen; Mitglieder entfernen
- [ ] Spieler können das Team verlassen; Captain nur nach Übertragung, als einziges Mitglied löst er das Team damit auf
- [ ] Ein Team ist **spielbereit** ab 5 verifizierten Mitgliedern. Geprüft wird nur beim Posten, Bewerben und Bestätigen.
- [ ] **Scrim-Aktionen** (Anfragen, Bewerbungen, Bestätigen, Absagen, Feedback) setzen voraus, dass der Captain **selbst verifiziert** ist. Team verwalten und einladen geht auch ohne (siehe Berechtigungstabelle in ARCHITECTURE §7).
- [ ] Aufgelöste Teams verschwinden überall, ihr Einladungslink funktioniert nicht mehr und ihr Name ist wieder frei. Der ehemalige Captain kann ein neues Team gründen.

**P0-4 Scrim-Anfragen und Board**
- [ ] Felder: Datum, Startzeit (Europe/Berlin, 15-Minuten-Raster, 10:00–01:45 Uhr, mindestens 30 Minuten in der Zukunft; das Datum ist immer das Kalenderdatum des tatsächlichen Starts, die UI zeigt bei Startzeiten nach Mitternacht "(Nacht auf Mi, 22.10.)"), Format (`1 Map`, `2 Maps`, `BO3`), Rang-Bereich min–max, Maps (optional, Mehrfachauswahl aus festem Map-Pool), Notiz (max. 300 Zeichen)
- [ ] Nur spielbereite Teams können posten; max. 5 offene Anfragen pro Team
- [ ] Board zeigt offene, zukünftige Anfragen; Filter nach Datum und Rang; Standardfilter: Anfragen, deren Rang-Bereich den eigenen Team-Rang enthält
- [ ] Jede Karte zeigt Team, Hochschulen, Rang, Zuverlässigkeit und die Anzahl der Bewerbungen
- [ ] Ersteller kann eine offene Anfrage löschen; offene Bewerbungen werden abgelehnt und die Bewerber bekommen Bescheid
- [ ] Anfragen ohne bestätigte Bewerbung verfallen zur Startzeit; Bewerber bekommen Bescheid

**P0-5 Bewerbungen und Bestätigung**
- [ ] Spielbereite Teams können sich bewerben, optional mit Nachricht (max. 200 Zeichen); nicht auf eigene Anfragen; max. 1 Bewerbung pro Team und Anfrage, auch nach Zurückziehen
- [ ] Bewerbung außerhalb des Rang-Bereichs ist erlaubt, mit Hinweis beim Bewerben und beim Ersteller
- [ ] Ersteller sieht alle Bewerbungen mit Rang, Hochschulen und Zuverlässigkeit
- [ ] Bestätigen prüft, dass beide Teams spielbereit und aktiv sind (nicht gesperrt, nicht aufgelöst); genau eine Bewerbung wird angenommen, alle anderen automatisch abgelehnt
- [ ] Bewerber können zurückziehen, solange nicht bestätigt
- [ ] Bot-DM an den Ersteller bei jeder neuen Bewerbung; Bot-DM an Bewerber bei Bestätigung oder Absage

**P0-6 Gebuchte Scrims**
- [ ] Übersicht "Meine Scrims" (anstehend und vergangen)
- [ ] Nach der Buchung ist der gegnerische Captain sichtbar (Discord-Name, in Bot-Nachrichten als Erwähnung)
- [ ] Absage durch beide Seiten bis zum Start; unter 24 h vor Start wird sie als kurzfristig markiert

**P0-7 Discord-Bot: Benachrichtigungen**
- [ ] `/setup` auf dem Team-Server verknüpft Server und Channel mit dem Team (nur Captain)
- [ ] Bestätigung bei Buchung und Absage: DM an die Captains und Post im Team-Channel, falls verknüpft
- [ ] Reminder 24 h und 1 h vor Start
- [ ] Feedback-Hinweis 3 h nach Start mit Link zur Scrim-Seite
- [ ] Nachrichten gehen immer an den **aktuellen** Captain, auch wenn die Rolle nach der Buchung übertragen wurde
- [ ] Alle Buttons in Bot-Nachrichten sind Links in die Web-App; der Bot hat außer `/setup` keine eigenen Interaktionen
- [ ] Nutzertext wie Teamnamen wird in Bot-Nachrichten entschärft (kein Markdown, keine versteckten Links); Anfrage-Notizen und Bewerbungsnachrichten stehen nur auf der Website
- [ ] Nicht zustellbare Nachrichten werden mehrfach mit wachsendem Abstand erneut versucht; veraltete Reminder werden verworfen

**P0-8 Feedback und No-Shows**
- [ ] Feedback-Formular auf der Scrim-Seite, ab Startzeit bis zur Auswertung, nur für den aktuellen Captain
- [ ] Bewertung 1–5 nur bei "Hat stattgefunden"; kein Freitext-Kommentar
- [ ] Auswertung genau nach der Tabelle in Flow C
- [ ] Zuverlässigkeit pro Team: gespielte Scrims, No-Shows, kurzfristige Absagen, Durchschnittsbewertung (erst ab 3 Bewertungen anzeigen). Absagen mit mehr als 24 h Vorlauf und abgesagte Scrims wegen Sperre zählen nicht.

**P0-9 Admin-Bereich**
- [ ] Queue für Immatrikulationsbescheinigungen, älteste zuerst, mit Vorschau der Datei und der Prüf-Checkliste
- [ ] Streitfälle mit Entscheidung "Gespielt", "No-Show von Team X" oder "Unklar"
- [ ] Nutzer bzw. Team sperren (mit den Folgen aus den Edge Cases). Wird ein Captain gesperrt, wird sein Team mitgesperrt. **Entsperren ist im MVP nur manuell per Datenbank** (im README beschrieben).
- [ ] Liste dauerhaft fehlgeschlagener Benachrichtigungen (nur lesen)
- [ ] Anzeige, ob der Bot läuft
- [ ] Admin-Rolle wird per Konfiguration (Liste von Discord-IDs) vergeben

**P0-10 Rechtliches und Datenschutz**
- [ ] Seiten für Impressum und Datenschutzerklärung; Inhalt wird aus einer Config-Datei geladen
- [ ] Konto löschen löscht alle personenbezogenen Daten; vergangene Scrims bleiben anonymisiert für die Team-Statistik. Auch gesperrte Nutzer können ihr Konto löschen; bei ihnen bleibt nur die Discord-ID mit der Sperre gespeichert, damit die Sperre nicht durch Löschen und Neuanmeldung umgangen werden kann. Meldet sich ein gesperrter Nutzer nach der Löschung erneut an, werden Discord-Name, Avatar und Session wie bei jedem Login wieder gespeichert (bewusst akzeptiert); er kann das Konto danach erneut löschen. Als Captain nur nach Übertragung der Rolle oder als einziges Mitglied (dann wird das Team aufgelöst). Ein gesperrtes Team kann die Rolle nicht übertragen; löscht sein Captain das Konto, wird das Team aufgelöst.
- [ ] Nur nötige Daten speichern: keine Matrikelnummer, kein Geburtsdatum, keine Kopie der Bescheinigung nach der Prüfung, keine Discord-Zugriffstokens über den Login hinaus
- [ ] Server-Logs werden begrenzt aufbewahrt (Rotation)

### P1: Nice-to-Have, direkt nach dem MVP
- **Benachrichtigung über neue passende Anfragen** im Team-Channel (Opt-in).
- **Verifizierung pro Semester:** läuft zum Semesterende ab (31.03. bzw. 30.09.), danach neue Bescheinigung nötig.
- **Bot-Commands zum Posten und Suchen:** `/scrim posten`, `/scrims` direkt in Discord.
- **Feedback-Kommentar** als Freitext, mit Admin-Ansicht.
- **Uniliga-Division** als optionales Team-Feld und als Filter.
- **Wiederkehrende Anfragen**, z. B. "jeden Dienstag 20 Uhr".
- **Ersatzspieler** und Coach als eigene Rollen.
- **Statistik-Seite** im Admin-Bereich für die Erfolgskriterien.
- **Weitere Admins/Prüfer** über die Oberfläche hinzufügen statt per Konfiguration.
- **Datenauskunft (Art. 15 DSGVO) per Knopfdruck** statt manuell.

### P2: Später, aber jetzt schon mitdenken
- **Weitere Games:** `game` als Feld an Team und Anfrage, auch wenn es vorerst nur `valorant` gibt.
- **Riot-Anbindung (RSO):** Rang automatisch prüfen; dafür eine Riot-Account-Verknüpfung am Nutzer vorsehen.
- **Automatische Vorschläge bzw. Matchmaking** auf Basis von Verfügbarkeit und Rang.
- **Kooperation mit der Uniliga:** z. B. Uniliga-Team-ID verknüpfen.

---

## 8. Erfolgskriterien

Gemessen ab Launch. Bei einem Markt von wenigen hundert Valorant-Uni-Teams sind die Ziele bewusst bodenständig.

**Frühindikatoren (erste 4 Wochen)**

| Metrik | Definition | Ziel | Stretch |
|---|---|---|---|
| Spielbereite Teams | Teams mit ≥ 5 verifizierten Mitgliedern | 15 | 30 |
| Prüfzeit | Median von Upload bis Entscheidung | < 24 h | < 6 h |
| Bestätigungsquote | bestätigte Anfragen ÷ (bestätigte + verfallene) | ≥ 50 % | ≥ 70 % |
| Zeit bis Bestätigung | Median von Anfrage erstellt bis Scrim gebucht | < 24 h | < 6 h |
| Show-up-Rate | Gespielt ÷ (Gespielt + No-Show) | ≥ 90 % | ≥ 95 % |
| Feedback-Antwortrate | Scrims mit ≥ 1 Antwort ÷ ausgewertete Scrims | ≥ 60 % | ≥ 80 % |

**Spätindikatoren (nach 2–3 Monaten)**

| Metrik | Ziel |
|---|---|
| Teams mit ≥ 2 Scrims pro Monat | ≥ 50 % der spielbereiten Teams |
| No-Show-Rate | < 10 % |
| Durchschnittsbewertung | ≥ 4,0 |

---

## 9. Entscheidungen und offene Punkte

**Entschieden**

| Thema | Entscheidung |
|---|---|
| Verifizierung | Nur Upload der Immatrikulationsbescheinigung mit manueller Prüfung. Keine Uni-Mails, keine Domain-Listen. |
| Gemischte Teams | Erlaubt. Spieler verschiedener Hochschulen dürfen in einem Team sein. |
| Buchung | Bewerben + Bestätigung durch den Ersteller. |
| Uploads | Löschen direkt nach der Prüfung, spätestens nach 14 Tagen. |
| Mail-Dienst | Keiner. Alles läuft über Discord. |
| Hosting | Eigener VPS mit Docker. |
| Betreiber | Privatperson, nicht-kommerziell. |
| Feedback | Nur über die Web-App. Discord verlinkt dorthin. |
| Feedback-Frist | Eine Frist: 72 h nach dem Feedback-Hinweis. |
| Beide "Wir konnten nicht" | Unbestätigt, keiner wird bestraft. |
| Bewerbung außerhalb des Rang-Bereichs | Erlaubt, mit Hinweis. |
| Neue-Anfragen-Benachrichtigung | Nach P1 verschoben. Dafür ist der editierbare Team-Rang im MVP. |
| Auth | Better Auth (siehe ARCHITECTURE). |
| Sichtbarkeit | Board und Anfragen nur für eingeloggte Nutzer. |
| Captain-Rechte | Scrim-Aktionen nur, wenn der Captain selbst verifiziert ist. Teamverwaltung geht auch ohne. |
| Entsperren | Nur manuell per Datenbank, kein Admin-Button. |
| Altersbestätigung | 16+ per Checkbox vor dem Discord-Login. |
| Discord-ID | Wird nicht doppelt am Nutzer gespeichert, sondern aus der Discord-Verknüpfung von Better Auth gelesen. |
| Kontolöschung bei Sperre | Gesperrte Nutzer dürfen ihr Konto löschen. Ihre Discord-ID bleibt danach gespeichert, damit die Sperre bei einem neuen Login weiter gilt. |

**Bewusst akzeptierte Risiken**

| Entscheidung | Risiko |
|---|---|
| Nur Upload-Verifizierung | Echtheit bzw. Zugehörigkeit der Bescheinigung ist nicht prüfbar. Der Prüfaufwand liegt anfangs bei einer Person (15 Teams ≈ 75+ Prüfungen). |
| Löschen nach Prüfung | Bei späterem Verdacht gibt es nichts mehr nachzuprüfen. |
| Nur Discord als Kanal | Blockierte DMs sind ein stiller Ausfall. Fallback: Team-Channel und Hinweis auf der Website. |
| Eigener VPS | Du betreibst ein System, das kurzzeitig ausweisähnliche Dokumente hält: Updates, Zugangsschutz und Vorfallreaktion liegen bei dir. |
| Altersbestätigung nur per Checkbox | Wer den Login-Endpunkt direkt aufruft, umgeht sie, und es wird kein Nachweis gespeichert. Im MVP bewusst akzeptiert. |

**Vor dem Launch geklärt** (Texte liegen außerhalb von Git in `LEGAL_DIR`, siehe ARCHITECTURE §8)

| # | Frage | Ergebnis |
|---|---|---|
| 1 | Impressum nach § 5 DDG: Nicht-kommerziell befreit nicht sicher von der Pflicht. Eigene Adresse oder Impressums-Service? | Impressum mit der eigenen Anschrift des Betreibers und E-Mail. |
| 2 | Datenschutzerklärung: Upload sensibler Dokumente, Rechtsgrundlage, Löschfristen, Discord (USA) als Empfänger durch Server-Beitritt und DMs, Hoster, Logs, IP-Adresse und User-Agent in der Session, Benachrichtigungen (30 Tage), Mindestalter 16, kein automatischer Kick nach Kontolöschung, Discord-ID gesperrter Nutzer nach Löschung, Backups (14 Tage) mit gelöschten Konten. | Geschrieben, deckt alle genannten Punkte ab. Hoster: IONOS (Rechenzentrum Berlin); Backups: Hetzner Storage Box (Falkenstein); nginx-Logs 14 Tage. |
| 3 | AVV mit dem VPS-Hoster; Snapshots/Backups des Hosters aus oder in der Datenschutzerklärung nennen. | AVV mit IONOS und Hetzner abgeschlossen; bei IONOS sind keine Snapshots oder Backups aktiv. |
| 4 | Ablauf für Datenauskunft (Art. 15). | Formlos per E-Mail an die Adresse aus dem Impressum; Antwort innerhalb eines Monats, im MVP manuell per DB-Abfrage. |

**Noch offen**

| # | Frage | Wann klären |
|---|---|---|
| 5 | Wer prüft außer dir? Bei Wachstum braucht es weitere Prüfer. | Nach den ersten 2 Wochen |

---

## 10. Zeitplan

Die Phasen sind in `ARCHITECTURE.md` Abschnitt 11 im Detail beschrieben. **3–4 Wochen gelten bei Vollzeit. Neben dem Studium realistisch 6–8 Wochen.**

| Phase | Inhalt | Fertig, wenn … |
|---|---|---|
| 0 | Gerüst, Discord-Application und Hub-Server einrichten, Docker-Build | Web und Bot starten lokal, Tests laufen, Docker-Image baut |
| 1 | Login mit Server-Beitritt, Upload-Verifizierung inkl. Admin-Queue, Teams und Einladungen | Du kannst dich einloggen, hochladen, als Admin freigeben und ein Team mit Einladungslink anlegen |
| 2 | Scrim-Anfragen, Board, Bewerben, Bestätigen, "Meine Scrims", Absagen, Feedback-Formular | Zwei Test-Teams buchen, sagen ab und geben Feedback; die Auswertung stimmt |
| 3 | Discord-Bot: `/setup`, alle Benachrichtigungen, Reminder, Sweeper | Der komplette Flow läuft mit echten Discord-Nachrichten durch (mit verkürzten Zeiten) |
| 4 | Admin-Bereich komplett, Datenschutz-Funktionen, Deployment | Production läuft mit HTTPS; zwei echte Discord-Accounts buchen und bewerten einen Scrim |

Danach: Test mit deinem DHBW-Team und 2–3 befreundeten Teams, noch in diesem Wintersemester.

**Scope-Regel:** Neue Features kommen nur ins MVP, wenn dafür etwas anderes rausfliegt. Ideen kommen in den Parkplatz (P1/P2).
