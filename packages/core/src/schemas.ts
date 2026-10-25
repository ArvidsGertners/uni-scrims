// Zod schemas for user input, shared by core and the web forms.
import {
  FeedbackOutcome,
  MemberRole,
  NotifType,
  Rank,
  ScrimFormat,
  ThemePreference,
} from "@uni-scrims/db";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, REAL_NAME_MAX } from "../config/account.ts";
import {
  APPLICATION_MESSAGE_MAX,
  RATING_MAX,
  RATING_MIN,
  REQUEST_NOTE_MAX,
  TEAM_NAME_MAX,
  TEAM_NAME_MIN,
  TEAM_TAG_MAX,
  TEAM_TAG_MIN,
} from "../config/limits.ts";
import { mapSchema } from "../config/maps.ts";
import { DomainError } from "./errors.ts";
import { rankValue } from "./ranks.ts";
import { type TeamLinkPlatform, parseTeamLink } from "./team-links.ts";
import { isStartSlot, isValidDateString } from "./time.ts";

export { TEAM_NAME_MAX, TEAM_NAME_MIN, TEAM_TAG_MAX, TEAM_TAG_MIN };

export const teamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(TEAM_NAME_MIN, `Der Teamname braucht mindestens ${TEAM_NAME_MIN} Zeichen.`)
    .max(TEAM_NAME_MAX, `Der Teamname darf höchstens ${TEAM_NAME_MAX} Zeichen haben.`),
  tag: z
    .string()
    .trim()
    .min(TEAM_TAG_MIN, `Das Kürzel braucht ${TEAM_TAG_MIN} bis ${TEAM_TAG_MAX} Zeichen.`)
    .max(TEAM_TAG_MAX, `Das Kürzel braucht ${TEAM_TAG_MIN} bis ${TEAM_TAG_MAX} Zeichen.`),
});

export type TeamInput = z.infer<typeof teamInputSchema>;

/** One field of the external links form; empty removes the link (SPEC N-15). */
function teamLinkField(platform: TeamLinkPlatform) {
  return z
    .string("Ungültiger Link.")
    .optional()
    .transform((raw, ctx) => {
      const result = parseTeamLink(platform, raw ?? "");
      if ("error" in result) {
        ctx.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.url;
    });
}

export const teamLinksSchema = z.object({
  discord: teamLinkField("discord"),
  website: teamLinkField("website"),
  x: teamLinkField("x"),
  instagram: teamLinkField("instagram"),
  twitch: teamLinkField("twitch"),
  youtube: teamLinkField("youtube"),
  tiktok: teamLinkField("tiktok"),
});

export type TeamLinksInput = z.input<typeof teamLinksSchema>;

export const memberRoleSchema = z.enum(MemberRole, "Bitte wähle eine Rolle.");

/** The own rank in the settings (Phase 20, §5.19); empty means none. */
export const playerRankSchema = z
  .union([z.enum(Rank), z.literal("")], "Bitte wähle einen Rang.")
  .transform((rank) => rank || null);

/** The design of the own account (Phase 17, §5.16). */
export const themePreferenceSchema = z.enum(ThemePreference, "Bitte wähle ein Design.");

const INCOMPLETE_SETTINGS = "Die Einstellungen sind unvollständig. Bitte lade die Seite neu.";

/** The notifications form (Phase 18, §5.17): Discord and mail for every type, none left out. */
export const notificationPreferencesSchema = z.record(
  z.enum(NotifType),
  // A missing type fails here, as a value that is not an object.
  z.object({ discord: z.boolean(), email: z.boolean() }, INCOMPLETE_SETTINGS),
  INCOMPLETE_SETTINGS,
);

// ─── Accounts (Phase 7, §5.8) ─────────────────────────────────────────────────

export { PASSWORD_MAX, PASSWORD_MIN, REAL_NAME_MAX } from "../config/account.ts";

function realNamePart(label: string) {
  return z
    .string(`Bitte gib deinen ${label} an.`)
    .trim()
    .min(1, `Bitte gib deinen ${label} an.`)
    .max(REAL_NAME_MAX, `Dein ${label} darf höchstens ${REAL_NAME_MAX} Zeichen haben.`);
}

/** First and last name as on the enrolment certificate (SPEC N-3). */
export const realNameSchema = z.object({
  firstName: realNamePart("Vornamen"),
  lastName: realNamePart("Nachnamen"),
});

/** Placeholders of Discord, seed and deleted accounts live here; nobody may claim one (§4, §5.8). */
const RESERVED_EMAIL_DOMAIN = "uniscrims.invalid";

/** A placeholder address under the reserved domain, never a real mailbox. */
export function isReservedEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return domain === RESERVED_EMAIL_DOMAIN || domain.endsWith(`.${RESERVED_EMAIL_DOMAIN}`);
}

export const emailSchema = z
  .string("Bitte gib deine E-Mail-Adresse an.")
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email("Bitte gib eine gültige E-Mail-Adresse an.")
      .max(254)
      .refine((email) => !isReservedEmail(email), "Bitte gib eine gültige E-Mail-Adresse an."),
  );

export const passwordSchema = z
  .string("Bitte gib ein Passwort an.")
  .min(PASSWORD_MIN, `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`)
  .max(PASSWORD_MAX, `Das Passwort darf höchstens ${PASSWORD_MAX} Zeichen haben.`);

export const registrationSchema = realNameSchema.extend({
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(
    true,
    "Bitte bestätige, dass du mindestens 16 bist und die Datenschutzerklärung gelesen hast.",
  ),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

// ─── Requests, applications, feedback ─────────────────────────────────────────

export { APPLICATION_MESSAGE_MAX, RATING_MAX, RATING_MIN, REQUEST_NOTE_MAX };

/** Empty optional text becomes null. */
function optionalText(max: number, message: string) {
  return z
    .string("Ungültiger Text.")
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);
}

export const requestInputSchema = z
  .object({
    date: z
      .string("Bitte gib ein Datum an.")
      .refine(isValidDateString, "Bitte gib ein gültiges Datum an."),
    time: z
      .string("Bitte wähle eine Startzeit.")
      .refine(isStartSlot, "Bitte wähle eine Startzeit zwischen 10:00 und 01:45 Uhr."),
    format: z.enum(ScrimFormat, "Bitte wähle ein Format."),
    rankMin: z.enum(Rank, "Bitte wähle einen Mindestrang."),
    rankMax: z.enum(Rank, "Bitte wähle einen Höchstrang."),
    maps: z
      .array(mapSchema, "Unbekannte Map.")
      .default([])
      .refine((maps) => new Set(maps).size === maps.length, "Jede Map nur einmal auswählen."),
    note: optionalText(
      REQUEST_NOTE_MAX,
      `Die Notiz darf höchstens ${REQUEST_NOTE_MAX} Zeichen haben.`,
    ),
  })
  .refine((input) => rankValue(input.rankMin) <= rankValue(input.rankMax), {
    message: "Der Mindestrang darf nicht über dem Höchstrang liegen.",
    path: ["rankMin"],
  });

export type RequestInput = z.input<typeof requestInputSchema>;

export const applicationMessageSchema = optionalText(
  APPLICATION_MESSAGE_MAX,
  `Die Nachricht darf höchstens ${APPLICATION_MESSAGE_MAX} Zeichen haben.`,
);

const RATING_RANGE_MESSAGE = `Bitte bewerte den Gegner mit ${RATING_MIN} bis ${RATING_MAX} Sternen.`;

export const feedbackInputSchema = z
  .object({
    outcome: z.enum(FeedbackOutcome, "Bitte wähle aus, ob der Scrim stattgefunden hat."),
    rating: z
      .number(RATING_RANGE_MESSAGE)
      .int(RATING_RANGE_MESSAGE)
      .min(RATING_MIN, RATING_RANGE_MESSAGE)
      .max(RATING_MAX, RATING_RANGE_MESSAGE)
      .nullish(),
  })
  .superRefine((input, ctx) => {
    const played = input.outcome === FeedbackOutcome.PLAYED;
    if (played && input.rating == null) {
      ctx.addIssue({
        code: "custom",
        path: ["rating"],
        message: RATING_RANGE_MESSAGE,
      });
    }
    if (!played && input.rating != null) {
      ctx.addIssue({
        code: "custom",
        path: ["rating"],
        message: "Eine Bewertung gibt es nur, wenn der Scrim stattgefunden hat.",
      });
    }
  });

export type FeedbackInput = z.input<typeof feedbackInputSchema>;

/** First issue message of a failed parse as a DomainError. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("INVALID", parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  }
  return parsed.data;
}
