// Titles and names of the notification settings (SPEC N-14) in both languages (§5.21). The mail
// footer of the bot names the setting with the same label.
import type { NotifType } from "@uni-scrims/db";
import { dictionary } from "../../config/locale.ts";
import type { NotificationCategoryKey } from "../notification-settings.ts";

export const NOTIFICATION_CATEGORY_TITLES = dictionary<Record<NotificationCategoryKey, string>>(
  {
    verification: "Verifizierung",
    requests: "Anfragen und Bewerbungen",
    scrims: "Scrims",
    messages: "Nachrichten",
    team: "Team",
  },
  {
    verification: "Verification",
    requests: "Requests and applications",
    scrims: "Scrims",
    messages: "Messages",
    team: "Team",
  },
);

export const NOTIFICATION_SETTING_LABELS = dictionary<Record<NotifType, string>>(
  {
    VERIFICATION_RESULT: "Ergebnis der Prüfung",
    APPLICATION_RECEIVED: "Bewerbung erhalten",
    APPLICATION_REJECTED: "Bewerbung abgelehnt",
    REQUEST_DELETED: "Anfrage gelöscht",
    REQUEST_EXPIRED: "Anfrage abgelaufen",
    SCRIM_BOOKED: "Scrim gebucht",
    SCRIM_CANCELLED: "Scrim abgesagt",
    REMINDER_24H: "Erinnerung 24 Stunden vorher",
    REMINDER_1H: "Erinnerung 1 Stunde vorher",
    FEEDBACK_PROMPT: "Bitte um Feedback",
    CHANNEL_BROKEN: "Team-Channel nicht mehr verknüpft",
    DIRECT_REQUEST_RECEIVED: "Direktanfrage erhalten",
    DIRECT_REQUEST_DECLINED: "Direktanfrage abgelehnt",
    PARTNERSHIP_ENDED: "Feste Partnerschaft beendet",
    MESSAGE_RECEIVED: "Neue Nachricht eines anderen Teams",
  },
  {
    VERIFICATION_RESULT: "Result of the review",
    APPLICATION_RECEIVED: "Application received",
    APPLICATION_REJECTED: "Application rejected",
    REQUEST_DELETED: "Request deleted",
    REQUEST_EXPIRED: "Request expired",
    SCRIM_BOOKED: "Scrim booked",
    SCRIM_CANCELLED: "Scrim cancelled",
    REMINDER_24H: "Reminder 24 hours before",
    REMINDER_1H: "Reminder 1 hour before",
    FEEDBACK_PROMPT: "Feedback request",
    CHANNEL_BROKEN: "Team channel no longer linked",
    DIRECT_REQUEST_RECEIVED: "Direct request received",
    DIRECT_REQUEST_DECLINED: "Direct request declined",
    PARTNERSHIP_ENDED: "Fixed partnership ended",
    MESSAGE_RECEIVED: "New message from another team",
  },
);
