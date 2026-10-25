// Texts of the client components of the team pages (§5.21). Client components import only this
// file, client.ts and common.ts, so the server dictionaries stay out of the browser bundle.
import { dictionary } from "@uni-scrims/core/config/locale";

/** Upload of a team logo. */
export const teamLogoFormMessages = dictionary(
  {
    chooseImage: "Bitte wähle ein Bild aus.",
    tooLarge: "Die Datei ist größer als 2 MB.",
    pickOther: "Anderes Bild wählen",
    pick: "Bild wählen",
    noFile: "Keine Datei gewählt",
    upload: "Logo hochladen",
  },
  {
    chooseImage: "Please choose an image.",
    tooLarge: "The file is larger than 2 MB.",
    pickOther: "Choose another image",
    pick: "Choose image",
    noFile: "No file chosen",
    upload: "Upload logo",
  },
);

/** Pasting an invite link. */
export const joinLinkFormMessages = dictionary(
  { inviteLink: "Einladungslink", join: "Beitreten" },
  { inviteLink: "Invite link", join: "Join" },
);

/** The captain's choice of a member's role. */
export const memberRoleSelectMessages = dictionary(
  { roleOf: (name: string) => `Rolle von ${name}`, save: "Speichern" },
  { roleOf: (name) => `Role of ${name}`, save: "Save" },
);
