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
| Teams außerhalb Deutschlands | Eine Zeitzone, ein Semesterrhythmus. (Die Oberfläche gibt es seit Phase 22 auch auf Englisch, für internationale Studierende deutscher Hochschulen, N-18.) |
| Verifizierung per Uni-Mail | Domain-Listen pflegen ist zu aufwendig. Es gibt nur den Upload-Weg. |
| Benachrichtigungen per E-Mail | Alle Benachrichtigungen laufen über Discord. Mails gibt es seit Phase 7 nur für das Konto selbst (Bestätigung, Passwort, E-Mail-Wechsel; N-3). Seit Phase 18 kann jeder Benachrichtigungen zusätzlich oder statt Discord per Mail einschalten (N-14). |
| Rang-Verifizierung über die Riot-API | Braucht Riot-Freigabe (RSO). Ränge werden selbst angegeben. |
| Automatisches Matchmaking | Ein Board mit Filtern reicht bei wenigen Dutzend Teams. |
| Interaktive Bot-Buttons (Feedback in Discord) | Feedback läuft über die Web-App, Discord verlinkt nur dorthin. Spart viel Bot-Logik und funktioniert auch bei blockierten DMs. |
| Benachrichtigung über neue Anfragen | Bei wenigen Teams reicht das Board. Später möglich (P1). |
| Turniere, Ligen, Ranglisten | Das macht die Uniliga. Kein Konkurrenzprodukt. |
| Match-Stats, VOD-Upload, Ergebnistracking | Kein Kernproblem und viel Aufwand. |
| Chat zwischen Teams | Discord existiert. Wir zeigen nur den Discord-Namen des Captains an (seit Phase 19 auf Wunsch auch einen Link zum Discord-Server des Teams, N-15). |
| Einzelspieler-Börse (LFT/LFP) | Anderer Use Case, später möglich. |
| Monetarisierung | Nicht geplant. |
| Mobile App | Web-App responsive bauen reicht. |

---

## 4. Personas

- **Captain:** Organisiert Scrims für sein Team. Hauptnutzer.
- **Spieler:** Mitglied im Team, muss sich verifizieren.
- **Admin:** Du bzw. ein kleines Team. Prüft Immatrikulationsbescheinigungen, klärt Streitfälle, sperrt Teams. Seit Phase 8 drei Rollen: Betreiber (du), Admins und Prüfer, die nur Bescheinigungen prüfen (N-4).

---

## 5. User Stories

### Captain
1. Als Captain will ich mich mit Discord anmelden, damit ich kein extra Passwort brauche.
2. Als Captain will ich ein Team anlegen und Mitspieler per Einladungslink hinzufügen, damit unser Roster auf der Plattform steht. Die Spieler dürfen von verschiedenen Hochschulen sein.
3. Als Captain will ich den Team-Rang anpassen können, damit er im Laufe des Semesters aktuell bleibt. (Seit Phase 20 ergibt er sich aus den Rängen der Spieler, Story 37.)
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

### Nach dem MVP
22. Als Captain will ich jedem Mitglied die Rolle Spieler, Ersatzspieler oder Coach geben, damit unser Kader stimmt und nur Spieler zur Spielbereitschaft zählen.
23. Als Spieler will ich ein Konto mit E-Mail, Passwort und meinem Namen anlegen und danach Discord verknüpfen, damit der Prüfer meine Bescheinigung meinem Namen zuordnen kann.
24. Als Spieler will ich mein Passwort per E-Mail zurücksetzen können, wenn ich es vergessen habe.
25. Als Prüfer will ich den Namen der Person neben ihrer Bescheinigung sehen, damit ich prüfen kann, ob beide übereinstimmen.
26. Als Nutzer will ich alle Daten, die Uni Scrims zu meinem Konto speichert, selbst herunterladen können, ohne erst eine Mail zu schreiben.
27. Als Captain will ich ein Logo für unser Team hochladen, damit andere Teams uns auf dem Board und in ihren Scrims sofort erkennen.
28. Als Nutzer will ich die Seite hell sehen, wenn mein Gerät hell eingestellt ist, und als Captain dafür ein eigenes Logo für hellen Hintergrund hochladen.
29. Als Spieler will ich mein Discord-Profilbild und das meiner Teamkollegen sehen, ohne dass mein Browser dafür Daten an Discord schickt.
30. Als Spieler will ich ein kurzes Menü, in dem Board und meine Scrims auf einer Seite liegen, und als Admin den Admin-Bereich unter einer eigenen Adresse, getrennt von der Spieler-Navigation.
31. Als Admin will ich auf einen Blick sehen, was zu tun ist (offene Prüfungen, Streitfälle, Fehler, Bot), und als Captain den Stand meines Teams auf einen Blick.
32. Als Spieler will ich die Seite wie ein Dashboard bedienen: alle Bereiche in einer Seitenleiste, Team und Konto unten, Unterseiten als Tabs.
33. Als Spieler will ich auf einem großen Bildschirm die ganze Breite nutzen: die Leiste ganz links, die Inhalte daneben über den restlichen Platz.
34. Als Spieler will ich über mein Konto in der Leiste schnell zu Einstellungen, Support und Abmelden kommen, meine Profil-ID nachsehen und hell oder dunkel unabhängig von meinem Gerät wählen.
35. Als Spieler will ich selbst bestimmen, welche Benachrichtigungen ich per Discord oder per Mail bekomme, und als Mitglied auch Buchungen und Erinnerungen zu unseren Scrims bekommen, nicht nur der Captain.
36. Als Captain will ich auf der Team-Seite die Teamdaten und unsere Mitglieder getrennt sehen und Links zu unserem Discord-Server, unserer Website und unseren Kanälen angeben, damit andere Teams uns dort finden.
37. Als Spieler will ich meinen Rang selbst angeben, und als Team will ich, dass sich unser Team-Rang daraus ergibt, damit er stimmt, ohne dass der Captain ihn pflegen muss.
38. Als Spieler, der in mehreren Teams spielt oder mehrere Teams betreut, will ich in mehreren Teams sein und in der Leiste zwischen ihnen wechseln, und mehr Teams beantragen können, wenn fünf nicht reichen.
39. Als Studierender, der kein Deutsch spricht, will ich die ganze Seite oben rechts auf Englisch umstellen, und mit englischem Browser will ich sie gleich auf Englisch sehen.
40. Als Spieler mit englischer Sprachwahl will ich auch die Mails und Discord-Nachrichten von Uni Scrims auf Englisch bekommen, und als Captain will ich `/setup` auf Englisch bedienen können.

### Edge Cases
- Ein Team hat weniger als 5 verifizierte Spieler (Rolle Spieler oder Ersatzspieler; Coaches zählen nicht): Es kann nicht posten, sich bewerben oder Bewerbungen bestätigen. Das Team sieht, wer noch fehlt bzw. in Prüfung ist. Bereits gebuchte Scrims bleiben bestehen.
- Ein Spieler ist noch in Prüfung: Er ist schon im Team, zählt aber nicht als verifiziert.
- Der Ersteller bestätigt eine Bewerbung: Alle anderen Bewerbungen werden automatisch abgelehnt, und die Teams bekommen Bescheid.
- Zwei Bestätigungen gleichzeitig (Doppelklick, zwei Tabs): Es zählt nur die erste.
- Das Bewerber-Team ist zum Zeitpunkt der Bestätigung nicht mehr spielbereit oder gesperrt: Bestätigung schlägt mit klarer Meldung fehl, die Bewerbung bleibt offen.
- Bis zur Startzeit wurde keine Bewerbung bestätigt: Die Anfrage verfällt, alle Bewerber bekommen Bescheid.
- Ein Team bewirbt sich auf die eigene Anfrage: wird verhindert.
- Ein Team bewirbt sich außerhalb des Rang-Bereichs: erlaubt, mit Hinweis. Der Ersteller entscheidet.
- Ein Team hat seine Bewerbung zurückgezogen: Es kann sich auf dieselbe Anfrage nicht erneut bewerben.
- Der Captain verlässt das Team: nur nach Übertragung der Captain-Rolle. Ist er das einzige Mitglied, wird das Team beim Verlassen aufgelöst.
- Ein Team wird gesperrt oder aufgelöst: Seine offenen Anfragen werden gelöscht, seine offenen Bewerbungen zurückgezogen und seine künftigen Scrims abgesagt. Das Gegnerteam bekommt Bescheid, und die Absage zählt für niemanden als kurzfristig. Anfragen, deren Startzeit schon vorbei ist, verfallen wie sonst auch.
- Ein Spieler wird gesperrt: Er wird aus seinem Team entfernt. Ein gesperrter Captain bleibt im Team, das Team wird mitgesperrt (seit Phase 21 für jedes seiner Teams: aus Teams, in denen er nicht Captain ist, wird er entfernt, Teams, in denen er Captain ist, werden mitgesperrt, N-17). Die übrigen Mitglieder können das gesperrte Team verlassen und ein neues gründen oder einem anderen beitreten. Eine offene Prüfung seiner Bescheinigung wird ohne Nachricht abgelehnt und die Datei gelöscht.
- Der Captain ist selbst noch nicht verifiziert: Er kann das Team verwalten und einladen, aber keine Scrim-Aktionen ausführen.
- Der Bot ist nicht auf dem Team-Server: Benachrichtigungen gehen dann nur per DM an den Captain.
- DMs kommen nicht an (Hub-Server-Beitritt gescheitert, DMs blockiert): dauerhafter Hinweis auf der Website, bis eine DM wieder zugestellt wurde. Seit Phase 18 verschwindet der Hinweis zu blockierten DMs auch, wenn man Discord für alle Benachrichtigungen abschaltet (N-14).

---

## 6. Kernflows

### Flow A: Onboarding
1. Vor dem Login: Pflicht-Checkbox "Ich bin mindestens 16 Jahre alt und habe die Datenschutzerklärung gelesen". Dann Login mit Discord. Der Nutzer wird dabei automatisch dem offiziellen Uni-Scrims-Discord-Server hinzugefügt (nötig, damit der Bot DMs schicken kann). Das wird vor dem Login erklärt.
   **Seit Phase 7 (N-3):** Registrierung mit Vorname, Nachname, E-Mail und Passwort (mit derselben Pflicht-Checkbox), Bestätigungslink per Mail, danach Discord verknüpfen; dabei tritt der Nutzer dem Hub-Server bei. Erst dann geht es mit Schritt 2 weiter.
2. Verifizierung: Hochschule aus einer Liste wählen (oder "Andere" mit Freitext), Immatrikulationsbescheinigung als PDF/JPG/PNG hochladen. Vorher Pflicht-Checkbox mit Kurzinfo: was gespeichert wird, wozu und wann es gelöscht wird. Der Status steht dann auf "in Prüfung".
3. Ein Admin prüft anhand der Checkliste (siehe 7, P0-2) und gibt frei oder lehnt ab (mit Grund). Bei "Andere" ordnet er die Hochschule nach Möglichkeit einem Eintrag der Liste zu. Der Nutzer bekommt eine Discord-DM. **Die Datei wird nach der Entscheidung gelöscht.** Gespeichert bleiben nur Status, Hochschule, Dateityp, Dateigröße, Ablehnungsgrund, Zeitpunkte und wer geprüft hat.
4. Prüfungen, die nach 14 Tagen noch offen sind, werden automatisch abgelehnt und die Datei gelöscht. Der Nutzer kann neu hochladen.
5. Team anlegen (Name, Kürzel, Team-Rang; seit Phase 20 ohne Rang, N-16) oder einem Team per Einladungslink beitreten. Das geht auch schon, während die Prüfung läuft.
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

**P0-1 Discord-Login und Zugriff** (seit Phase 7 ergänzt durch N-3: Konto mit E-Mail und Passwort, Discord wird verknüpft)
- [x] Vor dem Login Pflicht-Checkbox "mindestens 16 Jahre, Datenschutzerklärung gelesen"
- [x] Login und Logout über Discord
- [x] Außer Landing, Impressum und Datenschutz ist alles nur für eingeloggte, nicht gesperrte Nutzer sichtbar (Board, Anfragen, Team-Karten). Wer was genau sehen und tun darf, regelt die Berechtigungstabelle in ARCHITECTURE §7.
- [x] Beim ersten Login wird ein Nutzer mit Discord-ID, Username und Avatar angelegt; Username und Avatar werden bei jedem Login aktualisiert (seit Phase 7 legt nur die Registrierung Konten an; Discord-Name und Avatar kommen beim Verknüpfen und bei jeder Anmeldung über Discord, N-3)
- [x] Bei jedem Login wird der Beitritt zum Uni-Scrims-Server versucht; scheitert er, sieht der Nutzer einen dauerhaften Hinweis, der auf den Einladungslink auf der Konto-Seite verweist

**P0-2 Verifizierung per Immatrikulationsbescheinigung**
- [x] Hochschul-Auswahl aus einer Seed-Liste (mindestens alle großen Universitäten, alle DHBW-Standorte und alle Hochschulen mit bekannten Uniliga-Valorant-Teams; nur Name und Ort) plus "Andere" mit Freitext
- [x] Pflicht-Checkbox mit Kurzinfo zum Datenschutz (was, wozu, wann gelöscht)
- [x] Upload als PDF/JPG/PNG, max. 5 MB; HEIC wird mit Hinweis "Foto bitte als JPG/PNG" abgelehnt
- [x] Dateien sind nie öffentlich erreichbar; nur Admins können sie ansehen (seit Phase 8 auch Prüfer, N-4)
- [x] Freigeben oder Ablehnen mit Grund; beim Ablehnen ist ein erneuter Upload möglich
- [x] Nach der Entscheidung wird die Datei sofort physisch gelöscht
- [x] Offene Prüfungen werden nach 14 Tagen automatisch abgelehnt, die Datei wird gelöscht
- [x] Der Nutzer bekommt eine Discord-DM mit dem Ergebnis (seit Phase 18 je nach Einstellung per DM und/oder Mail, N-14)
- [x] Max. 1 offene Prüfung pro Nutzer; bereits verifizierte Nutzer können nicht erneut hochladen
- [x] **Prüf-Checkliste für Admins** (in der Queue angezeigt): Bescheinigung gilt für das aktuelle Semester; Hochschule stimmt mit der Auswahl überein; Dokument vollständig und lesbar; keine offensichtliche Bearbeitung; seit Phase 7 außerdem: Name auf der Bescheinigung stimmt mit dem Namen des Kontos überein (N-3)
- [x] Bewusst akzeptiertes Restrisiko: Ob die Bescheinigung wirklich dem Uploader gehört, ist nicht prüfbar. Seit Phase 7 vergleicht der Prüfer den Namen, aber wer eine fremde Bescheinigung hochlädt, kann auch deren Namen angeben. Missbrauch wird über Sperren behandelt.

**P0-3 Teams**
- [x] Team anlegen: Name (eindeutig, Groß-/Kleinschreibung egal), Kürzel (2–5 Zeichen, nicht eindeutig), Team-Rang (Iron bis Radiant, englische Rangnamen wie im Spiel üblich; seit Phase 20 berechnet aus den Rängen der Spieler statt gewählt, N-16)
- [x] Captain kann Name, Kürzel und Team-Rang ändern (den Rang bis Phase 20, N-16); seit Phase 10 auch ein Logo hochladen (N-6), seit Phase 19 auch Links zu Discord-Server, Website und Social Media angeben (N-15)
- [x] Mitglieder dürfen von verschiedenen Hochschulen sein; die Team-Karte zeigt die vertretenen Hochschulen (max. 3, danach "+n")
- [x] Einladungslink, den der Captain erneuern kann; ohne Team lässt sich ein Einladungslink auch einfügen, das öffnet seine Beitrittsseite
- [x] Max. 10 Mitglieder pro Team; ein Nutzer ist in max. 1 Team (seit Phase 21 in bis zu 5 Teams, mehr auf Antrag, N-17)
- [x] Genau ein Captain pro Team; Captain-Rolle übertragen; Mitglieder entfernen
- [x] Mitglieder können das Team verlassen; Captain nur nach Übertragung, als einziges Mitglied löst er das Team damit auf
- [x] Ein Team ist **spielbereit** ab 5 verifizierten Spielern (Rolle Spieler oder Ersatzspieler, siehe „Nach dem MVP“; Coaches zählen nicht). Geprüft wird nur beim Posten, Bewerben und Bestätigen.
- [x] **Scrim-Aktionen** (Anfragen, Bewerbungen, Bestätigen, Absagen, Feedback) setzen voraus, dass der Captain **selbst verifiziert** ist. Team verwalten und einladen geht auch ohne (siehe Berechtigungstabelle in ARCHITECTURE §7).
- [x] Aufgelöste Teams verschwinden überall, ihr Einladungslink funktioniert nicht mehr und ihr Name ist wieder frei. Der ehemalige Captain kann ein neues Team gründen.

**P0-4 Scrim-Anfragen und Board**
- [x] Felder: Datum, Startzeit (Europe/Berlin, 15-Minuten-Raster, 10:00–01:45 Uhr, mindestens 30 Minuten in der Zukunft; das Datum ist immer das Kalenderdatum des tatsächlichen Starts, die UI zeigt bei Startzeiten nach Mitternacht "(Nacht auf Mi, 22.10.)"), Format (`1 Map`, `2 Maps`, `BO3`), Rang-Bereich min–max, Maps (optional, Mehrfachauswahl aus festem Map-Pool), Notiz (max. 300 Zeichen)
- [x] Nur spielbereite Teams können posten; max. 5 offene Anfragen pro Team
- [x] Board zeigt offene, zukünftige Anfragen; Filter nach Datum und Rang; Standardfilter: Anfragen, deren Rang-Bereich den eigenen Team-Rang enthält (seit Phase 20 ohne Team-Rang kein Standardfilter, N-16). Im Rang-Filter sind mehrere Ränge wählbar: Es erscheinen Anfragen, deren Rang-Bereich einen davon enthält; ohne Auswahl alle Ränge
- [x] Jede Karte zeigt Team, Hochschulen, Rang, Zuverlässigkeit und die Anzahl der Bewerbungen
- [x] Ersteller kann eine offene Anfrage löschen; offene Bewerbungen werden abgelehnt und die Bewerber bekommen Bescheid
- [x] Anfragen ohne bestätigte Bewerbung verfallen zur Startzeit; Bewerber bekommen Bescheid

**P0-5 Bewerbungen und Bestätigung**
- [x] Spielbereite Teams können sich bewerben, optional mit Nachricht (max. 200 Zeichen); nicht auf eigene Anfragen; max. 1 Bewerbung pro Team und Anfrage, auch nach Zurückziehen
- [x] Bewerbung außerhalb des Rang-Bereichs ist erlaubt, mit Hinweis beim Bewerben und beim Ersteller (seit Phase 20 nur, wenn das Team einen Rang hat, N-16)
- [x] Ersteller sieht alle Bewerbungen mit Rang, Hochschulen und Zuverlässigkeit
- [x] Bestätigen prüft, dass beide Teams spielbereit und aktiv sind (nicht gesperrt, nicht aufgelöst); genau eine Bewerbung wird angenommen, alle anderen automatisch abgelehnt
- [x] Bewerber können zurückziehen, solange nicht bestätigt
- [x] Bot-DM an den Ersteller bei jeder neuen Bewerbung; Bot-DM an Bewerber bei Bestätigung oder Absage (seit Phase 18 je nach Einstellung des Captains per DM und/oder Mail, N-14)

**P0-6 Gebuchte Scrims**
- [x] Übersicht "Meine Scrims" (anstehend und vergangen, dazu die eigenen offenen Anfragen und Bewerbungen als Listen; die Aktionen bleiben auf Anfrage- und Scrim-Seite); seit Phase 13 Tabs der Seite „Scrims“ neben dem Board (N-9)
- [x] Nach der Buchung ist der gegnerische Captain sichtbar (Discord-Name, in Bot-Nachrichten als Erwähnung)
- [x] Absage durch beide Seiten bis zum Start; unter 24 h vor Start wird sie als kurzfristig markiert

**P0-7 Discord-Bot: Benachrichtigungen**
- [x] `/setup` auf dem Team-Server verknüpft Server und Channel mit dem Team (nur Captain)
- [x] Bestätigung bei Buchung und Absage: DM an die Captains und Post im Team-Channel, falls verknüpft (seit Phase 18 nach den Einstellungen auch an Mitglieder und per Mail, N-14)
- [x] Reminder 24 h und 1 h vor Start
- [x] Feedback-Hinweis 3 h nach Start mit Link zur Scrim-Seite
- [x] Nachrichten gehen immer an den **aktuellen** Captain, auch wenn die Rolle nach der Buchung übertragen wurde
- [x] Alle Buttons in Bot-Nachrichten sind Links in die Web-App; der Bot hat außer `/setup` keine eigenen Interaktionen
- [x] Nutzertext wie Teamnamen wird in Bot-Nachrichten entschärft (kein Markdown, keine versteckten Links); Anfrage-Notizen und Bewerbungsnachrichten stehen nur auf der Website
- [x] Nicht zustellbare Nachrichten werden mehrfach mit wachsendem Abstand erneut versucht; veraltete Reminder werden verworfen

**P0-8 Feedback und No-Shows**
- [x] Feedback-Formular auf der Scrim-Seite, ab Startzeit bis zur Auswertung, nur für den aktuellen Captain
- [x] Bewertung 1–5 nur bei "Hat stattgefunden"; kein Freitext-Kommentar
- [x] Auswertung genau nach der Tabelle in Flow C
- [x] Zuverlässigkeit pro Team: gespielte Scrims, No-Shows, kurzfristige Absagen, Durchschnittsbewertung (erst ab 3 Bewertungen anzeigen). Absagen mit mehr als 24 h Vorlauf und abgesagte Scrims wegen Sperre zählen nicht.

**P0-9 Admin-Bereich**
- [x] Queue für Immatrikulationsbescheinigungen, älteste zuerst, mit Vorschau der Datei und der Prüf-Checkliste
- [x] Streitfälle mit Entscheidung "Gespielt", "No-Show von Team X" oder "Unklar"
- [x] Nutzer bzw. Team sperren (mit den Folgen aus den Edge Cases). Wird ein Captain gesperrt, wird sein Team mitgesperrt. **Entsperren ist im MVP nur manuell per Datenbank** (im README beschrieben).
- [x] Liste dauerhaft fehlgeschlagener Benachrichtigungen (nur lesen)
- [x] Anzeige, ob der Bot läuft (ob seine beiden Schleifen arbeiten; Zustellfehler zeigt die Liste)
- [x] Admin-Rolle wird per Konfiguration (Liste von Discord-IDs) vergeben (seit Phase 8 über die Oberfläche, N-4)

**P0-10 Rechtliches und Datenschutz**
- [x] Seiten für Impressum und Datenschutzerklärung; Inhalt wird aus einer Config-Datei geladen
- [x] Konto löschen löscht alle personenbezogenen Daten; vergangene Scrims bleiben anonymisiert für die Team-Statistik. Die Notizen der Anfragen, die der Nutzer selbst erstellt hat, werden geleert; Bewerbungsnachrichten gehören zum Team und bleiben. Auch gesperrte Nutzer können ihr Konto löschen; bei ihnen bleibt nur die Discord-ID mit der Sperre gespeichert (an einem eigenen Platzhalter, ohne Verbindung zu den Daten des gelöschten Kontos), damit die Sperre nicht durch Löschen und Neuanmeldung umgangen werden kann. Bis Phase 6 wurden bei einer erneuten Anmeldung nach der Löschung Discord-Name, Avatar und Session an diesem Platzhalter gespeichert; seit Phase 7 speichert eine Anmeldung über Discord dort nichts mehr, und der Platzhalter bleibt abgemeldet (N-3). Als Captain nur nach Übertragung der Rolle oder als einziges Mitglied (dann wird das Team aufgelöst). Ein gesperrtes Team kann die Rolle nicht übertragen; löscht sein Captain das Konto, wird das Team aufgelöst.
- [x] Nur nötige Daten speichern: keine Matrikelnummer, kein Geburtsdatum, keine Kopie der Bescheinigung nach der Prüfung, keine Discord-Zugriffstokens über den Login hinaus. Seit Phase 7 zusätzlich E-Mail-Adresse, Passwort (nur als Hash) und Vor- und Nachname (N-3); seit Phase 10 ein optionales Team-Logo, nur als vom Server neu erzeugtes Bild ohne Metadaten (N-6); seit Phase 19 optionale Links des Teams, die der Captain angibt (N-15); seit Phase 20 der selbst angegebene Rang (N-16)
- [x] Server-Logs werden begrenzt aufbewahrt (Rotation)

### Nach dem MVP umgesetzt

Punkte aus P1, die nach dem MVP gebaut werden, mit ihren Anforderungen (Phasen ab 5, ARCHITECTURE §11).

**N-1 Ersatzspieler und Coach** (Phase 5)
- [x] Jedes Mitglied hat eine Rolle: Spieler, Ersatzspieler oder Coach. Wer beitritt oder ein Team gründet, ist Spieler.
- [x] Der Captain setzt die Rolle jedes Mitglieds, auch seine eigene. Verifizierung ist dafür nicht nötig (Teamverwaltung); in einem gesperrten Team geht es nicht.
- [x] Spielbereit machen nur verifizierte Spieler und Ersatzspieler; Coaches zählen nie, auch wenn sie verifiziert sind. Coaches brauchen keine Verifizierung.
- [x] Keine Grenzen pro Rolle; es bleibt bei max. 10 Mitgliedern insgesamt.
- [x] Die Captain-Rolle ist davon unabhängig: Auch ein Coach kann Captain sein und braucht für Scrim-Aktionen weiterhin selbst eine Verifizierung.
- [x] Die Team-Seite zeigt die Rollen; ein Rollenwechsel ändert nichts an schon gebuchten Scrims.

**N-2 Statistik-Seite** (Phase 6)
- [x] Seite „Statistik“ im Admin-Bereich, nur für Admins
- [x] Zeigt alle Kennzahlen aus §8 nach deren Definitionen, jeweils mit Ziel und Stretch, und markiert, ob sie erreicht sind
- [x] Zwei Zeiträume: die letzten 28 Tage und gesamt. „Spielbereite Teams“ und „Teams mit ≥ 2 Scrims pro Monat“ sind Momentaufnahmen und stehen nur einmal da.
- [x] In einen Zeitraum fällt eine Prüfung mit ihrer Entscheidung, eine Anfrage mit ihrer Startzeit, die Zeit bis Bestätigung mit der Buchung und alle Scrim-Kennzahlen mit dem Start des Scrims
- [x] Jede Kennzahl mit ihrer Fallzahl; ohne Fälle steht „–“ statt einer Zahl. Ausnahme „Spielbereite Teams“: eine Anzahl, die auch ohne aktive Teams 0 ist.
- [x] Werte werden auf die angezeigte Genauigkeit abgerundet (0,1 h, 0,1 %, 0,1 Sterne), damit eine Zahl nie über einem Ziel zu liegen scheint, das als verfehlt markiert ist, oder umgekehrt
- [x] Nur Summen, keine Namen oder anderen personenbezogenen Daten. Die Seite sagt, dass Prüfungen gelöschter Konten fehlen (sie werden mit dem Konto gelöscht).

**N-3 Konto mit E-Mail, Passwort und Klarname** (Phase 7)

*Registrierung und Anmeldung*
- [x] Registrierung mit Vorname, Nachname (je 1–50 Zeichen), E-Mail und Passwort (10–128 Zeichen, sonst keine Regeln) und der Pflicht-Checkbox „mindestens 16 Jahre, Datenschutzerklärung gelesen“
- [x] Bestätigungslink per Mail, 24 Stunden gültig; anmelden kann man sich erst danach, ein neuer Link lässt sich anfordern. Ob eine Adresse schon registriert ist, verrät die Seite nicht.
- [x] Anmeldung mit E-Mail und Passwort; „Mit Discord anmelden“ geht nur für Konten, die Discord schon verknüpft haben. Ein Discord-Konto ohne Uni-Scrims-Konto legt kein Konto an, die Seite verweist auf die Registrierung.
- [x] Passwort vergessen: Link per Mail, 1 Stunde gültig; danach sind alle Sitzungen beendet. Die Antwort verrät nicht, ob es die Adresse gibt.
- [x] Auf der Konto-Seite: Passwort ändern (mit dem alten Passwort; beendet die anderen Sitzungen) und E-Mail ändern (Bestätigungslink an die neue Adresse; bis dahin gilt die alte)
- [x] Anmelden, Registrieren und das Anfordern von Mails sind pro IP-Adresse begrenzt

*Discord verknüpfen*
- [x] Nach der ersten Anmeldung ist Discord verknüpfen Pflicht, bevor man hochladen, ein Team gründen oder beitreten kann. Die Seite erklärt wie bisher vor dem Discord-Login, dass man dabei dem Hub-Server beitritt.
- [x] Beim Verknüpfen und bei jedem Discord-Login gilt alles aus P0-1: Hub-Beitritt, Discord-Name und Avatar werden übernommen, die Discord-Tokens danach gelöscht. Die E-Mail des Kontos bleibt dabei unverändert.
- [x] Eine Discord-ID, die schon zu einem anderen Konto gehört oder gesperrt ist, lässt sich nicht verknüpfen. Die Sperre bleibt an der Discord-ID.
- [x] Der Anzeigename auf der Seite (Header, Team, gegnerischer Captain) bleibt der Discord-Name; bis Discord verknüpft ist, heißt das Konto „Neues Konto“, nie mit dem Klarnamen
- [x] Auf der Konto-Seite lässt sich dasselbe Discord-Konto erneut verbinden, z. B. wenn der Hub-Beitritt gescheitert ist; ein anderes Discord-Konto geht nicht

*Klarname*
- [x] Vor- und Nachname sehen nur die Person selbst (Konto-Seite) und Prüfer bzw. Admins in der Prüf-Queue, nie Teams oder Gegner
- [x] Die Prüf-Queue zeigt den Namen neben der Bescheinigung; die Checkliste hat den Punkt „Name stimmt überein“
- [x] Ändern kann man den Namen auf der Konto-Seite, solange man nicht verifiziert ist und keine Prüfung offen ist; danach nur per Mail an die Adresse aus dem Impressum

*Bestehende Konten*
- [x] Wer sich vor Phase 7 nur mit Discord angemeldet hat, wird beim nächsten Discord-Login durch „Konto vervollständigen“ geführt: Vorname, Nachname, E-Mail, Passwort, dann der Bestätigungslink. Bis dahin gehen nur diese Seite und die Konto-Seite (Löschen, Abmelden; seit Phase 17 Abmelden über das Konto-Menü, N-13). Ist die angegebene Adresse schon vergeben, sagt die Seite das (nur hier, für angemeldete Altkonten).
- [x] Ein Captain mit Altkonto kann die Captain-Rolle auf der Konto-Seite übertragen, damit er sein Konto löschen kann, ohne es vorher zu vervollständigen
- [x] Team und Rolle bleiben erhalten. Die Verifizierung von Altkonten wird beim Deploy von Phase 7 zurückgesetzt, weil ihr Name nie abgeglichen wurde: Sie laden die Bescheinigung nach dem Vervollständigen neu hoch. Offene Prüfungen von Altkonten werden mit dem Grund „Bitte vervollständige dein Konto und lade die Bescheinigung erneut hoch.“ abgelehnt (mit DM). Teams können dadurch vorübergehend nicht spielbereit sein; gebuchte Scrims bleiben bestehen.

*Mails, Löschen, Sperren*
- [x] Mails nur für das Konto (Bestätigung, Passwort zurücksetzen, E-Mail ändern), als reiner Text auf Deutsch, von `noreply@uniscrims.com` (seit Phase 18 auch Benachrichtigungen, wenn man sie einschaltet, N-14; seit Phase 23 in der Sprache des Kontos, N-19)
- [x] Kontolöschung löscht zusätzlich E-Mail-Adresse, Passwort und Klarname (P0-10)
- [x] Gesperrte Nutzer können sich weiter anmelden, aber wie bisher nur ihr Konto löschen; Name, E-Mail und Passwort ändern sie nicht

**N-4 Admins und Prüfer über die Oberfläche, mit 2FA** (Phase 8)

*Rollen*
- [x] Drei Rollen: **Betreiber**, **Admin** und **Prüfer**. Prüfer sehen nur die Prüf-Queue mit Dateien und Klarnamen und entscheiden dort. Admins dürfen alles im Admin-Bereich außer Rollen vergeben: Prüf-Queue, Streitfälle, Sperren, fehlgeschlagene Nachrichten, Bot-Status, Statistik. Der Betreiber darf zusätzlich Rollen vergeben.
- [x] Den Betreiber setzt einmalig ein Skript auf dem Server; über die Oberfläche lässt er sich weder vergeben noch entziehen. Die Liste von Discord-IDs in der Konfiguration (`ADMIN_DISCORD_IDS`) entfällt.
- [x] Der Betreiber findet bestehende Konten über die E-Mail-Adresse (genau) oder den Discord-Namen und macht sie zu Admins oder Prüfern, ändert die Rolle oder entzieht sie. Ein Konto braucht dafür ein vollständiges Konto mit Passwort; gesperrte Konten bekommen keine Rolle.
- [x] Die Seite zeigt alle Admins und Prüfer mit Discord-Name, Klarname, E-Mail-Adresse, Rolle und ob 2FA eingerichtet ist
- [x] Jede Änderung einer Rolle meldet die Person überall ab, damit sie sofort gilt. Wer die Rolle verliert, verliert auch die 2FA und meldet sich danach wieder wie jeder andere an.
- [x] Admins und Prüfer lassen sich nicht sperren, solange sie die Rolle haben; der Betreiber entzieht sie vorher
- [x] Bei einer Kontolöschung verfallen Rolle und 2FA

*Anmeldung mit 2FA*
- [x] Wer eine Rolle hat, braucht für den Admin-Bereich eine eingerichtete 2FA mit einer Authenticator-App (TOTP)
- [x] Einrichten beim ersten Aufruf des Admin-Bereichs: Passwort bestätigen, QR-Code scannen (oder Schlüssel abtippen), einen Code eingeben; dazu 10 Backup-Codes, die nur einmal angezeigt werden. Danach meldet die Seite ab, und die nächste Anmeldung läuft mit Passwort und Code.
- [x] Mit Rolle meldet man sich nur mit E-Mail, Passwort und Code an, nicht mit Discord. Statt des Codes geht einmalig ein Backup-Code. Links aus Mails (etwa zur neuen E-Mail-Adresse) öffnet man angemeldet, sonst schickt die Seite zur Anmeldung.
- [x] Codes sind pro IP begrenzt (10 pro Minute, weil schon das Einrichten mehrere braucht), dazu sperrt Better Auth nach mehreren Fehlversuchen kurz
- [x] Ein verlorenes Gerät: Der Betreiber setzt die 2FA einer Person auf der Rollen-Seite zurück; die Person richtet sie beim nächsten Aufruf neu ein. Für den Betreiber selbst steht das im README.

*Betrieb*
- [x] Nach dem Einspielen eines Backups gelten die Rollen aus der alten Datenbank, damit entzogene Rechte nicht zurückkommen, und alle richten die 2FA neu ein, damit kein zurückgesetzter Schlüssel wieder gilt (README)
- [x] Keine Benachrichtigung über Rollenänderungen

**N-5 Datenauskunft per Knopfdruck** (Phase 9)
- [x] Auf der Konto-Seite lädt „Meine Daten herunterladen“ eine JSON-Datei mit allen Daten, die zum Konto gespeichert sind. Das geht auch für gesperrte und unvollständige Konten, nicht für gelöschte.
- [x] Die Datei enthält: das Konto (Discord-Name und Avatar, E-Mail-Adresse und ob sie bestätigt ist, Vor- und Nachname, Hochschule, Zeitpunkte wie Registrierung, Verifizierung und Sperre, Rolle als Admin oder Prüfer und ob 2FA eingerichtet ist), die Anmeldewege (Discord-ID, ob ein Passwort gespeichert ist, offene Links aus Mails), die Sitzungen (Zeitpunkte, IP-Adresse, Browser), alle Prüfungen (Status, Zeitpunkte, Ablehnungsgrund, Dateityp und -größe, ob von Hand oder automatisch entschieden), Team und eigene Rolle, Teams, deren letzter Captain man war, selbst erstellte Anfragen mit Notiz, selbst abgegebenes Feedback, die Discord-Nachrichten an die Person selbst und, bei Admins und Prüfern, die eigenen Entscheidungen mit Datum und Ergebnis.
- [x] Keine Daten anderer Personen: keine Namen, IDs oder Adressen anderer Nutzer, nicht wer eine Prüfung entschieden hat; bei eigenen Entscheidungen nicht, über wen. Teamnamen stehen drin.
- [x] Keine Zugangsdaten: Passwort-Hash, 2FA-Schlüssel, Backup-Codes und die Tokens von Sitzungen und Mail-Links stehen nicht drin, nur dass es sie gibt. Die Datei einer offenen Prüfung ist nicht dabei, nur ihre Angaben.
- [x] Die Datei nennt den Zeitpunkt der Auskunft und verweist für Zwecke, Empfänger, Speicherdauer und Rechte auf die Datenschutzerklärung; sie sagt auch, was fehlt (Server-Logs, Backups, Nachrichten an Teams).
- [x] Wie bisher geht die Auskunft auch formlos per Mail an die Adresse aus dem Impressum.

**N-6 Team-Logo** (Phase 10; seit Phase 11 je ein Logo für dunklen und hellen Hintergrund, N-7)
- [x] Der Captain kann auf der Team-Seite ein Logo hochladen, ersetzen und entfernen (auch ohne eigene Verifizierung, wie die übrigen Teamdaten). Nicht in einem gesperrten Team.
- [x] Erlaubt sind PNG und WebP mit Alphakanal (durchsichtiger Hintergrund möglich), höchstens 2 MB und 4096 × 4096 Pixel, nicht animiert (auch kein animiertes PNG). Andere Formate und Bilder ohne Alphakanal werden mit einem Hinweis abgelehnt. Bilder mit EXIF-Ausrichtung werden so aufrecht gedreht, wie Bildbetrachter sie zeigen. Höchstens 5 Uploads pro Minute; laufen gerade viele, kommt „Bitte versuch es gleich noch einmal“. Ob die Fläche wirklich durchsichtig ist, wird nicht geprüft.
- [x] Der Server schneidet durchsichtige Ränder ab (Pixel mit Deckkraft bis 8 von 255 zählen als durchsichtig) und setzt das Logo mittig in ein Quadrat von 256 × 256 Pixeln, vergrößert oder verkleinert. Die längere Seite füllt das Quadrat, also berührt das Logo immer mindestens zwei gegenüberliegende Ränder. Ein komplett durchsichtiges Bild und ein Inhalt, dessen längere Seite kürzer als 128 Pixel ist, werden abgelehnt.
- [x] Gespeichert wird nur das neu erzeugte Bild (WebP, verlustfrei, ohne Metadaten), nicht die hochgeladene Datei.
- [x] Das Logo erscheint überall, wo bisher das Kürzel-Quadrat steht (Board, Anfrage mit Bewerbungen, Meine Scrims, Team-Seite, Einladungsseite); ohne Logo bleibt das Kürzel. Sehen können es alle eingeloggten, nicht gesperrten Nutzer, wie Teamnamen.
- [x] Admins können ein Logo auf der Seite „Sperren“ entfernen, und zwar nur das, das sie dort gesehen haben (hat der Captain inzwischen ein neues hochgeladen, kommt ein Hinweis). Beim Auflösen eines Teams wird sein Logo gelöscht; bei einer Sperre bleibt es, bis ein Admin es entfernt.
- [x] Die Datenauskunft nennt beim Team, wann sich sein Logo zuletzt geändert hat; das Bild selbst ist Teamdaten ohne Personenbezug und steht nicht in der Datei.

**N-7 Hell-Modus und Logo pro Hintergrund** (Phase 11)
- [x] Die Seite folgt der Systemeinstellung des Geräts: hell oder dunkel. Einen Schalter auf der Seite gibt es nicht (seit Phase 17 wählbar, N-13). Das dunkle Design bleibt, wie es ist; das helle nutzt dieselben Bausteine mit hellen Farben, Text mit ausreichendem Kontrast (mindestens 4,5:1).
- [x] Der Captain kann zwei Logos hochladen, ersetzen und entfernen: eins für dunklen Hintergrund und eins für hellen Hintergrund, beide optional und mit denselben Regeln wie in N-6 (Formate, Grenzen, Zuschnitt). Ein Logo aus Phase 10 gilt als Logo für dunklen Hintergrund.
- [x] Angezeigt wird das Logo, das zum Modus passt. Gibt es nur eins, steht es im anderen Modus auf einem kleinen Kästchen in der Farbe, für die es gemacht ist, damit es lesbar bleibt. Ohne Logo bleibt das Kürzel.
- [x] Admins sehen auf der Seite „Sperren“ beide Logos und entfernen mit „Logo entfernen“ beide, nur wenn sie den aktuellen Stand gesehen haben (wie in N-6).
- [x] Die Datenauskunft nennt zusätzlich, für welche Hintergründe das Team Logos hat.

**N-8 Discord-Profilbilder** (Phase 12)
- [x] Beim Verknüpfen mit Discord und bei jeder Anmeldung über Discord lädt der Server das Profilbild einmal von Discord und speichert eine Kopie (128 × 128 Pixel, neu erzeugt, ohne Metadaten). Animierte Bilder werden als Standbild gespeichert. Discords Standardbilder speichern wir nicht; wer zu einem Standardbild wechselt, verliert die Kopie.
- [x] Die Seite zeigt nur diese Kopie: auf der Konto-Seite, in der Mitgliederliste der Team-Seite und in der Prüf-Queue. Kein Browser lädt etwas von Discord. Ohne Kopie stehen wie bisher die Initialen.
- [x] Sehen dürfen das Bild die Person selbst, Mitglieder desselben Teams sowie Prüfer, Admins und der Betreiber; alle anderen nicht.
- [x] Scheitert das Laden, bleibt die alte Kopie; Anmeldung und Verknüpfen laufen immer weiter. Ein neues Bild auf Discord erscheint erst nach dem nächsten Verknüpfen oder der nächsten Anmeldung über Discord.
- [x] Beim Deploy holt ein einmaliges Skript die Bilder der schon verknüpften Konten nach.
- [x] Kontolöschung löscht die Kopie. Die Datenauskunft enthält das Bild selbst und den Zeitpunkt der Kopie.

**N-9 Navigation und Admin-Bereich auf eigener Adresse** (Phase 13)
- [x] Das Hauptmenü hat nur noch drei Punkte: Scrims, Team, Konto. Der Warnpunkt für eine fehlende Verifizierung steht an „Konto“. Gesperrte und unvollständige Konten sehen wie bisher nur „Konto“.
- [x] „Abmelden“ steht nur noch auf der Konto-Seite (oben, neben der Überschrift), nicht mehr im Kopf oder Menü. Seit Phase 17 steht es im Konto-Menü (N-13).
- [x] Board und Meine Scrims sind eine Seite „Scrims“ mit den Tabs Board, Anstehend, Anfragen, Bewerbungen, Vergangen. Board ist der erste Tab und zeigt die Anfragen anderer Teams mit den Filtern aus P0-4; die eigenen offenen Anfragen stehen nur im Tab Anfragen. Der Feedback-Hinweis steht über den Tabs, „Anfrage erstellen“ (nur für den Captain) oben auf der Seite. Ohne Team ist das Board nutzbar; die anderen Tabs zeigen den Hinweis auf die Team-Seite. Alte Links auf das Board (auch in Discord-Nachrichten) führen auf den Tab Board, mit denselben Filtern.
- [x] Die Verifizierung gehört zu „Konto“: Die Konto-Seite zeigt den Studierendenstatus als ersten Kasten, mit einem Knopf zur Verifizierungsseite (je nach Status „Bescheinigung hochladen“, „Status ansehen“ oder „Details“). Die Verifizierungsseite bleibt eine eigene Seite mit Zurück-Link zum Konto; im Menü ist dort „Konto“ markiert.
- [x] Der Admin-Bereich (Prüf-Queue, Streitfälle, Sperren, fehlgeschlagene Nachrichten, Statistik, Rollen, 2FA-Einrichtung) liegt unter einer eigenen Adresse, admin.uniscrims.com, und steht nicht mehr im Menü. Admins, Prüfer und der Betreiber finden auf ihrer Konto-Seite einen Link dorthin (seit Phase 17 im Konto-Menü, N-13). Alte Adressen unter uniscrims.com/admin leiten weiter.
- [x] Die Anmeldung gilt für beide Adressen: Wer auf uniscrims.com angemeldet ist, ist es auch im Admin-Bereich; ohne Anmeldung führt der Admin-Bereich zur normalen Anmeldung (für Staff mit Passwort und Code wie in N-4) und danach zurück. Abmelden im Admin-Bereich meldet überall ab. Beim Deploy von Phase 13 werden alle einmal abgemeldet.
- [x] Der Admin-Bereich hat einen eigenen Kopf mit „Uni Scrims Admin“, einem Link zurück zur Seite und „Abmelden“ (seit Phase 14 am Desktop unten in der Seitenleiste, N-10). Wer keine Rolle hat, sieht dort nichts (wie bisher: Seite nicht gefunden). Impressum und Datenschutz sind auch dort erreichbar.

**N-10 Profilbild im Kopf, Dashboards für Admin-Bereich und Team** (Phase 14)
- [x] Im Kopf steht neben „Konto“ das eigene Profilbild (die Kopie aus N-8; ohne Kopie die Initialen), auf dem Desktop und im Handy-Menü. Der Warnpunkt bleibt.
- [x] Der Admin-Bereich hat am Desktop (ab 1024 px) links eine feste Seitenleiste: Übersicht, Prüf-Queue, Streitfälle, Sperren, Nachrichten, Statistik, Rollen (jeweils nur, was die Rolle sieht), mit der Anzahl offener Prüfungen, Streitfälle und fehlgeschlagener Nachrichten und darunter dem Bot-Status. Ganz unten stehen das eigene Profilbild, der Name, darunter die Rolle (Betreiber, Admin, Prüfer), und „Abmelden“. Auf dem Handy werden die Bereiche zu Tabs zum Wischen, Abmelden bleibt dort im Kopf.
- [x] Startseite des Admin-Bereichs ist eine Übersicht mit Kacheln: offene Prüfungen (und seit wann die älteste wartet), Streitfälle, fehlgeschlagene Nachrichten und der Bot-Status; die Kacheln der drei Bereiche führen dorthin, die Bot-Kachel zeigt nur den Stand der beiden Schleifen. Prüfer sehen nur die Kachel der Prüf-Queue. Die Prüf-Queue liegt unter /queue. Die Warnung zu fehlenden Rechtstexten bleibt für Admins sichtbar.
- [x] Die Team-Seite zeigt oben Kacheln: Mitglieder (x von 10), verifizierte Spieler (x von 5, spielbereit oder wie viele fehlen), Zuverlässigkeit (gespielt, No-Shows, kurzfristige Absagen, Ø Bewertung; dieselben Werte, die andere Teams auf dem Board sehen) und das nächste anstehende Scrim (verlinkt; ohne Scrim ein Link zum Board). Darunter am Desktop zwei Spalten: links der Kader, rechts Einladen und Team bearbeiten (nur für den Captain). Auf dem Handy bleibt alles untereinander. Funktionen und Rechte der Team-Seite ändern sich nicht. Seit Phase 19 auf die Tabs „Team“ und „Mitglieder“ verteilt (N-15).


**N-11 Die ganze Seite im Dashboard-Layout** (Phase 15)
- [x] Angemeldet hat die Seite am Desktop (ab 1024 px) links eine feste Seitenleiste wie der Admin-Bereich: oben „Scrims“, unten „Team“ mit dem Team-Logo (oder Kürzel) und dem Teamnamen, darunter „Konto“ mit dem Profilbild und dem Discord-Namen. Ohne Team steht dort „Team“ mit dem Hinweis zum Gründen oder Beitreten. Der Eintrag der aktuellen Seite ist markiert, auch auf Detailseiten (Anfrage, Scrim) und der Verifizierung. Der Warnpunkt für eine fehlende Verifizierung steht an „Konto“.
- [x] Die Kopfzeile mit dem Logo bleibt; die Navigation steht am Desktop nur noch in der Leiste. Unter 1024 px öffnet wie bisher der Menü-Knopf dieselben Einträge in derselben Reihenfolge (Scrims oben, Team und Konto unten).
- [x] Gesperrte und unvollständige Konten sehen wie bisher nur „Konto“. Abgemeldet (Startseite, Anmeldung, Rechtstexte) bleibt die Seite ohne Leiste. Der Admin-Bereich behält seine eigene Leiste.
- [x] Unterseiten stehen als Tabs oben im Inhalt: auf „Scrims“ die Tabs aus N-9, auf „Konto“ die Tabs „Konto“ und „Verifizierung“ (statt des Zurück-Links). Die Team-Seite hat keine Unterseiten (seit Phase 19 die Tabs „Team“ und „Mitglieder“, N-15). Funktionen und Rechte ändern sich nicht.

**N-12 Volle Breite** (Phase 16)
- [x] Am Desktop (ab 1024 px) steht die Seitenleiste ganz links am Bildschirmrand, auf der Seite wie im Admin-Bereich. Kopf (das Logo über der Leiste), Discord-Hinweis und Fußzeile gehen über die ganze Breite.
- [x] Die Ansichten füllen den Platz neben der Leiste ohne feste Obergrenze. Auf „Scrims“ stehen Karten und Listen nebeneinander (ab 1280 px zwei, ab 1536 px drei, ab 1920 px vier Spalten). Team, Konto, Anfrage und Scrim zeigen links die Angaben und rechts Aktionen und Hinweise (die Team-Seite für den Captain wie bisher ab 768 px, sonst ab 1024 px); ohne Team stehen „Team gründen“ und „Team beitreten“ nebeneinander. Im Admin-Bereich stehen die Listen ab 1280 px in zwei Spalten.
- [x] Formulare bleiben lesbar schmal: Anfrage erstellen, Team beitreten, Konto vervollständigen und Feedback stehen mittig im Inhalt, die Verifizierung links unter den Konto-Tabs. Abgemeldete Seiten (Startseite, Anmeldung, Rechtstexte) bleiben, wie sie sind. Unter 1024 px ändert sich nichts, auch nicht die Reihenfolge. Funktionen und Rechte ändern sich nicht.

**N-13 Konto-Menü, Einstellungen, Design und Support** (Phase 17)
- [x] „Konto“ in der Seitenleiste öffnet ein Menü mit Einstellungen, Support, für Staff dem Admin-Bereich und Abmelden. Auf dem Handy stehen dieselben Punkte im Menü unter dem Konto. Der Knopf „Abmelden“ oben auf der Konto-Seite und der Kasten „Admin-Bereich“ entfallen. Gesperrte und unvollständige Konten bekommen dasselbe Menü, ohne den Admin-Bereich.
- [x] Die Konto-Seite heißt „Einstellungen“, ihre Tabs „Allgemein“ und „Verifizierung“ (seit Phase 18 dazwischen „Benachrichtigungen“, N-14). Links stehen unter „Grundeinstellungen“ die Profil-ID (nicht änderbar, zum Kopieren) und das Design, darunter wie bisher Studierendenstatus, Name und Anmeldung, Deine Daten und Konto löschen. Rechts stehen unter „Verknüpfte Konten“ Discord (Profilbild, Name, ob Nachrichten ankommen, erneut verbinden); weitere Konten wie Riot kommen erst mit ihrer Anbindung.
- [x] Das Design ist wählbar: System (Standard, folgt wie bisher dem Gerät), Hell oder Dunkel. Die Wahl gilt für das Konto auf allen Geräten und auch im Admin-Bereich; abgemeldet folgt die Seite dem Gerät. Die Logos folgen dem gewählten Design wie in N-7. Gesperrte und unvollständige Konten können das Design auch wählen. Die Datenauskunft nennt die Wahl.
- [x] Neue Seite „Support“ (für alle erreichbar, auch abgemeldet und auf dem Admin-Host; verlinkt im Konto-Menü und in der Fußzeile neben Impressum und Datenschutz): ein Knopf zum Uni-Scrims-Discord-Server und die Kontaktadresse support@uniscrims.com zum Schreiben. Fehlt eins davon in der Konfiguration, entfällt es; fehlt beides, verweist die Seite auf das Impressum.
- [x] Die Datenschutzerklärung nennt die gespeicherte Design-Wahl und heißt die Konto-Seite „Einstellungen“.

**N-14 Benachrichtigungen einstellen** (Phase 18)
- [x] Die Einstellungen haben einen Tab „Benachrichtigungen“ zwischen „Allgemein“ und „Verifizierung“. Dort stellt jeder für jede Benachrichtigung ein, ob sie per Discord-DM, per Mail, auf beiden Wegen oder gar nicht kommt, nach Kategorien: Verifizierung (Ergebnis der Prüfung); Anfragen und Bewerbungen (Bewerbung erhalten, Bewerbung abgelehnt, Anfrage gelöscht, Anfrage abgelaufen; nur für den Captain); Scrims (gebucht, abgesagt, Erinnerung 24 Stunden und 1 Stunde vorher, Bitte um Feedback); Team (Verknüpfung mit dem Team-Channel ist weg; nur für den Captain). Speichern geht auch ohne JavaScript.
- [x] Ohne eigene Einstellung bleibt alles wie bisher: Discord an, Mail aus, und Scrim-Benachrichtigungen bekommt nur der Captain. Mitglieder können sie für sich einschalten, per Discord und/oder Mail. Anfragen, Bewerbungen und der Team-Hinweis gehen weiter nur an den Captain; die Einstellung eines Mitglieds gilt, sobald es Captain ist.
- [x] Wer etwas bekommt, entscheidet sich beim Versand: der Captain und die Mitglieder in diesem Moment, mit ihrer Einstellung in diesem Moment. Wer vorher das Team verlässt oder abschaltet, bekommt nichts mehr. Erinnerungen zu Scrims, die vor dem Update gebucht wurden, folgen ebenfalls den Einstellungen.
- [x] Mails gehen an die bestätigte Adresse des Kontos, als reiner Text (seit Phase 23 in der Sprache des Empfängers, N-19) von `noreply@uniscrims.com`, mit dem Link zur passenden Seite und dem Hinweis, wo man sie abschaltet. Kommt eine Mail nicht an, versucht der Bot es mehrmals wie bei Discord; der Hinweis auf der Website hängt nur an DMs.
- [x] Nicht einstellbar sind die Konto-Mails (Bestätigung, Passwort, E-Mail-Wechsel) und die Posts im Team-Channel; die gehören zum Team.
- [x] Wer Discord für alle Benachrichtigungen abschaltet, sieht den Hinweis zu blockierten DMs nicht mehr. Die Datenauskunft enthält die Einstellungen und die persönlichen Nachrichten (DMs und Mails); die Kontolöschung löscht beides. Die Datenschutzerklärung nennt die Mails für Benachrichtigungen.

**N-15 Team-Tabs und Links** (Phase 19)
- [x] Die Team-Seite hat zwei Tabs: „Team“ und „Mitglieder“. Über beiden stehen das Logo (oder Kürzel) und der Teamname. Ohne Team bleibt die Seite wie bisher (Gründen, Beitreten) ohne Tabs, und „Mitglieder“ führt auf die Team-Seite.
- [x] Tab „Team“: oben die Kacheln aus N-10. Links die Karte „Team ‹Name›“ mit Name, Kürzel, Team-ID (nicht änderbar, zum Kopieren), Spiel (Valorant, nicht änderbar), Team-Rang und Hochschulen; der Captain ändert dort Name, Kürzel und Rang wie bisher (der Rang bis Phase 20). Darunter für den Captain die Logos (N-7). Rechts „Interne Links“ mit dem Einladungslink (Kopieren, Erneuern; nur für den Captain, wie bisher) und „Externe Links“. Ganz unten Team verlassen bzw. auflösen. Am Desktop zwei Spalten wie bisher (für den Captain ab 768 px, sonst ab 1024 px), darunter alles untereinander.
- [x] Externe Links: Discord-Server, Website, X, Instagram, Twitch, YouTube und TikTok, jeder optional. Nur der Captain eines nicht gesperrten Teams setzt, ändert und entfernt sie (auch ohne eigene Verifizierung); ein leeres Feld entfernt den Link. Die anderen Mitglieder sehen die Links im Kasten nur zum Lesen.
- [x] Erlaubt sind nur https-Adressen (fehlt „https://“, wird es ergänzt; „http://“ wird abgelehnt), ohne Zugangsdaten und Port, mit höchstens 300 Zeichen. Jede Plattform nimmt nur ihre eigenen Adressen mit einem Pfad zum Profil, jeweils auch mit „www.“: Discord nur Einladungen (discord.gg/… oder discord.com/invite/…), X x.com oder twitter.com, Instagram instagram.com, Twitch twitch.tv, YouTube youtube.com (auch m.youtube.com), TikTok tiktok.com/@…; die Website jede Adresse mit Domain (keine IP-Adresse, nicht localhost). Andere werden mit einem Hinweis abgelehnt, der die Plattform nennt. Was hinter einem Link steht, prüft die Seite nicht.
- [x] Sehen dürfen die Links alle eingeloggten, nicht gesperrten Nutzer, wie Teamnamen: als kleine Symbole neben dem Teamnamen auf der Anfrage-Seite, bei jeder Bewerbung und auf der Scrim-Seite neben dem Gegner, nicht auf dem Board. Ein Klick öffnet die Seite in einem neuen Tab, ohne Referrer. Die Symbole liegen auf unserem Server; beim Anzeigen lädt der Browser nichts von den Plattformen.
- [x] Tab „Mitglieder“: eine Tabelle mit Mitglied (Profilbild, Discord-Name), Rolle, beigetreten (Datum), Status (Verifiziert, In Prüfung, Nicht verifiziert; bei Coaches, die nicht Captain sind, „Nicht nötig“) und für den Captain die Aktionen wie bisher (Rolle setzen, „Zum Captain“, Entfernen). Auf dem Handy wird jede Zeile ein Block. Darunter eine feste Tabelle „Rollen und Rechte“ (Captain, Spieler, Ersatz, Coach) mit den Rechten aus der Berechtigungstabelle (ARCHITECTURE §7).
- [x] Admins sehen die Links eines Teams auf der Seite „Sperren“ als Adressen und entfernen mit „Links entfernen“ alle auf einmal, nur wenn sie den aktuellen Stand gesehen haben (wie bei Logos, N-6), auch bei gesperrten Teams. Beim Auflösen eines Teams werden seine Links gelöscht; bei einer Sperre bleiben sie, bis ein Admin sie entfernt.
- [x] Die Datenauskunft nennt beim Team die Links und wann sie zuletzt geändert wurden. Die Datenschutzerklärung nennt die Links. Sonst ändern sich Funktionen und Rechte der Team-Seite nicht.

**N-16 Spieler-Rang und Team-Rang** (Phase 20)
- [x] Jeder gibt in den Einstellungen unter „Allgemein“ seinen Rang an (Iron bis Radiant) oder lässt ihn leer, und kann ihn jederzeit ändern oder löschen. Der Rang ist selbst angegeben, bis eine Riot-Anbindung kommt (P2). Gesperrte und unvollständige Konten können ihn nicht setzen.
- [x] Der Team-Rang wird nicht mehr gewählt, sondern beim Anzeigen berechnet: der Durchschnitt der Ränge aller Spieler und Ersatzspieler, die einen Rang angegeben haben (auch wenn sie noch nicht verifiziert sind), auf einen Rang gerundet, bei genau der Mitte aufwärts. Coaches zählen nie. Hat niemand davon einen Rang, hat das Team keinen Rang („Ohne Rang“).
- [x] Gründen und Bearbeiten eines Teams haben kein Rangfeld mehr. Alle bestehenden Teams starten nach dem Update ohne Rang; der bisher gewählte Rang wird nicht übernommen.
- [x] Ohne Team-Rang filtert das Board nicht vorab (alle Ränge), eine neue Anfrage startet mit dem Rang-Bereich Iron bis Radiant, und es gibt keinen Hinweis „außerhalb des Bereichs“, weder beim Bewerben noch beim Ersteller. Mit Team-Rang bleibt alles wie bisher.
- [x] Andere Teams sehen nur den Team-Rang (Board, Anfrage, Bewerbungen, Einladungsseite). Die Mitglieder eines Teams sehen zusätzlich den Rang jedes Einzelnen im Tab „Mitglieder“.
- [x] Der Tab „Team“ zeigt den Team-Rang mit der Anzahl der Ränge, aus denen er berechnet ist. Wer als Spieler oder Ersatzspieler zählt und keinen Rang angegeben hat, sieht dort einen Link „Rang angeben“ zu den Einstellungen.
- [x] Die Datenauskunft enthält den eigenen Rang und den Rang des Teams; die Kontolöschung löscht den eigenen Rang. Die Datenschutzerklärung nennt den Rang, wer ihn sieht und dass er in den Team-Rang einfließt.
- [x] Neben jedem Rang steht sein Rang-Bild aus dem Spiel (Board, Anfrage, Scrims, Team, Mitglieder, Einladung, Einstellungen und die Rang-Auswahlen); ohne Rang steht Riots „Unrated“-Bild davor („Ohne Rang“, in der Auswahl „Kein Rang“). Das Impressum nennt dafür in einem eigenen Abschnitt Riots Hinweis zur Nutzung seiner Assets, deutsch und im englischen Wortlaut der Richtlinie (nach Phase 20 ergänzt, zuerst im Footer; seit dem 25.10.2026 auf Wunsch des Nutzers im Impressum, damit Footer und Startseite keinen englischen Text zeigen).

**N-17 Mehrere Teams pro Nutzer** (Phase 21)
- [x] Ein Nutzer kann in bis zu 5 Teams sein, in jeder Rolle. Es zählen alle nicht aufgelösten Teams, auch gesperrte (aus denen man austreten kann). Am Limit lässt sich kein Team gründen und keinem beitreten; die Seite sagt das und verweist auf den Antrag.
- [x] Eines der Teams ist das aktive. Board, die Scrims-Tabs, „Anfrage erstellen“, die Team-Seite und Anfragen zeigen alles aus seiner Sicht. Die Wahl gilt auf allen Geräten. Wer ein Team gründet oder einem beitritt, hat es danach aktiv. Ist das aktive Team weg (verlassen, entfernt, aufgelöst), gilt das zuletzt beigetretene.
- [x] In der Leiste öffnet der Team-Eintrag ein Menü mit den eigenen Teams (Logo, Name, Haken beim aktiven) und „Neues Team erstellen“; am Limit ist der Punkt gesperrt, darunter steht „Mehr Teams beantragen“. Die Auswahl eines Teams macht es aktiv und öffnet die Team-Seite. Ohne Team bleibt der Eintrag „Gründen oder beitreten“. Auf dem Handy stehen dieselben Punkte im Menü.
- [x] Rechte gelten je Team: Captain-Rolle, Rollen und Verifizierung wie bisher, jeweils für das Team, für das man handelt. Eine Aktion handelt immer für das Team, das beim Öffnen der Seite aktiv war.
- [x] Gehört ein Scrim zu einem anderen eigenen Team, zeigt seine Seite das mit „Zu Team X wechseln“. Gehört eine Anfrage zu einem anderen eigenen Team, zeigt ihre Seite sie aus Sicht des aktiven Teams, mit demselben Hinweis (um die Bewerbungen zu sehen). Diese Knöpfe bleiben auf der Seite.
- [x] Teams mit gemeinsamen Mitgliedern dürfen gegeneinander scrimmen; auf die eigene Anfrage bewerben geht weiter nicht.
- [x] Die Einladungsseite lässt beitreten, solange das Limit nicht erreicht ist, und verweist am Limit auf den Antrag. Der Hinweis „Verlasse es zuerst“ entfällt.
- [x] Ein gesperrter Nutzer wird aus allen Teams entfernt, in denen er nicht Captain ist; jedes Team, in dem er Captain ist, wird mitgesperrt. Wer sein Konto löscht, muss vorher in jedem Team mit weiteren Mitgliedern die Captain-Rolle übertragen; die Löschung verlässt danach alle Teams bzw. löst Teams auf, in denen man allein ist.
- [x] Die Einstellungen zeigen alle eigenen Teams. Die Datenauskunft nennt alle Teams, das aktive, das Limit und die Anträge.
- [x] Auf der Support-Seite kann ein eingeloggter Nutzer „Mehr Teams beantragen“ (Begründung 10–500 Zeichen, ein offener Antrag gleichzeitig). Er sieht dort, in wie vielen von wie vielen Teams er ist, und den Stand seines Antrags (In Prüfung, Angenommen mit dem neuen Limit, Abgelehnt). Admins und Betreiber entscheiden auf der Admin-Seite „Anträge“: neues Limit (größer als das bisherige, höchstens 50) oder ablehnen. Eine Nachricht über die Entscheidung gibt es nicht. Wer schon 50 Teams haben darf, kann keinen Antrag mehr stellen.
- [x] `/setup` hat eine Option „team“ mit Vorschlägen (die nicht gesperrten Teams, in denen man Captain ist); auch der getippte Name eines solchen Teams geht. Mit nur einem solchen Team kann man sie weglassen.
- [x] Benachrichtigungen kommen je Team wie bisher; wer in beiden Teams eines Scrims ist, bekommt beide. Wer in einem Team Captain ist und in einem anderen nicht, bekommt Scrim-Benachrichtigungen ohne eigene Wahl nur für seine Captain-Teams; die Einstellungen sagen das, und eine Wahl dort gilt für alle Teams. Die Datenschutzerklärung nennt mehrere Teams, das gespeicherte aktive Team und den Antrag.

**N-18 Deutsch und Englisch** (Phase 22)
- [x] Oben rechts im Kopf jeder Seite (abgemeldet, angemeldet, Admin-Bereich) steht die Sprachwahl: ein Knopf mit der Flagge der aktuellen Sprache, „DE“ bzw. „EN“ und einem Pfeil. Er öffnet ein Menü mit „Deutsch“ (deutsche Flagge) und „English“ (britische Flagge), mit Haken an der aktiven Sprache. Eine Auswahl zeigt dieselbe Seite in der neuen Sprache. Angemeldet steht die Wahl auf dem Handy links neben dem Menü-Knopf; im Admin-Bereich auf schmalen Bildschirmen nur die Flagge. Ohne JavaScript lässt sich die Sprache nicht wechseln (wie bei den Auswahlfeldern).
- [x] Ohne eigene Wahl gilt die Sprache des Browsers: Englisch, wenn er Englisch vor Deutsch bevorzugt, sonst Deutsch.
- [x] Die Wahl gilt in diesem Browser (ein Cookie, ein Jahr, auch im Admin-Bereich) und mit Konto auf allen Geräten: Angemeldet gilt die Sprache des Kontos vor Cookie und Browser. Speichern geht auch für gesperrte und unvollständige Konten. Bei der Registrierung wird die gerade angezeigte Sprache am Konto gespeichert.
- [x] Auf Englisch ist die ganze Website englisch: alle Seiten, der Admin-Bereich, Fehlermeldungen, Hinweise, Erfolgsmeldungen, Bestätigungsfragen, Datums- und Zahlenangaben (englische Schreibweise, 24-Stunden-Uhr, weiterhin deutsche Zeit) sowie Impressum und Datenschutzerklärung als englische Fassung, bei der die deutsche verbindlich bleibt. Fehlt eine englische Fassung, steht die deutsche mit dem Hinweis, dass es die Seite nur auf Deutsch gibt. Den Riot-Hinweis zeigt das englische Impressum im Original.
- [x] In beiden Sprachen gleich bleiben: die Rang-Namen (schon englisch), was Nutzer eingeben (Teamnamen, Kürzel, Begründungen, Notizen), Hochschulnamen, die Adressen der Seiten und die Datenauskunft (deutsche Schlüssel und Bezeichnungen; die englische Datenschutzerklärung sagt das). Auf Deutsch bleibt alles wie bisher.
- [x] Mails und Discord-Nachrichten bleiben bis Phase 23 deutsch; seitdem kommen sie in der Sprache des Empfängers (N-19).
- [x] Die Datenauskunft nennt die gespeicherte Sprache, die Kontolöschung löscht sie. Die Datenschutzerklärung nennt das Cookie, das Lesen der Browsersprache (nicht gespeichert) und die Sprache am Konto.

**N-19 Mails und Discord-Nachrichten in der Sprache des Empfängers** (Phase 23)
- [x] Persönliche Nachrichten kommen in der Sprache, die am Konto des Empfängers gespeichert ist: Discord-DMs, Benachrichtigungs-Mails und die Konto-Mails (Adresse bestätigen, Passwort zurücksetzen, neue Adresse). Ohne gespeicherte Sprache kommen sie auf Deutsch. Datums- und Zeitangaben, Formate, die Namen der Einstellungen in der Fußzeile und der Ablehnungsgrund einer Prüfung (sofern ihn nicht ein Prüfer frei geschrieben hat) folgen der Sprache.
- [x] Posts im verknüpften Team-Channel kommen in der Sprache, die der Captain des Teams beim Versand am Konto hat, ohne gespeicherte Sprache auf Deutsch; ebenso die Test-Nachricht von `/setup`.
- [x] `/setup` antwortet in der Sprache des Kontos, das zum Discord-Konto gehört; ohne Konto oder ohne gespeicherte Sprache in der Sprache der Discord-App (Englisch, wenn sie englisch eingestellt ist), sonst auf Deutsch. Befehl und Optionen sind in englischen Discord-Apps englisch beschrieben.
- [x] Ein Konto ohne gespeicherte Sprache (vor Phase 22 angelegt) bekommt bei der nächsten Anmeldung (Passwort, Code, Discord oder Bestätigungslink) die Sprache, in der die Seite gerade erscheint: die im Browser gewählte, sonst die Browsersprache, sonst Deutsch. Kommt die Anmeldung ohne beides (etwa ein Link-Scanner, der einen Bestätigungslink öffnet), wird nichts gespeichert. Eine gespeicherte Sprache ändert nur die Wahl oben rechts.
- [x] Deutsch bleiben: die Test-Skripte und Ausgaben für den Betreiber, die Präfixe der Entwicklungs-Umleitungen und die Datenauskunft. Die deutschen Texte bleiben unverändert.
- [x] Die Datenschutzerklärung nennt die Übernahme der Sprache bei der Anmeldung und dass Mails und Discord-Nachrichten in der gespeicherten Sprache kommen.

### P1: Nice-to-Have, direkt nach dem MVP
- **Benachrichtigung über neue passende Anfragen** im Team-Channel (Opt-in).
- **Verifizierung pro Semester:** läuft zum Semesterende ab (31.03. bzw. 30.09.), danach neue Bescheinigung nötig.
- **Bot-Commands zum Posten und Suchen:** `/scrim posten`, `/scrims` direkt in Discord.
- **Feedback-Kommentar** als Freitext, mit Admin-Ansicht.
- **Uniliga-Division** als optionales Team-Feld und als Filter.
- **Wiederkehrende Anfragen**, z. B. "jeden Dienstag 20 Uhr".

### P2: Später, aber jetzt schon mitdenken
- **Weitere Games:** `game` als Feld an Team und Anfrage, auch wenn es vorerst nur `valorant` gibt.
- **Riot-Anbindung (RSO):** Rang automatisch prüfen; dafür eine Riot-Account-Verknüpfung am Nutzer vorsehen.
- **Automatische Vorschläge bzw. Matchmaking** auf Basis von Verfügbarkeit und Rang.
- **Kooperation mit der Uniliga:** z. B. Uniliga-Team-ID verknüpfen.

---

## 8. Erfolgskriterien

Gemessen ab Launch. Bei einem Markt von wenigen hundert Valorant-Uni-Teams sind die Ziele bewusst bodenständig. Die Statistik-Seite im Admin-Bereich (N-2) rechnet genau nach diesen Definitionen.

**Frühindikatoren (erste 4 Wochen)**

| Metrik | Definition | Ziel | Stretch |
|---|---|---|---|
| Spielbereite Teams | aktive Teams mit ≥ 5 verifizierten Spielern (Spieler oder Ersatzspieler), Stand jetzt | 15 | 30 |
| Prüfzeit | Median von Upload bis Entscheidung, nur von Hand entschiedene Prüfungen (ohne automatische Ablehnung und Ablehnung durch Sperre) | < 24 h | < 6 h |
| Bestätigungsquote | bestätigte Anfragen ÷ (bestätigte + verfallene), nur Anfragen, deren Startzeit vorbei ist; eine noch offene Anfrage nach ihrem Start zählt als verfallen, gelöschte Anfragen zählen nicht | ≥ 50 % | ≥ 70 % |
| Zeit bis Bestätigung | Median von Anfrage erstellt bis Scrim gebucht | < 24 h | < 6 h |
| Show-up-Rate | Gespielt ÷ (Gespielt + No-Show) | ≥ 90 % | ≥ 95 % |
| Feedback-Antwortrate | Scrims mit ≥ 1 Antwort ÷ ausgewertete Scrims (Gespielt, No-Show, Streitfall, Unbestätigt) | ≥ 60 % | ≥ 80 % |

**Spätindikatoren (nach 2–3 Monaten)**

| Metrik | Definition | Ziel |
|---|---|---|
| Teams mit ≥ 2 Scrims pro Monat | spielbereite Teams mit ≥ 2 gespielten Scrims (Start in den letzten 30 Tagen) ÷ spielbereite Teams, Stand jetzt | ≥ 50 % |
| No-Show-Rate | No-Show ÷ (Gespielt + No-Show) | < 10 % |
| Durchschnittsbewertung | alle Bewertungen aus gespielten Scrims | ≥ 4,0 |

Gespielt heißt Status `COMPLETED`, also auch nach einer Streitfall-Entscheidung „Gespielt“. Scrims aufgelöster oder gesperrter Teams zählen mit.

---

## 9. Entscheidungen und offene Punkte

**Entschieden**

| Thema | Entscheidung |
|---|---|
| Verifizierung | Nur Upload der Immatrikulationsbescheinigung mit manueller Prüfung. Keine Uni-Mails, keine Domain-Listen. |
| Gemischte Teams | Erlaubt. Spieler verschiedener Hochschulen dürfen in einem Team sein. |
| Buchung | Bewerben + Bestätigung durch den Ersteller. |
| Uploads | Löschen direkt nach der Prüfung, spätestens nach 14 Tagen. |
| Team-Logo | Seit Phase 10 optional (N-6). Es liegt als kleines, vom Server erzeugtes Bild in der Datenbank, nicht im Upload-Ordner: So ist es in den Backups und wird nicht wie verwaiste Uploads gelöscht. |
| Mail-Dienst | Bis Phase 6 keiner. Seit Phase 7 nur Konto-Mails (Bestätigung, Passwort, E-Mail-Wechsel) über das Postfach `noreply@uniscrims.com` bei Hetzner (Webhosting, SMTP). Benachrichtigungen bleiben bei Discord; seit Phase 18 auf Wunsch auch per Mail über dasselbe Postfach (N-14). |
| Konto | Seit Phase 7 E-Mail, Passwort und Klarname; Discord wird verknüpft und bleibt Pflicht (Benachrichtigungen, Hub-Beitritt, Kontakt zum gegnerischen Captain). Der Klarname ist nur für die Person selbst und für Prüfer und Admins sichtbar. |
| Hosting | Eigener VPS mit Docker. |
| Betreiber | Privatperson, nicht-kommerziell. |
| Feedback | Nur über die Web-App. Discord verlinkt dorthin. |
| Feedback-Frist | Eine Frist: 72 h nach dem Feedback-Hinweis. |
| Beide "Wir konnten nicht" | Unbestätigt, keiner wird bestraft. |
| Bewerbung außerhalb des Rang-Bereichs | Erlaubt, mit Hinweis. |
| Neue-Anfragen-Benachrichtigung | Nach P1 verschoben. Dafür ist der editierbare Team-Rang im MVP (seit Phase 20 aus den Rängen der Spieler berechnet, N-16). |
| Auth | Better Auth (siehe ARCHITECTURE). |
| Sichtbarkeit | Board und Anfragen nur für eingeloggte Nutzer. |
| Captain-Rechte | Scrim-Aktionen nur, wenn der Captain selbst verifiziert ist. Teamverwaltung geht auch ohne. |
| Entsperren | Nur manuell per Datenbank, kein Admin-Button. |
| Altersbestätigung | 16+ per Checkbox vor dem Discord-Login. |
| Discord-ID | Wird nicht doppelt am Nutzer gespeichert, sondern aus der Discord-Verknüpfung von Better Auth gelesen. |
| Kontolöschung bei Sperre | Gesperrte Nutzer dürfen ihr Konto löschen. Ihre Discord-ID bleibt danach an einem eigenen gesperrten Platzhalter gespeichert, damit die Sperre bei einem neuen Login weiter gilt; das gelöschte Konto selbst ist anonym wie jedes andere. Wird die Sperre aufgehoben, wird der Platzhalter gelöscht (README). |

**Bewusst akzeptierte Risiken**

| Entscheidung | Risiko |
|---|---|
| Nur Upload-Verifizierung | Echtheit bzw. Zugehörigkeit der Bescheinigung ist nicht prüfbar; der Namensabgleich seit Phase 7 hilft nur gegen Bescheinigungen unter fremdem Namen. Der Prüfaufwand liegt anfangs bei einer Person (15 Teams ≈ 75+ Prüfungen). |
| Löschen nach Prüfung | Bei späterem Verdacht gibt es nichts mehr nachzuprüfen. |
| Nur Discord als Kanal | Blockierte DMs sind ein stiller Ausfall. Fallback: Team-Channel und Hinweis auf der Website. Seit Phase 18 kann jeder zusätzlich Mail einschalten (N-14). |
| Eigener VPS | Du betreibst ein System, das kurzzeitig ausweisähnliche Dokumente hält: Updates, Zugangsschutz und Vorfallreaktion liegen bei dir. |
| Altersbestätigung nur per Checkbox | Wer den Login-Endpunkt direkt aufruft, umgeht sie, und es wird kein Nachweis gespeichert. Im MVP bewusst akzeptiert. |
| Team-Logos ohne Vorabprüfung | Ein unpassendes Logo ist sofort für alle Eingeloggten sichtbar, bis ein Admin es entfernt. Nach einer Wiederherstellung aus dem Backup kann ein entferntes Logo zurückkommen. |
| Externe Team-Links ohne Vorabprüfung (seit Phase 19) | Geprüft wird nur, dass ein Link zur richtigen Plattform führt, nicht, was dort steht. Ein unpassender Link ist sofort für alle Eingeloggten sichtbar, bis ein Admin ihn entfernt; wie bei Logos kann er nach einer Wiederherstellung aus dem Backup zurückkommen. |
| Wiederherstellung aus dem Backup | Sperren und Kontolöschungen nach dem Backup (seit dem letzten gelungenen Backup, normalerweise höchstens ein Tag) werden aus der alten Datenbank nachgezogen. Ist sie verloren, fehlen sie: Gelöschte Konten stehen dann wieder mit den Daten vom Backup-Zeitpunkt in der Datenbank, bis sie erneut gelöscht werden, und Sperren müssen neu gesetzt werden. Steht in der Datenschutzerklärung. |

**Vor dem Launch geklärt** (Texte liegen außerhalb von Git in `LEGAL_DIR`, siehe ARCHITECTURE §8)

| # | Frage | Ergebnis |
|---|---|---|
| 1 | Impressum nach § 5 DDG: Nicht-kommerziell befreit nicht sicher von der Pflicht. Eigene Adresse oder Impressums-Service? | Impressum mit der eigenen Anschrift des Betreibers und E-Mail. |
| 2 | Datenschutzerklärung: Upload sensibler Dokumente, Rechtsgrundlage, Löschfristen, Discord (USA) als Empfänger durch Server-Beitritt und DMs, Hoster, Logs, IP-Adresse und User-Agent in der Session, Benachrichtigungen (30 Tage), Mindestalter 16, kein automatischer Kick nach Kontolöschung, Discord-ID gesperrter Nutzer nach Löschung, Backups (14 Tage) mit gelöschten Konten. | Geschrieben, deckt alle genannten Punkte ab. Hoster: IONOS (Rechenzentrum Berlin); Backups: Hetzner Storage Box (Falkenstein), 14 Tage, scheitert die Sicherung, bleibt das letzte Backup bis zur nächsten gelungenen; nginx-Logs 14 Tage (eigene logrotate-Regel, ARCHITECTURE §8). Sessions (mit IP-Adresse und User-Agent) laufen spätestens 7 Tage nach der letzten Nutzung ab und werden höchstens eine Stunde danach gelöscht; Benachrichtigungen 30 Tage nach dem Versand, dem letzten Versuch bzw. der Absage. |
| 3 | AVV mit dem VPS-Hoster; Snapshots/Backups des Hosters aus oder in der Datenschutzerklärung nennen. | AVV mit IONOS und Hetzner abgeschlossen; bei IONOS sind keine Snapshots oder Backups aktiv. |
| 4 | Ablauf für Datenauskunft (Art. 15). | Formlos per E-Mail an die Adresse aus dem Impressum; Antwort innerhalb eines Monats, im MVP manuell per DB-Abfrage. Seit Phase 9 zusätzlich per Knopf auf der Konto-Seite (N-5); per Mail geht es weiterhin. |

**Noch offen**

| # | Frage | Wann klären |
|---|---|---|
| 5 | Wer prüft außer dir? Bei Wachstum braucht es weitere Prüfer. | Technisch seit Phase 8 möglich (N-4); wer es wird, entscheidet der Betreiber |

---

## 10. Zeitplan

Die Phasen sind in `ARCHITECTURE.md` Abschnitt 11 im Detail beschrieben. **3–4 Wochen gelten bei Vollzeit. Neben dem Studium realistisch 6–8 Wochen.**

| Phase | Inhalt | Fertig, wenn … |
|---|---|---|
| 0 | Gerüst, Discord-Application und Hub-Server einrichten, Docker-Build | Web und Bot starten lokal, Tests laufen, Docker-Image baut |
| 1 | Login mit Server-Beitritt, Upload-Verifizierung inkl. Admin-Queue, Teams und Einladungen | Du kannst dich einloggen, hochladen, als Admin freigeben und ein Team mit Einladungslink anlegen |
| 2 | Scrim-Anfragen, Board, Bewerben, Bestätigen, "Meine Scrims", Absagen, Feedback-Formular | Zwei Test-Teams buchen, sagen ab und geben Feedback; die Auswertung stimmt |
| 3 | Discord-Bot: `/setup`, alle Benachrichtigungen, Reminder, Sweeper | Der komplette Flow läuft mit echten Discord-Nachrichten durch (mit verkürzten Zeiten) |
| 4 | Admin-Bereich komplett, Datenschutz-Funktionen, Deployment | Production läuft mit HTTPS; zwei echte Discord-Accounts buchen und bewerten einen Scrim. Stand 23.10.2026: auf Entscheidung des Betreibers ohne diese Live-Abnahme abgeschlossen; sie folgt beim Go-Live mit zwei spielbereiten Teams aus echten Accounts (Go-Live-Checkliste im README, ARCHITECTURE §11) |
| 5 | Ersatzspieler und Coach (nach dem MVP, N-1) | Der Captain setzt Rollen, und ein Team mit einem Coach als fünftem verifiziertem Mitglied ist nicht spielbereit |
| 6 | Statistik-Seite für die Erfolgskriterien (N-2) | Ein Admin sieht alle Kennzahlen aus §8 für die letzten 28 Tage und gesamt, und sie stimmen mit den Testdaten überein |
| 7 | Konto mit E-Mail, Passwort und Klarname (N-3) | Registrierung, Bestätigung, Anmeldung, Passwort vergessen und Discord verknüpfen laufen durch; ein Altkonto wird zum Vervollständigen geführt, und die Prüf-Queue zeigt den Klarnamen |
| 8 | Admins und Prüfer über die Oberfläche, mit 2FA (N-4) | Der Betreiber macht ein Konto zum Prüfer; es richtet 2FA ein, sieht nur die Prüf-Queue und entscheidet; nach dem Entzug ist der Zugang sofort weg |
| 9 | Datenauskunft per Knopfdruck (N-5) | Ein Nutzer lädt auf der Konto-Seite seine Daten herunter; die Datei enthält alle Abschnitte, aber keine Zugangsdaten und keine Daten anderer Personen |
| 10 | Team-Logo (N-6) | Ein Captain lädt ein PNG mit durchsichtigem Rand hoch; es erscheint zugeschnitten überall statt des Kürzels; JPEG und Bilder ohne Alphakanal werden abgelehnt; ein Admin kann es entfernen, und beim Auflösen verschwindet es |
| 11 | Hell-Modus und Logo pro Hintergrund (N-7) | Mit hellem System-Design ist die ganze Seite hell und gut lesbar, mit dunklem unverändert; jeder Modus zeigt das passende Logo, fehlt eins, steht das andere auf einem passenden Kästchen |
| 12 | Discord-Profilbilder (N-8) | Konto-Seite, Team-Seite und Queue zeigen die Kopie des Profilbilds, der Browser lädt nichts von Discord, ohne Bild stehen Initialen, und beim Löschen ist die Kopie weg |
| 13 | Navigation und Admin-Bereich auf eigener Adresse (N-9) | Das Menü zeigt Scrims, Team, Konto; Board und Meine Scrims sind Tabs einer Seite; Abmelden und Verifizierung liegen unter Konto; der Admin-Bereich läuft unter admin.uniscrims.com mit derselben Anmeldung |
| 14 | Profilbild im Kopf, Dashboards für Admin-Bereich und Team (N-10) | Neben „Konto“ steht das Profilbild; der Admin-Bereich hat Seitenleiste mit Zählern, Profil und Abmelden sowie eine Übersicht mit Kacheln; die Team-Seite zeigt Kacheln und am Desktop zwei Spalten |
| 15 | Die ganze Seite im Dashboard-Layout (N-11) | Angemeldet steht am Desktop links die Seitenleiste mit Scrims oben sowie Team und Konto unten; auf dem Handy dieselben Einträge im Menü; Scrims und Konto haben Tabs für ihre Unterseiten |
| 16 | Volle Breite (N-12) | Am Desktop steht die Leiste ganz links, Seite und Admin-Bereich nutzen den Platz daneben (Scrims in Spalten, Detailseiten zweispaltig); Formulare bleiben schmal; unter 1024 px bleibt alles, wie es ist |
| 17 | Konto-Menü, Einstellungen, Design und Support (N-13) | „Konto“ öffnet ein Menü mit Einstellungen, Support, Admin-Bereich und Abmelden; die Einstellungen zeigen Profil-ID, Design und verknüpfte Konten; Hell und Dunkel lassen sich fest wählen und gelten überall; die Support-Seite nennt Discord und support@uniscrims.com |
| 18 | Benachrichtigungen einstellen (N-14) | Jede Benachrichtigung lässt sich per Discord und/oder Mail ein- und ausschalten; ohne Einstellung bleibt alles wie bisher; Mitglieder bekommen Scrim-Benachrichtigungen, wenn sie sie einschalten; Mails kommen als reiner Text mit Link und Abmelde-Hinweis |
| 19 | Team-Tabs und Links (N-15) | Die Team-Seite hat die Tabs „Team“ (Karte mit Team-ID und Spiel, Logos, Einladung, externe Links) und „Mitglieder“ (Tabelle mit Beitrittsdatum, Rollen und Rechte); falsche Links werden abgelehnt; andere Teams sehen die Links auf Anfrage, Bewerbung und Scrim; ein Admin kann sie entfernen |
| 20 | Spieler-Rang und Team-Rang (N-16) | Spieler geben ihren Rang in den Einstellungen an; der Team-Rang ist der gerundete Durchschnitt der Spieler und Ersatzspieler mit Rang, sonst „Ohne Rang“; Gründen und Bearbeiten ohne Rangfeld; ohne Team-Rang filtert das Board nicht vorab und eine Anfrage startet bei Iron–Radiant |
| 21 | Mehrere Teams pro Nutzer (N-17) | Ein Nutzer ist in bis zu 5 Teams und wechselt in der Leiste das aktive Team; Rechte gelten je Team; am Limit verweisen Gründen und Beitreten auf den Antrag, den Admins auf „Anträge“ entscheiden; `/setup` fragt nach dem Team |
| 22 | Deutsch und Englisch (N-18) | Oben rechts wechselt ein Menü mit Flaggen auf jeder Seite die Sprache; auf Englisch sind alle Seiten samt Admin-Bereich, Meldungen, Datumsangaben und Rechtstexten englisch, auf Deutsch bleibt alles wie bisher; ohne Wahl gilt die Browsersprache; die Wahl gilt im Browser und mit Konto auf allen Geräten |
| 23 | Mails und Discord-Nachrichten in der Sprache des Empfängers (N-19) | DMs, Mails und Konto-Mails kommen in der Sprache des Kontos, Team-Channel-Posts in der des Captains, ohne Sprache auf Deutsch; `/setup` antwortet auf Englisch für englische Konten und Discord-Apps; Konten ohne Sprache bekommen sie bei der nächsten Anmeldung |

Danach: Test mit deinem DHBW-Team und 2–3 befreundeten Teams, noch in diesem Wintersemester.

**Scope-Regel:** Neue Features kommen nur ins MVP, wenn dafür etwas anderes rausfliegt. Ideen kommen in den Parkplatz (P1/P2).
