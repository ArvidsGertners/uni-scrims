// Texts of the client components of the admin area (§5.21), one section per component. Like
// client.ts, this file must not import server dictionaries.
import { dictionary } from "@uni-scrims/core/config/locale";

/** Decision on a certificate (SPEC P0-2). */
export const decisionFormMessages = dictionary(
  {
    assignUniversity: "Hochschule zuordnen (optional)",
    noAssignment: "Keine Zuordnung",
    reason: "Grund (nur beim Ablehnen)",
    approve: "Freigeben",
    reject: "Ablehnen",
  },
  {
    assignUniversity: "Assign university (optional)",
    noAssignment: "No assignment",
    reason: "Reason (only when rejecting)",
    approve: "Approve",
    reject: "Reject",
  },
);

/** Decision on a dispute (SPEC Flow C 5). */
export const disputeFormMessages = dictionary(
  {
    played: "Gespielt",
    noShowBy: (team: string) => `No-Show von ${team}`,
    unclear: "Unklar",
    /** `decision`: the label of the pressed button. */
    confirm: (decision: string | null | undefined) =>
      `Entscheidung „${decision}“ speichern? Sie ist endgültig.`,
  },
  {
    played: "Played",
    noShowBy: (team) => `No-show by ${team}`,
    unclear: "Unclear",
    confirm: (decision) => `Save the decision “${decision}”? It is final.`,
  },
);

/** Decision on a request for more teams (SPEC N-17). */
export const teamLimitFormMessages = dictionary(
  {
    newLimit: "Neues Limit",
    accept: "Annehmen",
    reject: "Ablehnen",
    /** `decision`: the label of the pressed button. */
    confirm: (decision: string | null | undefined) => `Antrag „${decision}“? Das ist endgültig.`,
  },
  {
    newLimit: "New limit",
    accept: "Accept",
    reject: "Reject",
    confirm: (decision) => `${decision} this request? This is final.`,
  },
);

/** Setup of the staff 2FA (SPEC N-4). */
export const twoFactorSetupMessages = dictionary(
  {
    password: "Dein Passwort",
    next: "Weiter",
    scanTitle: "1. QR-Code scannen",
    scanHint:
      "Scanne den Code mit einer Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator oder die Passwörter-App deines Geräts). Ohne Kamera gibst du den Schlüssel von Hand ein.",
    backupTitle: "2. Backup-Codes aufbewahren",
    backupHint:
      "Jeder Code funktioniert einmal, falls du dein Gerät verlierst. Speichere sie in deinem Passwort-Manager; wir zeigen sie nur jetzt.",
    codeTitle: "3. Code eingeben",
    codeLabel: "Code aus der App",
    submit: "Einrichten",
  },
  {
    password: "Your password",
    next: "Continue",
    scanTitle: "1. Scan the QR code",
    scanHint:
      "Scan the code with an authenticator app (e.g. Aegis, 2FAS, Google Authenticator or your device's passwords app). Without a camera, enter the key by hand.",
    backupTitle: "2. Keep the backup codes",
    backupHint:
      "Each code works once, in case you lose your device. Save them in your password manager; we only show them now.",
    codeTitle: "3. Enter the code",
    codeLabel: "Code from the app",
    submit: "Set up",
  },
);
