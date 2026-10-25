// Notification settings per person (SPEC N-14, ARCHITECTURE §5.17).
import { tmpdir } from "node:os";
import { NotifType, prisma } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CATEGORIES,
  defaultChannels,
  deleteAccount,
  effectiveChannels,
  getNotificationPreferences,
  nextStored,
  setNotificationPreferences,
} from "../src/index.ts";
import { NOW, createReadyTeam, createUser } from "./helpers.ts";

const OFF = { discord: false, email: false };

/** The form as the page sends it: the values in effect, with some changed. */
async function submitted(userId: string, changes: Partial<Record<NotifType, typeof OFF>> = {}) {
  const page = await getNotificationPreferences(userId);
  const values = Object.fromEntries(
    page.categories.flatMap((category) =>
      category.types.map((item) => [item.type, { discord: item.discord, email: item.email }]),
    ),
  );
  return { ...values, ...changes };
}

async function storedRows(userId: string) {
  return prisma.notificationPreference.findMany({ where: { userId }, orderBy: { type: "asc" } });
}

describe("notification categories", () => {
  it("place every type exactly once", () => {
    const types = NOTIFICATION_CATEGORIES.flatMap((category) => category.types.map((t) => t.type));
    expect([...types].sort()).toEqual(Object.values(NotifType).sort());
  });
});

describe("defaults (as before Phase 18)", () => {
  it("send Discord only, the scrim types only to the captain", () => {
    expect(defaultChannels("VERIFICATION_RESULT", false)).toEqual({ discord: true, email: false });
    expect(defaultChannels("APPLICATION_RECEIVED", false)).toEqual({ discord: true, email: false });
    expect(defaultChannels("SCRIM_BOOKED", true)).toEqual({ discord: true, email: false });
    expect(defaultChannels("REMINDER_1H", false)).toEqual(OFF);
    expect(effectiveChannels("REMINDER_1H", false, { discord: true, email: null })).toEqual({
      discord: true,
      email: false,
    });
  });
});

describe("nextStored", () => {
  it("writes only changes and turns a change back to the default into null", () => {
    const none = { discord: null, email: null };
    // A member opts in: stored.
    expect(nextStored("SCRIM_BOOKED", false, none, { discord: true, email: false })).toEqual({
      discord: true,
      email: null,
    });
    // As captain the same value is the default and nothing changed: the opt-in stays.
    expect(
      nextStored(
        "SCRIM_BOOKED",
        true,
        { discord: true, email: null },
        { discord: true, email: false },
      ),
    ).toEqual({ discord: true, email: null });
    // Shown as a member, saved as captain (the role changed meanwhile): the untouched box stays.
    expect(nextStored("SCRIM_BOOKED", true, none, OFF, false)).toEqual(none);
    // The captain switches it off: stored; on again: back to the default.
    expect(nextStored("SCRIM_BOOKED", true, none, OFF)).toEqual({ discord: false, email: null });
    expect(
      nextStored(
        "SCRIM_BOOKED",
        true,
        { discord: false, email: null },
        { discord: true, email: false },
      ),
    ).toEqual(none);
  });
});

describe("setNotificationPreferences", () => {
  it("stores only what differs from the defaults and shows it on the page", async () => {
    const user = await createUser({ verified: true });
    await setNotificationPreferences({
      userId: user.id,
      preferences: await submitted(user.id, {
        SCRIM_BOOKED: { discord: true, email: true },
        VERIFICATION_RESULT: { discord: true, email: true },
      }),
    });
    expect(await storedRows(user.id)).toMatchObject([
      { type: "VERIFICATION_RESULT", discord: null, email: true },
      { type: "SCRIM_BOOKED", discord: true, email: true },
    ]);
    const page = await getNotificationPreferences(user.id);
    const scrims = page.categories.find((category) => category.key === "scrims")!;
    expect(scrims.types[0]).toMatchObject({
      type: "SCRIM_BOOKED",
      discord: true,
      email: true,
      defaults: OFF,
    });

    // Back to the defaults: the rows are gone.
    await setNotificationPreferences({
      userId: user.id,
      preferences: await submitted(user.id, {
        SCRIM_BOOKED: OFF,
        VERIFICATION_RESULT: { discord: true, email: false },
      }),
    });
    expect(await storedRows(user.id)).toEqual([]);
  });

  it("knows the captain defaults of the own team", async () => {
    const { captain } = await createReadyTeam();
    const page = await getNotificationPreferences(captain.id);
    expect(page.isCaptain).toBe(true);
    const booked = page.categories.flatMap((c) => c.types).find((t) => t.type === "SCRIM_BOOKED");
    expect(booked).toMatchObject({ discord: true, email: false, stored: { discord: null } });
  });

  it("clears the DM banner once Discord is off everywhere", async () => {
    const user = await createUser({ verified: true });
    await prisma.user.update({ where: { id: user.id }, data: { dmFailedAt: NOW } });
    const allOff = Object.fromEntries(Object.values(NotifType).map((type) => [type, OFF]));
    await setNotificationPreferences({ userId: user.id, preferences: allOff });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toBeNull();
  });

  it("keeps the banner while Discord is on somewhere", async () => {
    const user = await createUser({ verified: true });
    await prisma.user.update({ where: { id: user.id }, data: { dmFailedAt: NOW } });
    await setNotificationPreferences({ userId: user.id, preferences: await submitted(user.id) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toEqual(
      NOW,
    );
  });

  it("rejects incomplete forms and accounts that may not use it", async () => {
    const user = await createUser({ verified: true });
    await expect(
      setNotificationPreferences({ userId: user.id, preferences: { SCRIM_BOOKED: OFF } }),
    ).rejects.toMatchObject({
      code: "INVALID",
      message: "Die Einstellungen sind unvollständig. Bitte lade die Seite neu.",
    });
    const banned = await createUser({ banned: true });
    await expect(getNotificationPreferences(banned.id)).rejects.toMatchObject({ code: "BANNED" });
    const legacy = await createUser({ legacy: true });
    await expect(
      setNotificationPreferences({ userId: legacy.id, preferences: await submitted(user.id) }),
    ).rejects.toMatchObject({ code: "ACCOUNT_INCOMPLETE" });
  });

  it("is deleted with the account", async () => {
    const user = await createUser({ verified: true });
    await setNotificationPreferences({
      userId: user.id,
      preferences: await submitted(user.id, { REMINDER_1H: { discord: true, email: true } }),
    });
    const form = await submitted(user.id);
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    expect(await storedRows(user.id)).toEqual([]);
    await expect(
      setNotificationPreferences({ userId: user.id, preferences: form }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("captain of one team and member of another (§5.20)", () => {
  it("shows the member defaults and stores a changed scrim choice for all teams", async () => {
    const captained = await createReadyTeam();
    const joined = await createReadyTeam();
    const user = captained.captain;
    await prisma.teamMember.create({
      data: { teamId: joined.team.id, userId: user.id, joinedAt: NOW },
    });
    const page = await getNotificationPreferences(user.id);
    expect(page).toMatchObject({ isCaptain: false, mixedRoles: true });
    const booked = page.categories
      .flatMap((category) => category.types)
      .find((item) => item.type === NotifType.SCRIM_BOOKED);
    expect(booked).toMatchObject({ discord: false, email: false });

    // On is stored, although it is the default of the captain team: it is meant for both teams.
    await setNotificationPreferences({
      userId: user.id,
      preferences: await submitted(user.id, {
        [NotifType.SCRIM_BOOKED]: { discord: true, email: false },
      }),
      shownAsCaptain: false,
    });
    expect(await storedRows(user.id)).toEqual([
      expect.objectContaining({ type: NotifType.SCRIM_BOOKED, discord: true, email: null }),
    ]);
    // Off is stored too, so the captain team gets none either.
    await setNotificationPreferences({
      userId: user.id,
      preferences: await submitted(user.id, { [NotifType.SCRIM_BOOKED]: OFF }),
      shownAsCaptain: false,
    });
    expect(await storedRows(user.id)).toEqual([
      expect.objectContaining({ type: NotifType.SCRIM_BOOKED, discord: false, email: null }),
    ]);
  });
});
