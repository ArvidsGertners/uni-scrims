// Texts of the team pages and invitations (§5.21): /team, /team/members, /team/new, /join/<code>,
// the team fields and the team link icons.
import { dictionary } from "@uni-scrims/core/config/locale";
import type { LogoBackground } from "@uni-scrims/db";
import type { ReactNode } from "react";

/** Renders an inline link of a sentence with the given label. */
type LinkRender = (label: string) => ReactNode;

/** The start of the texts on creating or joining a team. */
const deTeamRules = (ready: number, max: number) =>
  `Gründe ein Team oder tritt über einen Einladungslink bei. Ein Team braucht mindestens ${ready} verifizierte Spieler und hat höchstens ${max} Mitglieder.`;
const enTeamRules = (ready: number, max: number) =>
  `Create a team or join one with an invite link. A team needs at least ${ready} verified players and has at most ${max} members.`;

/** /team. */
export const teamPageMessages = dictionary(
  {
    noTeamHeading: "Du bist noch in keinem Team",
    noTeamIntro: (ready: number, max: number) =>
      `${deTeamRules(ready, max)} Das geht auch, während deine Verifizierung noch läuft.`,
    members: "Mitglieder",
    rosterFull: "Kader voll",
    roomFor: (count: number) => `Platz für ${count} weitere`,
    verified: "Verifiziert",
    readyToPlay: (ready: number) => `Spielbereit (mindestens ${ready})`,
    missingToReady: (missing: number, ready: number) => `Noch ${missing} bis ${ready}`,
    played: "Gespielt",
    nextScrim: "Nächstes Scrim",
    nextScrimDetails: (time: string, opponent: string, format: string) =>
      `${time} · gegen ${opponent} · ${format}`,
    noNextScrim: "Noch keins geplant. Zum Board",
    notReadyNotice: (ready: number, missing: number) =>
      `Ihr braucht mindestens ${ready} verifizierte Spieler, um Scrims anzufragen oder euch zu bewerben. Es fehlen noch ${missing}. Ersatzspieler zählen mit, Coaches nicht.`,
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
      "In der Teams-Liste sehen alle Eingeloggten euer Team mit den Discord-Namen, Rollen und Rängen der Mitglieder.",
    hideFromList: "Aus der Teams-Liste nehmen",
    showInList: "In der Teams-Liste zeigen",
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
    },
    saveLinks: "Links speichern",
    noLinks: "Noch keine Links.",
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
    notVerified: "Noch nicht verifiziert?",
    toVerification: "Zur Verifizierung",
  },
  {
    noTeamHeading: "You're not in a team yet",
    noTeamIntro: (ready, max) =>
      `${enTeamRules(ready, max)} You can do this while your verification is still in progress.`,
    members: "Members",
    rosterFull: "Roster full",
    roomFor: (count) => `Room for ${count} more`,
    verified: "Verified",
    readyToPlay: (ready) => `Ready to play (at least ${ready})`,
    missingToReady: (missing, ready) => `${missing} more to reach ${ready}`,
    played: "Played",
    nextScrim: "Next scrim",
    nextScrimDetails: (time, opponent, format) => `${time} · vs ${opponent} · ${format}`,
    noNextScrim: "Nothing planned yet. Go to the board",
    notReadyNotice: (ready, missing) =>
      `You need at least ${ready} verified players to request scrims or apply. You're still ${missing} short. Substitutes count, coaches don't.`,
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
      "On the teams list, everyone signed in sees your team with the members' Discord names, roles and ranks.",
    hideFromList: "Remove from the teams list",
    showInList: "Show on the teams list",
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
    },
    saveLinks: "Save links",
    noLinks: "No links yet.",
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
    notVerified: "Not verified yet?",
    toVerification: "Go to verification",
  },
);

/** The head of both team tabs. */
export const teamHeaderMessages = dictionary(
  {
    tabsLabel: "Team",
    teamTab: "Team",
    membersTab: "Mitglieder",
    bannedCaptain:
      "Dieses Team ist gesperrt. Die anderen Mitglieder können es verlassen und ein neues gründen oder einem anderen beitreten. Danach kannst du es als letztes Mitglied auflösen.",
    banned:
      "Dieses Team ist gesperrt. Du kannst es verlassen und ein neues gründen oder einem anderen beitreten.",
  },
  {
    tabsLabel: "Team",
    teamTab: "Team",
    membersTab: "Members",
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
    intro: (ready: number, max: number, count: number, limit: number) =>
      `${deTeamRules(ready, max)} Du bist in ${count} von ${limit} Teams.`,
    requestMoreTeams: "Mehr Teams beantragen",
  },
  {
    backToTeam: "Back to the team",
    heading: "New team",
    intro: (ready, max, count, limit) =>
      `${enTeamRules(ready, max)} You're in ${count} of ${limit} ${limit === 1 ? "team" : "teams"}.`,
    requestMoreTeams: "Request more teams",
  },
);

/** Creating or joining a team: /team without a team and /team/new. */
export const newTeamFormsMessages = dictionary(
  {
    createHeading: "Team gründen",
    createSubmit: "Team gründen",
    or: "oder",
    joinHeading: "Team beitreten",
    joinHint: "Frag deinen Captain nach dem Einladungslink und öffne ihn. Oder füge ihn hier ein:",
  },
  {
    createHeading: "Create a team",
    createSubmit: "Create team",
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
      "Jedes Mitglied ist Spieler, Ersatz oder Coach; der Captain hat zusätzlich eine dieser Rollen. Coaches brauchen keine Verifizierung.",
    right: "Recht",
    roles: { captain: "Captain", player: "Spieler", substitute: "Ersatz", coach: "Coach" },
    yes: "ja",
    no: "nein",
    byRole: "je nach Rolle",
    defaultOn: "Standard an",
    optional: "wählbar",
    rights: {
      readiness: "Zählt zur Spielbereitschaft, wenn verifiziert",
      ownRank: "Eigener Rang zählt für den Team-Rang",
      seeRanks: "Ränge der Mitglieder sehen",
      seeActivity: "Scrims, Anfragen und Bewerbungen des Teams sehen",
      scrimNotifications: "Benachrichtigungen zu Scrims (Buchung, Absage, Erinnerung, Feedback)",
      requestNotifications: "Benachrichtigungen zu Anfragen und Bewerbungen",
      requests: "Anfragen erstellen, bewerben, bestätigen, absagen, Feedback geben",
      editTeam: "Team, Logos und Links bearbeiten, Einladungslink",
      listTeam: "Team in der Teams-Liste zeigen oder ausblenden",
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
      "Every member is a player, substitute or coach; the captain also has one of these roles. Coaches don't need verification.",
    right: "Permission",
    roles: { captain: "Captain", player: "Player", substitute: "Substitute", coach: "Coach" },
    yes: "yes",
    no: "no",
    byRole: "depends on role",
    defaultOn: "on by default",
    optional: "optional",
    rights: {
      readiness: "Counts towards being ready to play, if verified",
      ownRank: "Own rank counts towards the team rank",
      seeRanks: "See the members' ranks",
      seeActivity: "See the team's scrims, requests and applications",
      scrimNotifications: "Notifications about scrims (booking, cancellation, reminder, feedback)",
      requestNotifications: "Notifications about requests and applications",
      requests: "Create requests, apply, accept, cancel, give feedback",
      editTeam: "Edit team, logos and links, invite link",
      listTeam: "Show or hide the team on the teams list",
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
    dissolved: "Du hast das Team aufgelöst",
    left: "Du hast das Team verlassen",
  },
  {
    chooseImage: "Please choose an image.",
    welcome: (team) => `Welcome to ${team}`,
    linksSaved: "Links saved",
    listed: "Your team is now on the teams list",
    unlisted: "Your team is hidden from the teams list",
    dissolved: "You dissolved the team",
    left: "You left the team",
  },
);
