// Texts of the scrim and request pages (§5.21): board, own scrims, scrim and request details.
import { MAX_OPEN_REQUESTS, SERIES_MAX_WEEKS } from "@uni-scrims/core/config/limits";
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ProblemKind } from "@uni-scrims/core";
import type { ReactNode } from "react";

/** Texts used on several of the scrim and request pages. */
export const scrimSharedMessages = dictionary(
  {
    noTeam: (link: (label: string) => ReactNode) => (
      <>Du bist in keinem Team. {link("Team gründen oder beitreten")}</>
    ),
    createRequest: "Anfrage erstellen",
    backToBoard: "Zurück zum Board",
    versus: (team: string) => `gegen ${team}`,
    /** A note or message of a team, quoted. */
    quoted: (text: string) => `„${text}“`,
    view: "Ansehen",
    teamRank: "Teamrang",
    date: "Datum",
    time: "Uhrzeit",
    format: "Format",
    maps: "Maps",
    applicationsWithCount: (count: number) => `Bewerbungen (${count})`,
  },
  {
    noTeam: (link) => <>You&apos;re not in a team. {link("Create or join a team")}</>,
    createRequest: "Create request",
    backToBoard: "Back to the board",
    versus: (team) => `vs ${team}`,
    quoted: (text) => `“${text}”`,
    view: "View",
    teamRank: "Team rank",
    date: "Date",
    time: "Time",
    format: "Format",
    maps: "Maps",
    applicationsWithCount: (count) => `Applications (${count})`,
  },
);

/** Board and own scrims (app/scrims/page.tsx). */
export const scrimsPageMessages = dictionary(
  {
    title: "Scrims",
    feedbackDue: (opponent: string) => `Wie war's gegen ${opponent}?`,
    giveQuickFeedback: "Kurzes Feedback geben",
    tabs: {
      board: "Board",
      upcoming: "Anstehend",
      requests: "Anfragen",
      applications: "Bewerbungen",
      past: "Vergangen",
    },
    /** Empty own tabs: title, text and the label of the link. */
    empty: {
      upcoming: {
        title: "Noch keine bestätigten Scrims",
        text: "Bewirb dich auf dem Board oder erstelle eine eigene Anfrage.",
        cta: "Zum Board",
      },
      requests: {
        title: "Keine offenen Anfragen",
        text: "Erstelle eine Anfrage, damit sich andere Uni-Teams bei euch bewerben können.",
        cta: "Anfrage erstellen",
      },
      applications: {
        title: "Noch keine Bewerbungen",
        text: "Auf dem Board findest du offene Anfragen anderer Teams.",
        cta: "Zum Board",
      },
      past: {
        title: "Noch keine gespielten Scrims",
        text: "Nach jedem Match kannst du hier kurz Feedback geben.",
        cta: "Zum Board",
      },
    },
    requestCount: (count: number) => (count === 1 ? "1 Anfrage" : `${count} Anfragen`),
    // Board filter.
    allDays: "Alle Tage",
    rankInRange: "Rang im Bereich",
    ownRank: "euer Rang",
    filter: "Filtern",
    reset: "Zurücksetzen",
    // Empty board.
    noMatchingOtherRequests: "Keine passenden Anfragen anderer Teams",
    noOtherRequests: "Noch keine anderen Anfragen",
    ownRequestsElsewhere:
      "Eure eigenen Anfragen stehen unter „Anfragen“. Anfragen anderer Uni-Teams erscheinen hier.",
    noMatchingRequests: "Keine passenden Anfragen",
    noOpenRequests: "Gerade keine offenen Anfragen",
    noRequestsForFilter: "Für diese Filter gibt es gerade keine offenen Anfragen anderer Teams.",
    beFirstTeam:
      "Seid das erste Team auf dem Board. Andere Uni-Teams können sich dann bei euch bewerben.",
    // Own tabs.
    confirmed: "Bestätigt",
    open: "Offen",
    pending: "Ausstehend",
    giveFeedback: "Feedback geben",
    feedbackGiven: "Feedback gegeben",
    // Weekly series in the requests tab (SPEC N-25).
    weekly: "Wöchentlich",
    seriesTitle: "Wiederkehrende Anfragen",
    noOpenRequestNow: "Gerade keine offene Anfrage. Die nächste erscheint von selbst.",
    everyWeekday: (day: string) => `Jeden ${day}`,
    nextDate: "Nächster Termin",
    lastDate: "Letzter Termin",
    postsAt: (when: string) => `Die Anfrage erscheint am ${when} auf dem Board.`,
    postsSoon: "Die Anfrage erscheint in Kürze auf dem Board.",
    /** Why the due request waits; the sweeper tries again until `minutes` before the start. */
    blocked: {
      REQUEST_LIMIT: (minutes: number) =>
        `Wartet: Ihr habt schon ${MAX_OPEN_REQUESTS} offene Anfragen. Die Anfrage erscheint, sobald eine frei wird, bis ${minutes} Minuten vor dem Start; sonst entfällt dieser Termin.`,
      CAPTAIN_NOT_VERIFIED: (minutes: number) =>
        `Wartet: Euer Captain ist nicht verifiziert. Die Anfrage erscheint, sobald das geklärt ist, bis ${minutes} Minuten vor dem Start; sonst entfällt dieser Termin.`,
    } as Partial<Record<ProblemKind, (minutes: number) => string>>,
    endSeries: "Serie beenden",
    confirmEndSeries:
      "Serie beenden? Es erscheinen keine weiteren Anfragen. Offene Anfragen bleiben stehen.",
  },
  {
    title: "Scrims",
    feedbackDue: (opponent) => `How did it go against ${opponent}?`,
    giveQuickFeedback: "Give quick feedback",
    tabs: {
      board: "Board",
      upcoming: "Upcoming",
      requests: "Requests",
      applications: "Applications",
      past: "Past",
    },
    empty: {
      upcoming: {
        title: "No confirmed scrims yet",
        text: "Apply on the board or create a request of your own.",
        cta: "Go to the board",
      },
      requests: {
        title: "No open requests",
        text: "Create a request so other university teams can apply to you.",
        cta: "Create request",
      },
      applications: {
        title: "No applications yet",
        text: "You'll find open requests from other teams on the board.",
        cta: "Go to the board",
      },
      past: {
        title: "No scrims played yet",
        text: "After each match you can give some quick feedback here.",
        cta: "Go to the board",
      },
    },
    requestCount: (count) => (count === 1 ? "1 request" : `${count} requests`),
    allDays: "All days",
    rankInRange: "Rank in range",
    ownRank: "your rank",
    filter: "Filter",
    reset: "Reset",
    noMatchingOtherRequests: "No matching requests from other teams",
    noOtherRequests: "No other requests yet",
    ownRequestsElsewhere:
      "Your own requests are under “Requests”. Requests from other university teams show up here.",
    noMatchingRequests: "No matching requests",
    noOpenRequests: "No open requests right now",
    noRequestsForFilter: "There are no open requests from other teams for these filters right now.",
    beFirstTeam: "Be the first team on the board. Other university teams can then apply to you.",
    confirmed: "Confirmed",
    open: "Open",
    pending: "Pending",
    giveFeedback: "Give feedback",
    feedbackGiven: "Feedback given",
    weekly: "Weekly",
    seriesTitle: "Recurring requests",
    noOpenRequestNow: "No open request right now. The next one shows up by itself.",
    everyWeekday: (day) => `Every ${day}`,
    nextDate: "Next date",
    lastDate: "Last date",
    postsAt: (when) => `The request goes on the board on ${when}.`,
    postsSoon: "The request goes on the board shortly.",
    blocked: {
      REQUEST_LIMIT: (minutes) =>
        `Waiting: you already have ${MAX_OPEN_REQUESTS} open requests. The request shows up as soon as one is free, until ${minutes} minutes before the start; otherwise this date is dropped.`,
      CAPTAIN_NOT_VERIFIED: (minutes) =>
        `Waiting: your captain isn't verified. The request shows up once that's sorted, until ${minutes} minutes before the start; otherwise this date is dropped.`,
    },
    endSeries: "End series",
    confirmEndSeries: "End the series? No more requests will be posted. Open requests stay.",
  },
);

/** The board without login (app/(public)/board/page.tsx, SPEC N-24); filters from scrimsPage. */
export const publicBoardMessages = dictionary(
  {
    title: "Scrim-Board",
    lead: "Offene Scrim-Anfragen von Uni-Teams. Um eine Anfrage anzusehen und euch zu bewerben, brauchst du ein Konto; für Scrims muss der Captain eures Teams verifiziert sein.",
    createAccount: "Konto erstellen",
    signIn: "Anmelden",
    noRequestsForFilter: "Für diese Filter gibt es gerade keine offenen Anfragen.",
    beFirstTeam:
      "Mit einem Konto postet ihr eure eigene Anfrage, und andere Uni-Teams bewerben sich bei euch.",
  },
  {
    title: "Scrim board",
    lead: "Open scrim requests from university teams. To view a request and apply, you need an account; for scrims, your team's captain has to be verified.",
    createAccount: "Create account",
    signIn: "Sign in",
    noRequestsForFilter: "There are no open requests for these filters right now.",
    beFirstTeam:
      "With an account, you post your own request and other university teams apply to you.",
  },
);

/** A scrim (app/scrims/[id]/page.tsx), including its feedback screen. */
export const scrimDetailMessages = dictionary(
  {
    /** The back link to the scrims page. */
    scrims: "Scrims",
    otherOwnTeam: (team: string) => `Dieser Scrim gehört zu deinem Team ${team}.`,
    feedback: "Feedback",
    feedbackTitle: (opponent: string) => `Wie war das Scrim gegen ${opponent}?`,
    feedbackIntro: (deadline: string) =>
      `Pro Team eine Antwort, danach nicht mehr änderbar. Möglich bis ${deadline}.`,
    cancelled: (byUs: boolean, late: boolean) =>
      `Abgesagt ${byUs ? "von euch" : "vom Gegner"}${late ? " (kurzfristig)" : ""}.`,
    noShow: (team: string) => `No-Show von ${team}.`,
    disputed: "Streitfall, der Admin entscheidet.",
    scrim: "Scrim",
    youRequested: "Ihr habt die Anfrage gestellt.",
    youApplied: "Ihr habt euch beworben.",
    requestNote: "Notiz zur Anfrage",
    feedbackGiven: (outcome: string) => `Feedback gegeben: ${outcome}`,
    cancelScrim: "Scrim absagen",
    cancelWouldBeLate: "Weniger als 24 Stunden vor Start: Die Absage zählt als kurzfristig.",
    cancelPossible: "Möglich bis zum Start. Das andere Team bekommt eine Discord-Nachricht.",
    confirmLateCancel: "Scrim absagen? Die Absage zählt als kurzfristig.",
    confirmCancel: "Scrim absagen?",
  },
  {
    scrims: "Scrims",
    otherOwnTeam: (team) => `This scrim belongs to your team ${team}.`,
    feedback: "Feedback",
    feedbackTitle: (opponent) => `How was the scrim against ${opponent}?`,
    feedbackIntro: (deadline) =>
      `One answer per team, and it can't be changed afterwards. You can answer until ${deadline}.`,
    cancelled: (byUs, late) =>
      `Cancelled ${byUs ? "by you" : "by the opponent"}${late ? " (late)" : ""}.`,
    noShow: (team) => `No-show by ${team}.`,
    disputed: "Dispute: an admin will decide.",
    scrim: "Scrim",
    youRequested: "You posted the request.",
    youApplied: "You applied.",
    requestNote: "Note on the request",
    feedbackGiven: (outcome) => `Feedback given: ${outcome}`,
    cancelScrim: "Cancel scrim",
    cancelWouldBeLate: "Less than 24 hours before the start: this counts as a late cancellation.",
    cancelPossible: "You can cancel until the start. The other team gets a Discord message.",
    confirmLateCancel: "Cancel the scrim? This counts as a late cancellation.",
    confirmCancel: "Cancel the scrim?",
  },
);

/** Toasts of the scrim actions (app/scrims/actions.ts). */
export const scrimActionMessages = dictionary(
  { feedbackThanks: "Danke für dein Feedback!" },
  { feedbackThanks: "Thanks for your feedback!" },
);

/** Creating a request (app/requests/new/page.tsx). */
export const newRequestMessages = dictionary(
  {
    /** Links to where a reason can be fixed. */
    problemLinks: {
      notCaptain: "Wer ist euer Captain?",
      captainNotVerified: "Zur Verifizierung",
      requestLimit: "Zu euren Anfragen",
    },
    title: "Scrim-Anfrage erstellen",
    forTeam: (team: string) => `Für ${team}: `,
    intro:
      "Deine Anfrage erscheint sofort auf dem Board. Ihr entscheidet, welches Team ihr annehmt.",
    publish: "Anfrage veröffentlichen",
    cancel: "Abbrechen",
    /** A start time option, e.g. "20:00 Uhr". */
    timeOption: (slot: string) => `${slot} Uhr`,
    timeHint:
      "Uhrzeiten in deutscher Zeit. Für Starts nach Mitternacht (00:00–01:45) das Datum des Folgetags wählen, z. B. Mittwoch 01:00 für die Nacht von Dienstag auf Mittwoch.",
    pleaseChoose: "Bitte wählen …",
    mapsHint: "optional · sonst freie Wahl",
    rankRange: "Rangbereich",
    rankFrom: "Rang von",
    rankTo: "Rang bis",
    to: "bis",
    note: "Notiz",
    notePlaceholder: "Was sollten andere Teams wissen?",
    repeatUntil: "Jede Woche wiederholen bis",
    repeatNever: "Nicht wiederholen",
    repeatHint: `Optional, höchstens ${SERIES_MAX_WEEKS} Wochen. Die nächste Anfrage erscheint jeweils von selbst, sobald die vorige beginnt, am selben Wochentag zur selben Uhrzeit.`,
  },
  {
    problemLinks: {
      notCaptain: "Who is your captain?",
      captainNotVerified: "Go to verification",
      requestLimit: "Go to your requests",
    },
    title: "Create a scrim request",
    forTeam: (team) => `For ${team}: `,
    intro: "Your request shows up on the board right away. You decide which team you accept.",
    publish: "Publish request",
    cancel: "Cancel",
    timeOption: (slot) => slot,
    timeHint:
      "Times are German time. For starts after midnight (00:00–01:45), pick the date of the next day, e.g. Wednesday 01:00 for the night of Tuesday to Wednesday.",
    pleaseChoose: "Please choose…",
    mapsHint: "optional · otherwise any map",
    rankRange: "Rank range",
    rankFrom: "Rank from",
    rankTo: "Rank to",
    to: "to",
    note: "Note",
    notePlaceholder: "What should other teams know?",
    repeatUntil: "Repeat every week until",
    repeatNever: "Don't repeat",
    repeatHint: `Optional, at most ${SERIES_MAX_WEEKS} weeks. Each next request shows up by itself as soon as the previous one starts, on the same weekday at the same time.`,
  },
);

/** A request (app/requests/[id]/page.tsx). */
export const requestDetailMessages = dictionary(
  {
    nextSteps: [
      "Das Team sieht eure Bewerbung und nimmt ein Team an.",
      "Bei einer Zusage bekommst du eine Discord-Nachricht.",
      "Die Lobby klärt ihr direkt auf Discord.",
    ],
    expired: "Abgelaufen",
    rank: "Rang",
    backToOwnRequests: "Zurück zu euren Anfragen",
    otherOwnTeam: (team: string) =>
      `Diese Anfrage gehört zu deinem Team ${team}. Die Bewerbungen siehst du als ${team}.`,
    teamNote: "Notiz vom Team",
    toBookedScrim: "Zum gebuchten Scrim",
    apply: "Bewerben",
    /** The team name comes in bold from the page. */
    applyingAs: (team: ReactNode, members: number) => (
      <>
        Du bewirbst dich als {team} · {members === 1 ? "1 Mitglied" : `${members} Mitglieder`}
      </>
    ),
    outOfRange:
      "Euer Team-Rang liegt außerhalb des gewünschten Bereichs. Ihr könnt euch trotzdem bewerben, das Team entscheidet.",
    applyNow: "Jetzt bewerben",
    messageTo: (team: string) => `Nachricht an ${team}`,
    messagePlaceholder: "z. B. Wir sind Gold 3 bis Platinum 2 und können ab 18:30.",
    // The own application by status.
    applicationSent: "Bewerbung gesendet",
    applicationAccepted: "Bewerbung angenommen",
    applicationRejected: "Bewerbung abgelehnt",
    applicationWithdrawn: "Bewerbung zurückgezogen",
    sentText: (team: string) =>
      `${team} sieht jetzt eure Bewerbung. Bei einer Zusage bekommst du eine Discord-Nachricht.`,
    acceptedText: "Der Scrim ist gebucht. Die Lobby klärt ihr direkt auf Discord.",
    rejectedText: "Diese Bewerbung wurde nicht angenommen.",
    withdrawnText: "Auf diese Anfrage könnt ihr euch nicht erneut bewerben.",
    withdrawApplication: "Bewerbung zurückziehen",
    confirmWithdrawApplication:
      "Bewerbung zurückziehen? Ihr könnt euch danach nicht erneut auf diese Anfrage bewerben.",
    nextStepsTitle: "So geht's weiter",
    // The applications to the own request.
    noApplications:
      "Noch keine Bewerbungen. Du bekommst eine Discord-Nachricht, sobald sich ein Team bewirbt.",
    cannotAccept: (problem: string) => `Annehmen geht gerade nicht: ${problem}`,
    accepted: "Angenommen",
    rankOutOfRange: "Teamrang außerhalb des Bereichs",
    accept: "Annehmen",
    confirmAccept: (team: string) =>
      `Scrim mit ${team} buchen? Alle anderen Bewerbungen werden abgelehnt.`,
    withdrawRequest: "Anfrage zurückziehen",
    confirmWithdrawRequest: "Anfrage zurückziehen? Offene Bewerbungen werden abgelehnt.",
    weekly: "Wöchentlich",
    confirmWithdrawWeeklyRequest:
      "Anfrage zurückziehen? Offene Bewerbungen werden abgelehnt. Die wöchentliche Anfrage läuft weiter, nur dieser Termin entfällt.",
  },
  {
    nextSteps: [
      "The team sees your application and accepts one team.",
      "If you're accepted, you'll get a Discord message.",
      "You sort out the lobby directly on Discord.",
    ],
    expired: "Expired",
    rank: "Rank",
    backToOwnRequests: "Back to your requests",
    otherOwnTeam: (team) =>
      `This request belongs to your team ${team}. You'll see the applications as ${team}.`,
    teamNote: "Note from the team",
    toBookedScrim: "Go to the booked scrim",
    apply: "Apply",
    applyingAs: (team, members) => (
      <>
        You&apos;re applying as {team} · {members === 1 ? "1 member" : `${members} members`}
      </>
    ),
    outOfRange:
      "Your team rank is outside the requested range. You can still apply; the team decides.",
    applyNow: "Apply now",
    messageTo: (team) => `Message to ${team}`,
    messagePlaceholder: "e.g. We're Gold 3 to Platinum 2 and can play from 18:30.",
    applicationSent: "Application sent",
    applicationAccepted: "Application accepted",
    applicationRejected: "Application rejected",
    applicationWithdrawn: "Application withdrawn",
    sentText: (team) =>
      `${team} can now see your application. If you're accepted, you'll get a Discord message.`,
    acceptedText: "The scrim is booked. You sort out the lobby directly on Discord.",
    rejectedText: "This application wasn't accepted.",
    withdrawnText: "You can't apply to this request again.",
    withdrawApplication: "Withdraw application",
    confirmWithdrawApplication:
      "Withdraw the application? You won't be able to apply to this request again.",
    nextStepsTitle: "What happens next",
    noApplications: "No applications yet. You'll get a Discord message as soon as a team applies.",
    cannotAccept: (problem) => `You can't accept right now: ${problem}`,
    accepted: "Accepted",
    rankOutOfRange: "Team rank outside the range",
    accept: "Accept",
    confirmAccept: (team) =>
      `Book the scrim with ${team}? All other applications will be rejected.`,
    withdrawRequest: "Withdraw request",
    confirmWithdrawRequest: "Withdraw the request? Open applications will be rejected.",
    weekly: "Weekly",
    confirmWithdrawWeeklyRequest:
      "Withdraw the request? Open applications will be rejected. The weekly request goes on; only this date is dropped.",
  },
);

/** Toasts of the request actions (app/requests/actions.ts). */
export const requestActionMessages = dictionary(
  {
    requestCreated: "Anfrage ist jetzt auf dem Board",
    seriesCreated: "Wöchentliche Anfrage ist jetzt auf dem Board",
    seriesEnded: "Serie beendet",
    requestWithdrawn: "Anfrage zurückgezogen",
    applicationSent: (team: string | undefined) =>
      team ? `Bewerbung an ${team} gesendet` : "Bewerbung gesendet",
    applicationAccepted: (team: string | undefined) =>
      `${team ?? "Team"} angenommen – beide Teams bekommen eine Discord-Nachricht.`,
  },
  {
    requestCreated: "Your request is now on the board",
    seriesCreated: "Your weekly request is now on the board",
    seriesEnded: "Series ended",
    requestWithdrawn: "Request withdrawn",
    applicationSent: (team) => (team ? `Application sent to ${team}` : "Application sent"),
    applicationAccepted: (team) => `${team ?? "Team"} accepted – both teams get a Discord message.`,
  },
);

/** Board card of a request (components/request-card.tsx). */
export const requestCardMessages = dictionary(
  {
    applicationCount: (count: number) =>
      count === 0 ? "Noch keine Bewerbungen" : count === 1 ? "1 Bewerbung" : `${count} Bewerbungen`,
    applied: "Beworben",
  },
  {
    applicationCount: (count) =>
      count === 0 ? "No applications yet" : count === 1 ? "1 application" : `${count} applications`,
    applied: "Applied",
  },
);
