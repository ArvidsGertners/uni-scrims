// Texts of the team pages and invitations (§5.21): /team, /team/members, /team/new, /join/<code>,
// the team fields and the team link icons.
import { dictionary } from "@uni-scrims/core/config/locale";
import type { LogoBackground } from "@uni-scrims/db";
import type { ReactNode } from "react";

/** Renders an inline link of a sentence with the given label. */
type LinkRender = (label: string) => ReactNode;

/** The start of the texts on creating or joining a team (SPEC N-21). */
const deTeamRules = (full: number, max: number) =>
  `Gründe ein Team oder tritt über einen Einladungslink bei. Für Scrims reicht ein verifizierter Captain; mit mindestens ${full} verifizierten Spielern bekommt ein Team das Abzeichen „Vollständig verifiziert“. Ein Team hat höchstens ${max} Mitglieder.`;
const enTeamRules = (full: number, max: number) =>
  `Create a team or join one with an invite link. A verified captain is enough for scrims; with at least ${full} verified players, a team gets the “Fully verified” badge. A team has at most ${max} members.`;

/** /team. */
export const teamPageMessages = dictionary(
  {
    noTeamHeading: "Du bist noch in keinem Team",
    noTeamIntro: (full: number, max: number) =>
      `${deTeamRules(full, max)} Das geht auch, während deine Verifizierung noch läuft.`,
    members: "Mitglieder",
    rosterFull: "Kader voll",
    roomFor: (count: number) => `Platz für ${count} weitere`,
    verified: "Verifiziert",
    fullyVerified: "Vollständig verifiziert",
    missingToBadge: (missing: number) => `Noch ${missing} bis zum Abzeichen`,
    /** The reliability tile counts the last days only (SPEC N-23). */
    played: (days: number) => `Gespielt · letzte ${days} Tage`,
    nextScrim: "Nächstes Scrim",
    nextScrimDetails: (time: string, opponent: string, format: string) =>
      `${time} · gegen ${opponent} · ${format}`,
    noNextScrim: "Noch keins geplant. Zum Board",
    teamHeading: (name: string) => `Team ${name}`,
    save: "Speichern",
    name: "Name",
    tag: "Kürzel",
    teamRank: "Team-Rang",
    /** After the team rank: how many own ranks it is computed from. */
    rankedFrom: (count: number) => `aus ${count} ${count === 1 ? "Rang" : "Rängen"}`,
    addRank: "Rang angeben",
    game: "Spiel",
    universities: "Hochschulen",
    /** Whether the team is in the teams list (SPEC N-20). */
    teamsList: "Teams-Liste",
    listed: "Angezeigt",
    unlisted: "Ausgeblendet",
    teamsListHint:
      "In der Teams-Liste sehen alle Eingeloggten euer Team mit seiner Zuverlässigkeit und den Discord-Namen, Rollen und Rängen der Mitglieder.",
    hideFromList: "Aus der Teams-Liste nehmen",
    showInList: "In der Teams-Liste zeigen",
    /** Whether the team is on the landing page (SPEC N-34). */
    landing: "Startseite",
    landingAllowed: "Erlaubt",
    landingNotAllowed: "Nicht erlaubt",
    landingWaitsForList: "Erlaubt, aber erst möglich, wenn das Team in der Teams-Liste steht",
    landingBanned: "Erlaubt, aber nicht möglich, solange das Team gesperrt ist",
    landingHint: (max: number) =>
      `Auf der Startseite sehen alle Besucher, auch ohne Anmeldung, Logo, Name, Hochschulen, Team-Rang und Zuverlässigkeit eures Teams, keine Mitglieder. Es erscheinen bis zu ${max} Teams aus der Teams-Liste, mit Logo zuerst.`,
    showOnLanding: "Auf der Startseite zeigen",
    hideFromLanding: "Nicht mehr auf der Startseite zeigen",
    /** Who may apply to the team's requests (SPEC N-21). */
    applicants: "Bewerbungen",
    applicantsAll: "Alle Teams",
    applicantsVerifiedOnly: "Nur vollständig verifizierte Teams",
    applicantsHint: (full: number) =>
      `Lasst ihr nur vollständig verifizierte Teams zu, können sich Teams mit weniger als ${full} verifizierten Spielern oder Ersatzspielern nicht auf eure Anfragen bewerben, und ihre offenen Bewerbungen lassen sich nicht bestätigen.`,
    admitVerifiedOnly: "Nur vollständig verifizierte Teams zulassen",
    admitAll: "Alle Teams zulassen",
    teamId: "Team-ID",
    teamIdHint: "Nenn sie uns, wenn du dich für euer Team beim Support meldest.",
    logos: "Logos",
    /** On a logo tile without a logo for that background. */
    noLogo: "Keins",
    logosHint:
      "PNG oder WebP mit durchsichtigem Hintergrund, max. 2 MB. Durchsichtige Ränder schneiden wir ab, damit das Logo die Fläche füllt. Die Seite zeigt das Logo, das zum hellen oder dunklen Modus passt; fehlt eins, steht das andere auf einem passenden Kästchen.",
    removeLogo: "Entfernen",
    removeLogoConfirm: {
      DARK: "Logo für dunklen Hintergrund wirklich entfernen?",
      LIGHT: "Logo für hellen Hintergrund wirklich entfernen?",
    } as Record<LogoBackground, string>,
    internalLinks: "Interne Links",
    inviteLink: "Einladungslink",
    inviteLinkHint:
      "Teile ihn in eurem Team-Discord. Erneuerst du ihn, funktioniert der alte nicht mehr.",
    renewLink: "Link erneuern",
    renewLinkConfirm: "Neuen Link erzeugen? Der alte funktioniert dann nicht mehr.",
    externalLinks: "Externe Links",
    externalLinksHint: {
      captain:
        "Andere Teams sehen sie als Symbole bei euren Anfragen, Bewerbungen und Scrims. Nur https-Links zur jeweiligen Plattform; ein leeres Feld entfernt den Link.",
      banned:
        "Andere Teams sehen sie als Symbole bei euren Anfragen, Bewerbungen und Scrims. In einem gesperrten Team lassen sie sich nicht ändern.",
      member:
        "Andere Teams sehen sie als Symbole bei euren Anfragen, Bewerbungen und Scrims. Ändern kann sie euer Captain.",
      /** The captain on /team: edited in the team settings since Phase 35 (SPEC N-31). */
      captainView:
        "Andere Teams sehen sie als Symbole bei euren Anfragen, Bewerbungen und Scrims. Ändern kannst du sie in den Team-Einstellungen.",
    },
    saveLinks: "Links speichern",
    noLinks: "Noch keine Links.",
    oplLinked: "Verknüpft",
    oplUnlinked: "Nicht verknüpft",
    oplSettingsHint:
      "Verknüpft euer Team mit eurem Team bei OPL (opleague.pro); dafür musst du dort im Kader stehen. Mitglieder, die auch im OPL-Kader stehen, erscheinen dann im Tab „Team“. Wir prüfen etwa einmal am Tag.",
    oplTeamLink: "Link zu eurem OPL-Team",
    oplLinkSubmit: "Verknüpfen",
    oplUnlink: "Verknüpfung lösen",
    oplUnlinkConfirm: "OPL-Verknüpfung des Teams lösen?",
    oplNeedsProfile: (link: LinkRender) => (
      <>Verknüpfe zuerst {link("dein OPL-Profil")}, dann das Team.</>
    ),
    oplTeamOnOpl: "Team auf OPL",
    oplOnUniScrims: "Auf Uni Scrims",
    oplNoMatches: "Noch niemand aus diesem Team",
    oplOthers: (count: number) =>
      count === 1 ? "1 weitere Person auf OPL" : `${count} weitere auf OPL`,
    oplCheckedAt: (date: string) => `Zuletzt geprüft am ${date}`,
    oplCardHint:
      "Mitglieder dieses Teams, die auch im OPL-Kader stehen (Abgleich über Discord), und wie viele dort sonst noch stehen.",
    oplNotLinked: (link: LinkRender) => (
      <>Noch nicht mit OPL verknüpft. Das geht in den {link("Team-Einstellungen")}.</>
    ),
    bannedLastMember: "Als letztes Mitglied kannst du das gesperrte Team auflösen.",
    captainLeaveNote: (link: LinkRender) => (
      <>
        Als Captain kannst du das Team erst verlassen, wenn du die Captain-Rolle übertragen hast (im
        Tab {link("Mitglieder")}).
      </>
    ),
    dissolveAndLeave: "Team auflösen und verlassen",
    leave: "Team verlassen",
    dissolveConfirm: "Du bist das einzige Mitglied. Das Team wird aufgelöst. Fortfahren?",
    leaveConfirm: "Team wirklich verlassen?",
    /** Before the link to the verification: the captain needs it, players count for the badge. */
    notVerified: {
      captain: "Noch nicht verifiziert? Als Captain brauchst du die Verifizierung für Scrims.",
      player:
        "Noch nicht verifiziert? Damit zählst du für das Abzeichen „Vollständig verifiziert“.",
    },
    toVerification: "Zur Verifizierung",
    /** The dialog /team/settings (SPEC N-31). */
    settings: "Team-Einstellungen",
    settingsCaptainOnly: "Die Team-Einstellungen kann nur euer Captain ändern.",
    settingsBanned: "In einem gesperrten Team lassen sich die Einstellungen nicht ändern.",
  },
  {
    noTeamHeading: "You're not in a team yet",
    noTeamIntro: (full, max) =>
      `${enTeamRules(full, max)} You can do this while your verification is still in progress.`,
    members: "Members",
    rosterFull: "Roster full",
    roomFor: (count) => `Room for ${count} more`,
    verified: "Verified",
    fullyVerified: "Fully verified",
    missingToBadge: (missing) => `${missing} more for the badge`,
    played: (days) => `Played · last ${days} days`,
    nextScrim: "Next scrim",
    nextScrimDetails: (time, opponent, format) => `${time} · vs ${opponent} · ${format}`,
    noNextScrim: "Nothing planned yet. Go to the board",
    teamHeading: (name) => `Team ${name}`,
    save: "Save",
    name: "Name",
    tag: "Tag",
    teamRank: "Team rank",
    rankedFrom: (count) => `from ${count} ${count === 1 ? "rank" : "ranks"}`,
    addRank: "Add your rank",
    game: "Game",
    universities: "Universities",
    teamsList: "Teams list",
    listed: "Shown",
    unlisted: "Hidden",
    teamsListHint:
      "On the teams list, everyone signed in sees your team with its reliability and the members' Discord names, roles and ranks.",
    hideFromList: "Remove from the teams list",
    showInList: "Show on the teams list",
    landing: "Home page",
    landingAllowed: "Allowed",
    landingNotAllowed: "Not allowed",
    landingWaitsForList: "Allowed, but only possible while the team is on the teams list",
    landingBanned: "Allowed, but not possible while the team is banned",
    landingHint: (max) =>
      `On the home page, all visitors, even without signing in, see your team's logo, name, universities, team rank and reliability, but no members. Up to ${max} teams from the teams list appear there, those with a logo first.`,
    showOnLanding: "Show on the home page",
    hideFromLanding: "Stop showing on the home page",
    applicants: "Applications",
    applicantsAll: "All teams",
    applicantsVerifiedOnly: "Fully verified teams only",
    applicantsHint: (full) =>
      `If you admit only fully verified teams, teams with fewer than ${full} verified players or substitutes can't apply to your requests, and their open applications can't be accepted.`,
    admitVerifiedOnly: "Admit only fully verified teams",
    admitAll: "Admit all teams",
    teamId: "Team ID",
    teamIdHint: "Give it to us when you contact support about your team.",
    logos: "Logos",
    noLogo: "None",
    logosHint:
      "PNG or WebP with a transparent background, max. 2 MB. We trim transparent edges so the logo fills the space. The site shows the logo that matches light or dark mode; if one is missing, the other one sits on a matching tile.",
    removeLogo: "Remove",
    removeLogoConfirm: {
      DARK: "Really remove the logo for dark backgrounds?",
      LIGHT: "Really remove the logo for light backgrounds?",
    },
    internalLinks: "Internal links",
    inviteLink: "Invite link",
    inviteLinkHint: "Share it in your team Discord. If you renew it, the old one stops working.",
    renewLink: "Renew link",
    renewLinkConfirm: "Create a new link? The old one will stop working.",
    externalLinks: "External links",
    externalLinksHint: {
      captain:
        "Other teams see them as icons on your requests, applications and scrims. Only https links to the platform in question; an empty field removes the link.",
      banned:
        "Other teams see them as icons on your requests, applications and scrims. They can't be changed in a banned team.",
      member:
        "Other teams see them as icons on your requests, applications and scrims. Your captain can change them.",
      captainView:
        "Other teams see them as icons on your requests, applications and scrims. You can change them in the team settings.",
    },
    saveLinks: "Save links",
    noLinks: "No links yet.",
    oplLinked: "Linked",
    oplUnlinked: "Not linked",
    oplSettingsHint:
      "Link your team with your team on OPL (opleague.pro); you have to be in its roster there. Members who are also in the OPL roster then show up in the “Team” tab. We check about once a day.",
    oplTeamLink: "Link to your OPL team",
    oplLinkSubmit: "Link",
    oplUnlink: "Unlink",
    oplUnlinkConfirm: "Unlink the team from OPL?",
    oplNeedsProfile: (link: LinkRender) => (
      <>First link {link("your OPL profile")}, then the team.</>
    ),
    oplTeamOnOpl: "Team on OPL",
    oplOnUniScrims: "On Uni Scrims",
    oplNoMatches: "Nobody from this team yet",
    oplOthers: (count: number) => (count === 1 ? "1 more on OPL" : `${count} more on OPL`),
    oplCheckedAt: (date: string) => `Last checked on ${date}`,
    oplCardHint:
      "Members of this team who are also in the OPL roster (matched via Discord), and how many others are there.",
    oplNotLinked: (link: LinkRender) => (
      <>Not linked with OPL yet. You can do that in the {link("team settings")}.</>
    ),
    bannedLastMember: "As the last member, you can dissolve the banned team.",
    captainLeaveNote: (link) => (
      <>
        As captain, you can only leave the team once you&apos;ve handed over the captain role (in
        the {link("Members")} tab).
      </>
    ),
    dissolveAndLeave: "Dissolve and leave team",
    leave: "Leave team",
    dissolveConfirm: "You're the only member. The team will be dissolved. Continue?",
    leaveConfirm: "Really leave the team?",
    notVerified: {
      captain: "Not verified yet? As captain, you need verification for scrims.",
      player: "Not verified yet? Verify to count towards the “Fully verified” badge.",
    },
    toVerification: "Go to verification",
    settings: "Team settings",
    settingsCaptainOnly: "Only your captain can change the team settings.",
    settingsBanned: "The settings can't be changed in a banned team.",
  },
);

/** The head of both team tabs. */
export const teamHeaderMessages = dictionary(
  {
    tabsLabel: "Team",
    teamTab: "Team",
    membersTab: "Mitglieder",
    /** Opens the team settings dialog, for the captain (SPEC N-31). */
    settings: "Team-Einstellungen",
    bannedCaptain:
      "Dieses Team ist gesperrt. Die anderen Mitglieder können es verlassen und ein neues gründen oder einem anderen beitreten. Danach kannst du es als letztes Mitglied auflösen.",
    banned:
      "Dieses Team ist gesperrt. Du kannst es verlassen und ein neues gründen oder einem anderen beitreten.",
  },
  {
    tabsLabel: "Team",
    teamTab: "Team",
    membersTab: "Members",
    settings: "Team settings",
    bannedCaptain:
      "This team is banned. The other members can leave it and create a new team or join another one. After that, you can dissolve it as the last member.",
    banned: "This team is banned. You can leave it and create a new team or join another one.",
  },
);

/** /team/new. */
export const newTeamPageMessages = dictionary(
  {
    backToTeam: "Zurück zum Team",
    heading: "Neues Team",
    intro: (full: number, max: number, count: number, limit: number) =>
      `${deTeamRules(full, max)} Du bist in ${count} von ${limit} Teams.`,
    requestMoreTeams: "Mehr Teams beantragen",
  },
  {
    backToTeam: "Back to the team",
    heading: "New team",
    intro: (full, max, count, limit) =>
      `${enTeamRules(full, max)} You're in ${count} of ${limit} ${limit === 1 ? "team" : "teams"}.`,
    requestMoreTeams: "Request more teams",
  },
);

/** Creating or joining a team: /team without a team and /team/new. */
export const newTeamFormsMessages = dictionary(
  {
    createHeading: "Team gründen",
    createSubmit: "Team gründen",
    showOnLanding: "Team auf der Startseite zeigen",
    showOnLandingHint:
      "Alle Besucher sehen dann Logo, Name, Hochschulen, Team-Rang und Zuverlässigkeit, keine Mitglieder. Später in den Team-Einstellungen änderbar.",
    oplNeedsProfile: (link: LinkRender) => (
      <>Mit eurem Team bei OPL verknüpfen? Verknüpfe zuerst {link("dein OPL-Profil")}.</>
    ),
    or: "oder",
    joinHeading: "Team beitreten",
    joinHint: "Frag deinen Captain nach dem Einladungslink und öffne ihn. Oder füge ihn hier ein:",
  },
  {
    createHeading: "Create a team",
    createSubmit: "Create team",
    showOnLanding: "Show the team on the home page",
    showOnLandingHint:
      "All visitors then see its logo, name, universities, team rank and reliability, but no members. You can change this later in the team settings.",
    oplNeedsProfile: (link: LinkRender) => (
      <>Link with your team on OPL? First link {link("your OPL profile")}.</>
    ),
    or: "or",
    joinHeading: "Join a team",
    joinHint: "Ask your captain for the invite link and open it. Or paste it here:",
  },
);

/** Name and tag of a team (create and edit). */
export const teamFieldsMessages = dictionary(
  {
    name: "Teamname",
    namePlaceholder: "z. B. Mannheim Mavericks",
    tag: "Kürzel",
    tagHint: (min: number, max: number) => `${min}–${max} Zeichen`,
    tagPlaceholder: "MAV",
  },
  {
    name: "Team name",
    namePlaceholder: "e.g. Mannheim Mavericks",
    tag: "Tag",
    tagHint: (min, max) => `${min}–${max} characters`,
    tagPlaceholder: "MAV",
  },
);

/** /team/members. */
export const teamMembersMessages = dictionary(
  {
    heading: "Mitglieder",
    columns: {
      member: "Mitglied",
      role: "Rolle",
      rank: "Rang",
      joined: "Beigetreten",
      status: "Status",
    },
    actions: "Aktionen",
    status: {
      VERIFIED: "Verifiziert",
      PENDING: "In Prüfung",
      UNVERIFIED: "Nicht verifiziert",
      // Members who need none (getMyTeam: coaches who are not captain, SPEC N-1).
      NOT_NEEDED: "Nicht nötig",
    },
    captain: "Captain",
    you: "Du",
    makeCaptain: "Zum Captain",
    makeCaptainConfirm: (name: string) =>
      `${name} zum Captain machen? Du bist danach normales Mitglied.`,
    remove: "Entfernen",
    removeConfirm: (name: string) => `${name} aus dem Team entfernen?`,
  },
  {
    heading: "Members",
    columns: {
      member: "Member",
      role: "Role",
      rank: "Rank",
      joined: "Joined",
      status: "Status",
    },
    actions: "Actions",
    status: {
      VERIFIED: "Verified",
      PENDING: "Under review",
      UNVERIFIED: "Not verified",
      NOT_NEEDED: "Not needed",
    },
    captain: "Captain",
    you: "You",
    makeCaptain: "Make captain",
    makeCaptainConfirm: (name) => `Make ${name} captain? You'll be a regular member afterwards.`,
    remove: "Remove",
    removeConfirm: (name) => `Remove ${name} from the team?`,
  },
);

/** The table of the team roles' rights on /team/members (mirrors ARCHITECTURE §7 and §5.17). */
export const rolesTableMessages = dictionary(
  {
    heading: "Rollen und Rechte",
    intro:
      "Jedes Mitglied ist Spieler, Ersatz oder Coach; der Captain hat zusätzlich eine dieser Rollen. Für Scrims braucht nur der Captain eine Verifizierung; verifizierte Spieler und Ersatzspieler zählen für das Abzeichen „Vollständig verifiziert“.",
    right: "Recht",
    roles: { captain: "Captain", player: "Spieler", substitute: "Ersatz", coach: "Coach" },
    yes: "ja",
    no: "nein",
    byRole: "je nach Rolle",
    defaultOn: "Standard an",
    optional: "wählbar",
    rights: {
      badge: "Zählt für das Abzeichen „Vollständig verifiziert“, wenn verifiziert",
      ownRank: "Eigener Rang zählt für den Team-Rang",
      seeRanks: "Ränge der Mitglieder sehen",
      seeActivity: "Scrims, Anfragen und Bewerbungen des Teams sehen",
      scrimNotifications: "Benachrichtigungen zu Scrims (Buchung, Absage, Erinnerung, Feedback)",
      requestNotifications: "Benachrichtigungen zu Anfragen und Bewerbungen",
      messages: "Nachrichten mit anderen Teams lesen, schreiben, eigene löschen und fremde melden",
      messageNotifications: "Benachrichtigung über neue Nachrichten anderer Teams",
      requests:
        "Anfragen erstellen (auch wöchentliche) und beenden, bewerben, bestätigen, absagen, Feedback geben",
      directRequests:
        "Direktanfragen stellen, annehmen und ablehnen, feste Partnerschaften beenden",
      readyToday: "„Heute spielbereit“ melden und beenden",
      editTeam: "Team, Logos und Links bearbeiten, Einladungslink",
      listTeam: "Team in der Teams-Liste zeigen oder ausblenden",
      showcaseTeam: "Team auf der Startseite zeigen oder nicht",
      oplTeam: "Team mit OPL verknüpfen oder die Verknüpfung lösen",
      oplRoster: "Sehen, wer aus dem Team im OPL-Kader steht",
      verifiedApplicants: "Bewerbungen auf vollständig verifizierte Teams beschränken",
      manageMembers: "Rollen setzen, Mitglieder entfernen, Captain übertragen",
      linkChannel: "Team-Channel verknüpfen (/setup)",
      leave: "Team verlassen",
      moreTeams: "In weiteren Teams sein und das aktive Team wechseln",
    },
    footnoteVerified: "¹ Nur, wenn der Captain selbst verifiziert ist.",
    footnoteLeave:
      "² Erst nach Übertragung der Captain-Rolle; als einziges Mitglied löst der Captain das Team damit auf.",
  },
  {
    heading: "Roles and permissions",
    intro:
      "Every member is a player, substitute or coach; the captain also has one of these roles. Only the captain needs verification for scrims; verified players and substitutes count towards the “Fully verified” badge.",
    right: "Permission",
    roles: { captain: "Captain", player: "Player", substitute: "Substitute", coach: "Coach" },
    yes: "yes",
    no: "no",
    byRole: "depends on role",
    defaultOn: "on by default",
    optional: "optional",
    rights: {
      badge: "Counts towards the “Fully verified” badge, if verified",
      ownRank: "Own rank counts towards the team rank",
      seeRanks: "See the members' ranks",
      seeActivity: "See the team's scrims, requests and applications",
      scrimNotifications: "Notifications about scrims (booking, cancellation, reminder, feedback)",
      requestNotifications: "Notifications about requests and applications",
      messages: "Read and write messages with other teams, delete own ones and report others",
      messageNotifications: "Notifications about new messages from other teams",
      requests:
        "Create requests (also weekly ones) and end them, apply, accept, cancel, give feedback",
      directRequests: "Send, accept and decline direct requests, end fixed partnerships",
      readyToday: "Announce and end “Ready today”",
      editTeam: "Edit team, logos and links, invite link",
      listTeam: "Show or hide the team on the teams list",
      showcaseTeam: "Show the team on the home page or not",
      oplTeam: "Link the team with OPL or unlink it",
      oplRoster: "See who from the team is in the OPL roster",
      verifiedApplicants: "Admit only fully verified teams as applicants",
      manageMembers: "Set roles, remove members, hand over captain",
      linkChannel: "Link the team channel (/setup)",
      leave: "Leave team",
      moreTeams: "Be in more teams and switch the active team",
    },
    footnoteVerified: "¹ Only if the captain is verified themselves.",
    footnoteLeave:
      "² Only after handing over the captain role; as the only member, the captain dissolves the team by leaving.",
  },
);

/** /join/<code>. */
export const joinPageMessages = dictionary(
  {
    invitation: "Einladung",
    invalidHeading: "Dieser Link ist ungültig",
    invalidHint: "Frag deinen Captain nach einem neuen Einladungslink.",
    teamRank: "Teamrang",
    members: (count: number) => (count === 1 ? "1 Mitglied" : `${count} Mitglieder`),
    alreadyMember: "Du bist schon in diesem Team.",
    toTeam: "Zum Team",
    switchTo: (team: string) => `Zu ${team} wechseln`,
    requestMoreTeams: "Mehr Teams beantragen",
    full: "Das Team ist voll.",
    join: "Team beitreten",
  },
  {
    invitation: "Invitation",
    invalidHeading: "This link is invalid",
    invalidHint: "Ask your captain for a new invite link.",
    teamRank: "Team rank",
    members: (count) => (count === 1 ? "1 member" : `${count} members`),
    alreadyMember: "You're already in this team.",
    toTeam: "Go to the team",
    switchTo: (team) => `Switch to ${team}`,
    requestMoreTeams: "Request more teams",
    full: "The team is full.",
    join: "Join team",
  },
);

/** The external link icons next to a team's name. */
export const teamLinksMessages = dictionary(
  { linkLabel: (platform: string, team: string) => `${platform} von ${team}` },
  { linkLabel: (platform, team) => `${platform} of ${team}` },
);

/** Errors and flash toasts of the team actions. */
export const teamActionMessages = dictionary(
  {
    chooseImage: "Bitte wähle ein Bild aus.",
    welcome: (team: string) => `Willkommen bei ${team}`,
    linksSaved: "Links gespeichert",
    listed: "Das Team steht jetzt in der Teams-Liste",
    unlisted: "Das Team ist aus der Teams-Liste ausgeblendet",
    onLanding: "Das Team darf jetzt auf der Startseite stehen",
    offLanding: "Das Team steht nicht mehr auf der Startseite",
    verifiedApplicantsOnly: "Ab jetzt lasst ihr nur vollständig verifizierte Teams zu",
    allApplicants: "Ab jetzt lasst ihr alle Teams zu",
    dissolved: "Du hast das Team aufgelöst",
    left: "Du hast das Team verlassen",
    oplLinked: "Das Team ist mit OPL verknüpft",
    oplUnlinked: "Die OPL-Verknüpfung des Teams ist gelöst",
  },
  {
    chooseImage: "Please choose an image.",
    welcome: (team) => `Welcome to ${team}`,
    linksSaved: "Links saved",
    listed: "Your team is now on the teams list",
    unlisted: "Your team is hidden from the teams list",
    onLanding: "Your team may now appear on the home page",
    offLanding: "Your team no longer appears on the home page",
    verifiedApplicantsOnly: "From now on you admit only fully verified teams",
    allApplicants: "From now on you admit all teams",
    dissolved: "You dissolved the team",
    left: "You left the team",
    oplLinked: "Your team is linked with OPL",
    oplUnlinked: "Your team is no longer linked with OPL",
  },
);
