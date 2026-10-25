// Texts of the client components of the settings and the verification (§5.21). Client components
// import only this file and the other client dictionaries, so the server ones stay out of the bundle.
import { dictionary } from "@uni-scrims/core/config/locale";

/** "Konto löschen" with its confirmation dialog (SPEC P0-10); the consequences come from the page. */
export const deleteAccountDialogMessages = dictionary(
  {
    trigger: "Konto löschen",
    title: "Konto löschen?",
    irreversible: "Das lässt sich nicht rückgängig machen.",
    submit: "Konto endgültig löschen",
    cancel: "Abbrechen",
  },
  {
    trigger: "Delete account",
    title: "Delete account?",
    irreversible: "This can't be undone.",
    submit: "Delete account permanently",
    cancel: "Cancel",
  },
);

/** The three theme buttons (SPEC N-13); their labels come from the page. */
export const themeFormMessages = dictionary({ label: "Design" }, { label: "Theme" });

/** Discord and mail per notification (SPEC N-14). */
export const notificationFormMessages = dictionary(
  {
    channels: { discord: "Discord", email: "E-Mail" },
    /** Name of one checkbox: the notification and the channel. */
    checkbox: (label: string, channel: string) => `${label} per ${channel}`,
    save: "Speichern",
  },
  {
    channels: { discord: "Discord", email: "Email" },
    checkbox: (label: string, channel: string) => `${label} via ${channel}`,
    save: "Save",
  },
);

/** The upload of the certificate (SPEC P0-2). */
export const verificationFormMessages = dictionary(
  {
    fileTooLarge: "Die Datei ist größer als 5 MB.",
    university: "Hochschule",
    choose: "Bitte wählen …",
    otherUniversity: "Andere Hochschule …",
    otherUniversityName: "Name und Ort deiner Hochschule",
    remove: "Entfernen",
    chooseFile: "Datei auswählen",
    fileTypes: "PDF, JPG oder PNG · max. 5 MB",
    checksTitle: "Darauf achten wir",
    privacyTitle: "Was mit deinem Dokument passiert",
    privacyText:
      "Wir nutzen deine Bescheinigung nur, um zu prüfen, ob du studierst. Die Datei sehen nur Admins. Sie wird direkt nach der Prüfung gelöscht, spätestens nach 14 Tagen. Danach speichern wir nur Status, Hochschule, Dateityp, Dateigröße, einen Ablehnungsgrund, die Zeitpunkte und wer geprüft hat.",
    consent: "Ich habe diese Hinweise gelesen.",
    uploading: "Wird hochgeladen …",
    submit: "Zur Prüfung einreichen",
  },
  {
    fileTooLarge: "The file is larger than 5 MB.",
    university: "University",
    choose: "Please choose…",
    otherUniversity: "Other university…",
    otherUniversityName: "Name and city of your university",
    remove: "Remove",
    chooseFile: "Choose file",
    fileTypes: "PDF, JPG or PNG · max. 5 MB",
    checksTitle: "What we check",
    privacyTitle: "What happens to your document",
    privacyText:
      "We only use your certificate to check that you're a student. Only admins see the file. It's deleted right after the review, after 14 days at the latest. After that, we only store the status, university, file type, file size, a rejection reason, the times and who reviewed it.",
    consent: "I've read this information.",
    uploading: "Uploading…",
    submit: "Submit for review",
  },
);
