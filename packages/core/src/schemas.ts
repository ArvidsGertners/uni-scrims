// Zod schemas for user input, shared by core and the web forms.
import {
  FeedbackOutcome,
  MemberRole,
  type NotifType,
  Rank,
  ScrimFormat,
  ThemePreference,
} from "@uni-scrims/db";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, REAL_NAME_MAX } from "../config/account.ts";
import {
  PLAYER_NOTIFICATION_TYPES,
  STAFF_NOTIFICATION_TYPES,
  type StaffNotifType,
} from "./notification-types.ts";
import {
  APPLICATION_MESSAGE_MAX,
  MESSAGE_MAX,
  RATING_MAX,
  RATING_MIN,
  REQUEST_NOTE_MAX,
  SERIES_MAX_WEEKS,
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
import { daysBetweenDates, isStartSlot, isValidDateString } from "./time.ts";

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

/**
 * The notifications form (Phase 18, §5.17): Discord and mail for every player type, none left out;
 * the staff types have their own form (Phase 37, §5.35).
 */
export const notificationPreferencesSchema = z.record(
  z.enum(PLAYER_NOTIFICATION_TYPES as [NotifType, ...NotifType[]]),
  // A missing type fails here, as a value that is not an object.
  z.object({ discord: z.boolean(), email: z.boolean() }, INCOMPLETE_SETTINGS),
  INCOMPLETE_SETTINGS,
);

/** The staff notifications form (Phase 37, §5.35): Discord per type of the own areas. */
export const staffNotificationPreferencesSchema = z.partialRecord(
  z.enum(STAFF_NOTIFICATION_TYPES.map(({ type }) => type) as [StaffNotifType, ...StaffNotifType[]]),
  z.boolean(INCOMPLETE_SETTINGS),
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

export { APPLICATION_MESSAGE_MAX, MESSAGE_MAX, RATING_MAX, RATING_MIN, REQUEST_NOTE_MAX };

/** Empty optional text becomes null. */
function optionalText(max: number, message: PlainMessageKey) {
  return z
    .string(key("invalidText"))
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);
}

/** Fields a request and a ready window share (SPEC P0-4, N-27). */
const scrimFields = {
  format: z.enum(ScrimFormat, key("chooseFormat")),
  rankMin: z.enum(Rank, key("chooseRankMin")),
  rankMax: z.enum(Rank, key("chooseRankMax")),
  maps: z
    .array(mapSchema, key("unknownMap"))
    .default([])
    .refine((maps) => new Set(maps).size === maps.length, key("mapTwice")),
};

const startTimeSchema = z.string(key("timeMissing")).refine(isStartSlot, key("timeOutOfRange"));

/** The minimum rank is not above the maximum rank. */
function rankOrderValid(input: { rankMin: Rank; rankMax: Rank }): boolean {
  return rankValue(input.rankMin) <= rankValue(input.rankMax);
}

const RANK_ORDER_ISSUE = { message: key("rankMinAboveMax"), path: ["rankMin"] };

export const requestInputSchema = z
  .object({
    date: z.string(key("dateMissing")).refine(isValidDateString, key("dateInvalid")),
    time: startTimeSchema,
    ...scrimFields,
    note: optionalText(REQUEST_NOTE_MAX, key("noteTooLong")),
    // Repeat weekly up to this Berlin date, like `date` the day of the actual start (SPEC N-25);
    // empty = a single request. In the base object: zod cannot extend a refined schema.
    repeatUntil: z
      .string(key("repeatUntilInvalid"))
      .nullish()
      .transform((value) => value || null),
  })
  .refine(rankOrderValid, RANK_ORDER_ISSUE)
  .superRefine((input, ctx) => {
    // An invalid date already has its issue, which does not stop this refinement in zod 4.
    if (input.repeatUntil === null || !isValidDateString(input.date)) return;
    const issue = (message: PlainMessageKey) =>
      ctx.addIssue({ code: "custom", path: ["repeatUntil"], message: key(message) });
    if (!isValidDateString(input.repeatUntil)) return issue("repeatUntilInvalid");
    // At least one more date, at most SERIES_MAX_WEEKS weeks after the first.
    const days = daysBetweenDates(input.date, input.repeatUntil);
    if (days < 7) return issue("repeatUntilTooEarly");
    if (days > SERIES_MAX_WEEKS * 7) return issue("repeatUntilTooLate");
  });

export type RequestInput = z.input<typeof requestInputSchema>;

/**
 * "Heute spielbereit" (SPEC N-27): the earliest and the latest start time of this evening as
 * "HH:MM"; whether they are still ahead, core checks with `now` (§5.29).
 */
export const readyWindowInputSchema = z
  .object({ from: startTimeSchema, to: startTimeSchema, ...scrimFields })
  .refine(rankOrderValid, RANK_ORDER_ISSUE);

export type ReadyWindowInput = z.input<typeof readyWindowInputSchema>;

export const applicationMessageSchema = optionalText(
  APPLICATION_MESSAGE_MAX,
  key("messageTooLong"),
);

/** A message between teams (SPEC N-28): plain text, trimmed, not empty. */
export const messageBodySchema = z
  .string(key("messageEmpty"))
  .trim()
  .min(1, key("messageEmpty"))
  .max(MESSAGE_MAX, key("messageBodyTooLong"));

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
