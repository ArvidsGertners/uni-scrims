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
    title: (team: string) => `Nachrichten mit ${team}`,
    /** The collapsed thread at an application: "Nachrichten · 3". */
    toggle: "Nachrichten",
    newBadge: "Neu",
    empty: "Noch keine Nachrichten. Sprecht hier Lobby, Uhrzeit oder Maps ab.",
    closed: "Dieser Verlauf ist geschlossen. Ihr könnt ihn weiter lesen.",
    unread: "Neu",
    placeholder: (team: string) => `Nachricht an ${team}`,
    label: "Nachricht",
    hint: "Enter sendet, Umschalt+Enter macht eine neue Zeile. Beide Teams sehen jede Nachricht.",
    send: "Senden",
    delete: "Löschen",
    confirmDelete: "Nachricht löschen? Sie verschwindet für beide Teams.",
    report: "Melden",
    confirmReport: "Nachricht melden? Ein Admin sieht sie sich an; sie bleibt bis dahin sichtbar.",
    reported: "Gemeldet",
    connecting: "Verbindung wird hergestellt …",
    you: "Du",
  },
  {
    title: (team) => `Messages with ${team}`,
    toggle: "Messages",
    newBadge: "New",
    empty: "No messages yet. Agree on lobby, time or maps here.",
    closed: "This conversation is closed. You can still read it.",
    unread: "New",
    placeholder: (team) => `Message to ${team}`,
    label: "Message",
    hint: "Enter sends, Shift+Enter starts a new line. Both teams see every message.",
    send: "Send",
    delete: "Delete",
    confirmDelete: "Delete this message? It disappears for both teams.",
    report: "Report",
    confirmReport: "Report this message? An admin will look at it; it stays visible until then.",
    reported: "Reported",
    connecting: "Connecting …",
    you: "You",
  },
);
