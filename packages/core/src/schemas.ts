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
import { LOCALES } from "../config/locale.ts";
import { mapSchema } from "../config/maps.ts";
import { DomainError } from "./errors.ts";
import { type Message, type PlainMessageKey, isMessageKey, key, msg } from "./i18n/render.ts";
import { rankValue } from "./ranks.ts";
import { type TeamLinkPlatform, parseTeamLink } from "./team-links.ts";
import { isStartSlot, isValidDateString } from "./time.ts";

export { TEAM_NAME_MAX, TEAM_NAME_MIN, TEAM_TAG_MAX, TEAM_TAG_MIN };

export const teamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(TEAM_NAME_MIN, key("teamNameTooShort"))
    .max(TEAM_NAME_MAX, key("teamNameTooLong")),
  tag: z
    .string()
    .trim()
    .min(TEAM_TAG_MIN, key("teamTagLength"))
    .max(TEAM_TAG_MAX, key("teamTagLength")),
});

export type TeamInput = z.infer<typeof teamInputSchema>;

/** One field of the external links form; empty removes the link (SPEC N-15). */
function teamLinkField(platform: TeamLinkPlatform) {
  return z
    .string(key("invalidLink"))
    .optional()
    .transform((raw, ctx) => {
      const result = parseTeamLink(platform, raw ?? "");
      if ("error" in result) {
        // The platform as a parameter of the message (§5.21); parseInput takes it from params.
        ctx.addIssue({ code: "custom", message: result.error.key, params: result.error.params });
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

/** Whether the team is shown in the teams list (Phase 24, §5.23). */
export const teamListedSchema = z.boolean(key("invalidInput"));

/** Whether only fully verified teams may apply (Phase 25, §5.24). */
export const teamVerifiedApplicantsOnlySchema = z.boolean(key("invalidInput"));

export const memberRoleSchema = z.enum(MemberRole, key("chooseRole"));

/** The own rank in the settings (Phase 20, §5.19); empty means none. */
export const playerRankSchema = z
  .union([z.enum(Rank), z.literal("")], key("chooseRank"))
  .transform((rank) => rank || null);

/** The language of the own account (Phase 22, §5.21). */
export const localeSchema = z.enum(LOCALES, key("chooseLanguage"));

/** The design of the own account (Phase 17, §5.16). */
export const themePreferenceSchema = z.enum(ThemePreference, key("chooseTheme"));

const INCOMPLETE_SETTINGS = key("settingsIncomplete");

/** The notifications form (Phase 18, §5.17): Discord and mail for every type, none left out. */
export const notificationPreferencesSchema = z.record(
  z.enum(NotifType),
  // A missing type fails here, as a value that is not an object.
  z.object({ discord: z.boolean(), email: z.boolean() }, INCOMPLETE_SETTINGS),
  INCOMPLETE_SETTINGS,
);

// ─── Accounts (Phase 7, §5.8) ─────────────────────────────────────────────────

export { PASSWORD_MAX, PASSWORD_MIN, REAL_NAME_MAX } from "../config/account.ts";

function realNamePart(missing: PlainMessageKey, tooLong: PlainMessageKey) {
  return z.string(missing).trim().min(1, missing).max(REAL_NAME_MAX, tooLong);
}

/** First and last name as on the enrolment certificate (SPEC N-3). */
export const realNameSchema = z.object({
  firstName: realNamePart("firstNameMissing", "firstNameTooLong"),
  lastName: realNamePart("lastNameMissing", "lastNameTooLong"),
});

/** Placeholders of Discord, seed and deleted accounts live here; nobody may claim one (§4, §5.8). */
const RESERVED_EMAIL_DOMAIN = "uniscrims.invalid";

/** A placeholder address under the reserved domain, never a real mailbox. */
export function isReservedEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return domain === RESERVED_EMAIL_DOMAIN || domain.endsWith(`.${RESERVED_EMAIL_DOMAIN}`);
}

export const emailSchema = z
  .string(key("emailMissing"))
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email(key("emailInvalid"))
      .max(254, key("emailInvalid"))
      .refine((email) => !isReservedEmail(email), key("emailInvalid")),
  );

export const passwordSchema = z
  .string(key("passwordMissing"))
  .min(PASSWORD_MIN, key("passwordTooShort"))
  .max(PASSWORD_MAX, key("passwordTooLong"));

export const registrationSchema = realNameSchema.extend({
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(true, key("consentRequired")),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

// ─── Requests, applications, feedback ─────────────────────────────────────────

export { APPLICATION_MESSAGE_MAX, RATING_MAX, RATING_MIN, REQUEST_NOTE_MAX };

/** Empty optional text becomes null. */
function optionalText(max: number, message: PlainMessageKey) {
  return z
    .string(key("invalidText"))
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);
}

export const requestInputSchema = z
  .object({
    date: z.string(key("dateMissing")).refine(isValidDateString, key("dateInvalid")),
    time: z.string(key("timeMissing")).refine(isStartSlot, key("timeOutOfRange")),
    format: z.enum(ScrimFormat, key("chooseFormat")),
    rankMin: z.enum(Rank, key("chooseRankMin")),
    rankMax: z.enum(Rank, key("chooseRankMax")),
    maps: z
      .array(mapSchema, key("unknownMap"))
      .default([])
      .refine((maps) => new Set(maps).size === maps.length, key("mapTwice")),
    note: optionalText(REQUEST_NOTE_MAX, key("noteTooLong")),
  })
  .refine((input) => rankValue(input.rankMin) <= rankValue(input.rankMax), {
    message: key("rankMinAboveMax"),
    path: ["rankMin"],
  });

export type RequestInput = z.input<typeof requestInputSchema>;

export const applicationMessageSchema = optionalText(
  APPLICATION_MESSAGE_MAX,
  key("messageTooLong"),
);

const RATING_RANGE_MESSAGE = key("ratingRange");

export const feedbackInputSchema = z
  .object({
    outcome: z.enum(FeedbackOutcome, key("chooseOutcome")),
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
        message: key("ratingOnlyPlayed"),
      });
    }
  });

export type FeedbackInput = z.input<typeof feedbackInputSchema>;

/**
 * The first issue of a failed parse as a DomainError. Its message is a key (key()); custom issues
 * carry the parameters of their key in params. Anything else, like zod's own English texts, becomes
 * "invalidInput".
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const text =
      issue && isMessageKey(issue.message)
        ? ({
            key: issue.message,
            params: issue.code === "custom" ? issue.params : undefined,
          } as Message)
        : msg("invalidInput");
    throw new DomainError("INVALID", text);
  }
  return parsed.data;
}
