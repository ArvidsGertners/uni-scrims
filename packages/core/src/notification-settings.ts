// Notification settings per person (SPEC N-14, ARCHITECTURE §5.17): Discord and mail per type,
// with defaults that keep the behaviour from before Phase 18.
import { NotifType, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { lockUser } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireUser } from "./permissions.ts";
import { notificationPreferencesSchema, parseInput } from "./schemas.ts";
import { notDeletedUserWhere } from "./users.ts";

/** Who a type goes to: the person itself, the team's captain, or every member of the team. */
export type NotificationAudience = "SELF" | "CAPTAIN" | "TEAM";

export type ChannelSettings = { discord: boolean; email: boolean };

type StoredChannels = { discord: boolean | null; email: boolean | null };

/** The categories of the settings page, every type in exactly one of them, in this order. */
export const NOTIFICATION_CATEGORIES: {
  key: string;
  title: string;
  types: { type: NotifType; label: string; audience: NotificationAudience }[];
}[] = [
  {
    key: "verification",
    title: "Verifizierung",
    types: [
      { type: NotifType.VERIFICATION_RESULT, label: "Ergebnis der Prüfung", audience: "SELF" },
    ],
  },
  {
    key: "requests",
    title: "Anfragen und Bewerbungen",
    types: [
      { type: NotifType.APPLICATION_RECEIVED, label: "Bewerbung erhalten", audience: "CAPTAIN" },
      { type: NotifType.APPLICATION_REJECTED, label: "Bewerbung abgelehnt", audience: "CAPTAIN" },
      { type: NotifType.REQUEST_DELETED, label: "Anfrage gelöscht", audience: "CAPTAIN" },
      { type: NotifType.REQUEST_EXPIRED, label: "Anfrage abgelaufen", audience: "CAPTAIN" },
    ],
  },
  {
    key: "scrims",
    title: "Scrims",
    types: [
      { type: NotifType.SCRIM_BOOKED, label: "Scrim gebucht", audience: "TEAM" },
      { type: NotifType.SCRIM_CANCELLED, label: "Scrim abgesagt", audience: "TEAM" },
      { type: NotifType.REMINDER_24H, label: "Erinnerung 24 Stunden vorher", audience: "TEAM" },
      { type: NotifType.REMINDER_1H, label: "Erinnerung 1 Stunde vorher", audience: "TEAM" },
      { type: NotifType.FEEDBACK_PROMPT, label: "Bitte um Feedback", audience: "TEAM" },
    ],
  },
  {
    key: "team",
    title: "Team",
    types: [
      {
        type: NotifType.CHANNEL_BROKEN,
        label: "Team-Channel nicht mehr verknüpft",
        audience: "CAPTAIN",
      },
    ],
  },
];

const SETTINGS = new Map(
  NOTIFICATION_CATEGORIES.flatMap((category) => category.types).map((item) => [item.type, item]),
);

export function notificationAudience(type: NotifType): NotificationAudience {
  return SETTINGS.get(type)!.audience;
}

/** The label of a type on the settings page and in the mail that it switches. */
export function notificationSettingLabel(type: NotifType): string {
  return SETTINGS.get(type)!.label;
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

/** The stored choice where there is one, otherwise the default for this role. */
export function effectiveChannels(
  type: NotifType,
  isCaptain: boolean,
  stored: StoredChannels | null | undefined,
): ChannelSettings {
  const defaults = defaultChannels(type, isCaptain);
  return {
    discord: stored?.discord ?? defaults.discord,
    email: stored?.email ?? defaults.email,
  };
}

/** The settings page: per category and type the values in effect and whether they are defaults. */
export async function getNotificationPreferences(userId: string) {
  const user = await requireUser(userId);
  const team = await findOwnTeam(user.id);
  const isCaptain = team ? isCaptainOf(user, team) : false;
  const stored = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
  const byType = new Map(stored.map((row) => [row.type, row]));
  return {
    isCaptain,
    categories: NOTIFICATION_CATEGORIES.map((category) => ({
      key: category.key,
      title: category.title,
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
 * Saves the settings form (SPEC N-14). Only what changed against the values in effect is written; a
 * changed value that lands on the default of the current role becomes null, so whoever becomes
 * captain later gets the captain defaults. With Discord off for every type, dmFailedAt is reset:
 * the banner would otherwise never go away (§5.1).
 */
export async function setNotificationPreferences(input: {
  userId: string;
  preferences: unknown;
}): Promise<void> {
  const preferences = parseInput(notificationPreferencesSchema, input.preferences);
  await prisma.$transaction(async (tx) => {
    // Under the user lock, so a save cannot leave rows for an account deleted meanwhile (§4).
    await lockUser(tx, input.userId);
    const user = await requireUser(input.userId, tx);
    const team = await findOwnTeam(user.id, tx);
    const isCaptain = team ? isCaptainOf(user, team) : false;
    const stored = await tx.notificationPreference.findMany({ where: { userId: user.id } });
    const byType = new Map(stored.map((row) => [row.type, row]));
    let discordAnywhere = false;
    for (const type of Object.values(NotifType)) {
      const row = byType.get(type);
      const next = nextStored(
        type,
        isCaptain,
        { discord: row?.discord ?? null, email: row?.email ?? null },
        preferences[type],
      );
      discordAnywhere ||= effectiveChannels(type, isCaptain, next).discord;
      if (next.discord !== (row?.discord ?? null) || next.email !== (row?.email ?? null)) {
        await writeStored(tx, user.id, type, next, row !== undefined);
      }
    }
    if (!discordAnywhere) {
      await tx.user.updateMany({ where: notDeletedUserWhere(user.id), data: { dmFailedAt: null } });
    }
  });
}

/** The stored values after a save; see setNotificationPreferences. */
export function nextStored(
  type: NotifType,
  isCaptain: boolean,
  stored: StoredChannels,
  submitted: ChannelSettings,
): StoredChannels {
  const current = effectiveChannels(type, isCaptain, stored);
  const defaults = defaultChannels(type, isCaptain);
  const next = { ...stored };
  for (const channel of ["discord", "email"] as const) {
    if (submitted[channel] === current[channel]) continue;
    next[channel] = submitted[channel] === defaults[channel] ? null : submitted[channel];
  }
  return next;
}

async function writeStored(
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
