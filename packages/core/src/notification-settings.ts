// Notification settings per person (SPEC N-14, ARCHITECTURE §5.17): Discord and mail per type,
// with defaults that keep the behaviour from before Phase 18.
import { NotifType, type StaffRole, prisma } from "@uni-scrims/db";
import type { Locale } from "../config/locale.ts";
import type { Db } from "./db.ts";
import { NOTIFICATION_SETTING_LABELS } from "./i18n/notification-settings.ts";
import { lockUser } from "./locks.ts";
import {
  PLAYER_NOTIFICATION_TYPES,
  STAFF_NOTIFICATION_TYPES,
  isStaffType,
  staffTypesFor,
} from "./notification-types.ts";
import { findOwnTeams, isCaptainOf, requireUser } from "./permissions.ts";
import { notificationPreferencesSchema, parseInput } from "./schemas.ts";
import { notDeletedUserWhere } from "./users.ts";

/**
 * Who a type goes to: the person itself, the team's captain, every member of the team, or since
 * Phase 37 every staff member whose role sees the case (§5.35).
 */
export type NotificationAudience = "SELF" | "CAPTAIN" | "TEAM" | "STAFF";

export type ChannelSettings = { discord: boolean; email: boolean };

export type StoredChannels = { discord: boolean | null; email: boolean | null };

export type NotificationCategoryKey = "verification" | "requests" | "scrims" | "messages" | "team";

/**
 * The categories of the settings page, every type in exactly one of them, in this order. Titles and
 * labels: i18n/notification-settings.ts.
 */
export const NOTIFICATION_CATEGORIES: {
  key: NotificationCategoryKey;
  types: { type: NotifType; audience: Exclude<NotificationAudience, "STAFF"> }[];
}[] = [
  {
    key: "verification",
    types: [{ type: NotifType.VERIFICATION_RESULT, audience: "SELF" }],
  },
  {
    key: "requests",
    types: [
      { type: NotifType.APPLICATION_RECEIVED, audience: "CAPTAIN" },
      { type: NotifType.APPLICATION_REJECTED, audience: "CAPTAIN" },
      { type: NotifType.REQUEST_DELETED, audience: "CAPTAIN" },
      { type: NotifType.REQUEST_EXPIRED, audience: "CAPTAIN" },
      { type: NotifType.DIRECT_REQUEST_RECEIVED, audience: "CAPTAIN" },
      { type: NotifType.DIRECT_REQUEST_DECLINED, audience: "CAPTAIN" },
      { type: NotifType.PARTNERSHIP_ENDED, audience: "CAPTAIN" },
    ],
  },
  {
    key: "scrims",
    types: [
      { type: NotifType.SCRIM_BOOKED, audience: "TEAM" },
      { type: NotifType.SCRIM_CANCELLED, audience: "TEAM" },
      { type: NotifType.REMINDER_24H, audience: "TEAM" },
      { type: NotifType.REMINDER_1H, audience: "TEAM" },
      { type: NotifType.FEEDBACK_PROMPT, audience: "TEAM" },
    ],
  },
  {
    // Phase 32 (SPEC N-28): like the scrim types, every member may switch it on.
    key: "messages",
    types: [{ type: NotifType.MESSAGE_RECEIVED, audience: "TEAM" }],
  },
  {
    key: "team",
    types: [{ type: NotifType.CHANNEL_BROKEN, audience: "CAPTAIN" }],
  },
];

const SETTINGS = new Map<NotifType, { audience: NotificationAudience }>([
  ...NOTIFICATION_CATEGORIES.flatMap((category) => category.types).map(
    (item) => [item.type, item] as const,
  ),
  ...STAFF_NOTIFICATION_TYPES.map(({ type }) => [type, { audience: "STAFF" as const }] as const),
]);

export function notificationAudience(type: NotifType): NotificationAudience {
  return SETTINGS.get(type)!.audience;
}

/** The label of a type on the settings page and in the mail that it switches. */
export function notificationSettingLabel(type: NotifType, locale: Locale): string {
  return NOTIFICATION_SETTING_LABELS[locale][type];
}

/** Where a mail says it can be switched off. */
export const NOTIFICATION_SETTINGS_PATH = "/account/notifications";

/**
 * Without a choice (§5.17): mail off; Discord on, for the scrim types only for the captain of the
 * team in question, as before Phase 18.
 */
export function defaultChannels(type: NotifType, isCaptain: boolean): ChannelSettings {
  return { discord: notificationAudience(type) === "TEAM" ? isCaptain : true, email: false };
}

/**
 * The stored choice where there is one, otherwise the default for this role. Staff types never go
 * by mail (§5.35).
 */
export function effectiveChannels(
  type: NotifType,
  isCaptain: boolean,
  stored: StoredChannels | null | undefined,
): ChannelSettings {
  const defaults = defaultChannels(type, isCaptain);
  return {
    discord: stored?.discord ?? defaults.discord,
    email: isStaffType(type) ? false : (stored?.email ?? defaults.email),
  };
}

/**
 * Whether any notification of the person still goes to Discord with these stored choices: the
 * player types for this role and the staff types of the person's role (§5.1: otherwise the DM
 * banner is reset).
 */
export function discordAnywhere(
  isCaptain: boolean,
  staffRole: StaffRole | null,
  stored: ReadonlyMap<NotifType, StoredChannels>,
): boolean {
  return [...PLAYER_NOTIFICATION_TYPES, ...staffTypesFor(staffRole)].some(
    (type) => effectiveChannels(type, isCaptain, stored.get(type)).discord,
  );
}

/**
 * The defaults the settings page works with (§5.20); sending decides per team (§5.17). The captain
 * defaults only for a captain of every own team. With teams of both kinds no default holds for all
 * of them: the page shows the member defaults, and a changed scrim box is stored as a choice of its
 * own, so it applies to every team.
 */
async function captainRoles(user: { id: string }, db: Db = prisma) {
  const teams = await findOwnTeams(user.id, db);
  const captainOf = teams.filter((team) => isCaptainOf(user, team)).length;
  return {
    isCaptain: captainOf > 0 && captainOf === teams.length,
    mixedRoles: captainOf > 0 && captainOf < teams.length,
  };
}

/** The settings page: per category and type the values in effect and whether they are defaults. */
export async function getNotificationPreferences(userId: string) {
  const user = await requireUser(userId);
  const { isCaptain, mixedRoles } = await captainRoles(user);
  const stored = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
  const byType = new Map(stored.map((row) => [row.type, row]));
  return {
    isCaptain,
    /** Captain in some own teams and not in others: the page says what the defaults mean. */
    mixedRoles,
    categories: NOTIFICATION_CATEGORIES.map((category) => ({
      key: category.key,
      types: category.types.map((item) => {
        const row = byType.get(item.type);
        return {
          ...item,
          ...effectiveChannels(item.type, isCaptain, row),
          defaults: defaultChannels(item.type, isCaptain),
          stored: { discord: row?.discord ?? null, email: row?.email ?? null },
        };
      }),
    })),
  };
}

/**
 * Saves the settings form (SPEC N-14). Only what changed against the values the form showed is
 * written; a changed value that lands on the default of the current role becomes null, so whoever
 * becomes captain later gets the captain defaults. `shownAsCaptain` is the role the form was shown
 * with, so a role change between showing and saving leaves untouched boxes as they are. With
 * Discord off for every type, dmFailedAt is reset: the banner would otherwise never go away (§5.1).
 */
export async function setNotificationPreferences(input: {
  userId: string;
  preferences: unknown;
  shownAsCaptain?: boolean;
}): Promise<void> {
  const preferences = parseInput(notificationPreferencesSchema, input.preferences);
  await prisma.$transaction(async (tx) => {
    // Under the user lock, so a save cannot leave rows for an account deleted meanwhile (§4).
    await lockUser(tx, input.userId);
    const user = await requireUser(input.userId, tx);
    const { isCaptain, mixedRoles } = await captainRoles(user, tx);
    const stored = await tx.notificationPreference.findMany({ where: { userId: user.id } });
    const byType = new Map<NotifType, StoredChannels>(stored.map((row) => [row.type, row]));
    for (const type of PLAYER_NOTIFICATION_TYPES) {
      const row = byType.get(type);
      const next = nextStored(
        type,
        isCaptain,
        { discord: row?.discord ?? null, email: row?.email ?? null },
        preferences[type],
        input.shownAsCaptain ?? isCaptain,
        mixedRoles,
      );
      if (next.discord !== (row?.discord ?? null) || next.email !== (row?.email ?? null)) {
        await writeStored(tx, user.id, type, next, row !== undefined);
      }
      byType.set(type, next);
    }
    if (!discordAnywhere(isCaptain, user.staffRole, byType)) await clearDmFailure(tx, user.id);
  });
}

async function clearDmFailure(db: Db, userId: string): Promise<void> {
  await db.user.updateMany({ where: notDeletedUserWhere(userId), data: { dmFailedAt: null } });
}

/**
 * After the staff settings were saved (Phase 37, §5.35), in their transaction: with Discord off for
 * every type the person gets, dmFailedAt is reset (§5.1), as in setNotificationPreferences.
 */
export async function clearDmFailureIfSilent(
  db: Db,
  user: { id: string; staffRole: StaffRole | null },
): Promise<void> {
  const { isCaptain } = await captainRoles(user, db);
  const stored = await db.notificationPreference.findMany({ where: { userId: user.id } });
  const byType = new Map<NotifType, StoredChannels>(stored.map((row) => [row.type, row]));
  if (!discordAnywhere(isCaptain, user.staffRole, byType)) await clearDmFailure(db, user.id);
}

/**
 * The stored values after a save; see setNotificationPreferences. With `mixedRoles` (§5.20) a
 * changed Discord box of a scrim type stays an explicit choice, as its default differs per team.
 */
export function nextStored(
  type: NotifType,
  isCaptain: boolean,
  stored: StoredChannels,
  submitted: ChannelSettings,
  shownAsCaptain: boolean = isCaptain,
  mixedRoles: boolean = false,
): StoredChannels {
  const current = effectiveChannels(type, shownAsCaptain, stored);
  const defaults = defaultChannels(type, isCaptain);
  const next = { ...stored };
  for (const channel of ["discord", "email"] as const) {
    if (submitted[channel] === current[channel]) continue;
    const perTeam = mixedRoles && channel === "discord" && notificationAudience(type) === "TEAM";
    next[channel] =
      !perTeam && submitted[channel] === defaults[channel] ? null : submitted[channel];
  }
  return next;
}

/** One person's stored choice for a type; both null deletes the row. */
export async function writeStored(
  db: Db,
  userId: string,
  type: NotifType,
  next: StoredChannels,
  exists: boolean,
): Promise<void> {
  if (next.discord === null && next.email === null) {
    if (exists)
      await db.notificationPreference.delete({ where: { userId_type: { userId, type } } });
    return;
  }
  await db.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, ...next },
    update: next,
  });
}
