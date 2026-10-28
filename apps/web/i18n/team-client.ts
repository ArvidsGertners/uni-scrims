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

/** The optional OPL team when founding (SPEC N-35). */
export const oplTeamFieldMessages = dictionary(
  {
    label: "OPL-Team",
    optional: "optional",
    prefill: "Von OPL übernehmen",
    linkFirst: "Bitte füge zuerst den Link zu eurem OPL-Team ein.",
    hint: "Verknüpft das Team gleich mit eurem Team bei OPL; dafür musst du im Kader stehen. „Von OPL übernehmen“ trägt Name und Kürzel ein, beide kannst du ändern.",
  },
  {
    label: "OPL team",
    optional: "optional",
    prefill: "Take over from OPL",
    linkFirst: "Please paste the link to your OPL team first.",
    hint: "Links the team with your team on OPL right away; you have to be in its roster. “Take over from OPL” fills in name and tag, you can change both.",
  },
);
