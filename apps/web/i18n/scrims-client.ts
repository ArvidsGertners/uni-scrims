// Texts of the client components of the scrim pages (§5.21), one section per component.
import { dictionary } from "@uni-scrims/core/config/locale";

/** app/scrims/[id]/feedback-form.tsx */
export const feedbackFormMessages = dictionary(
  {
    confirm: "Antwort abschicken? Sie lässt sich danach nicht mehr ändern.",
    tookPlace: "Hat das Scrim stattgefunden?",
    rating: "Wie bewertet ihr das Team?",
    submit: "Feedback senden",
  },
  {
    confirm: "Send your answer? It can't be changed afterwards.",
    tookPlace: "Did the scrim take place?",
    rating: "How do you rate the team?",
    submit: "Send feedback",
  },
);

/** components/message-thread.tsx and components/application-thread.tsx (SPEC N-28). */
export const messageThreadMessages = dictionary(
  {
    /** For screen readers: the whole panel. */
    title: (team: string) => `Nachrichten mit ${team}`,
    heading: "Nachrichten",
    withTeam: (team: string) => `mit ${team}`,
    live: "Live",
    connecting: "Verbindet …",
    /** The collapsed thread at an application: "Nachrichten · 3". */
    toggle: "Nachrichten",
    newBadge: "Neu",
    emptyTitle: "Noch keine Nachrichten",
    emptyText: "Sprecht hier Lobby, Uhrzeit und Maps ab. Beide Teams sehen jede Nachricht.",
    closed: "Dieser Verlauf ist geschlossen. Ihr könnt ihn weiter lesen.",
    unread: "Neu",
    placeholder: (team: string) => `Nachricht an ${team}`,
    label: "Nachricht",
    hint: "Enter sendet · Umschalt+Enter für eine neue Zeile",
    send: "Senden",
    delete: "Löschen",
    confirmDelete: "Nachricht löschen? Sie verschwindet für beide Teams.",
    report: "Melden",
    confirmReport: "Nachricht melden? Ein Admin sieht sie sich an; sie bleibt bis dahin sichtbar.",
    reported: "Gemeldet",
  },
  {
    title: (team) => `Messages with ${team}`,
    heading: "Messages",
    withTeam: (team) => `with ${team}`,
    live: "Live",
    connecting: "Connecting …",
    toggle: "Messages",
    newBadge: "New",
    emptyTitle: "No messages yet",
    emptyText: "Agree on lobby, time and maps here. Both teams see every message.",
    closed: "This conversation is closed. You can still read it.",
    unread: "New",
    placeholder: (team) => `Message to ${team}`,
    label: "Message",
    hint: "Enter sends · Shift+Enter for a new line",
    send: "Send",
    delete: "Delete",
    confirmDelete: "Delete this message? It disappears for both teams.",
    report: "Report",
    confirmReport: "Report this message? An admin will look at it; it stays visible until then.",
    reported: "Reported",
  },
);
