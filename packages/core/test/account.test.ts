import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AppStatus,
  NotifChannel,
  NotifType,
  ScrimStatus,
  VerifStatus,
  prisma,
} from "@uni-scrims/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CREDENTIAL_PROVIDER,
  DELETED_USER_NAME,
  LEGACY_REJECT_REASON,
  applyToRequest,
  banUser,
  completeAccount,
  createTeam,
  deleteAccount,
  deletedUserEmail,
  findUserByDiscordId,
  finishInterruptedDeletions,
  getAccount,
  getCurrentUser,
  getReliability,
  handOverCaptain,
  registrationSchema,
  requireAccountUser,
  requireUser,
  setThemePreference,
  updateRealName,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import {
  NOW,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createSession,
  createTeamWithMembers,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

const admin = useAdmin();
let uploadDir: string;
let universityId: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-account-"));
  const university = await prisma.university.create({
    data: { name: "Konto-Uni", city: "Teststadt", slug: `account-${uid()}` },
  });
  universityId = university.id;
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const remove = (userId: string) => deleteAccount({ userId, uploadDir, now: NOW });

/** The values every deleted account has (ARCHITECTURE §4). */
function deletedValues(userId: string) {
  return {
    name: DELETED_USER_NAME,
    email: deletedUserEmail(userId),
    image: null,
    verifiedAt: null,
    universityId: null,
    universityOther: null,
    hubJoinFailedAt: null,
    dmFailedAt: null,
    deletedAt: NOW,
    firstName: null,
    lastName: null,
  };
}

/** What a login writes: the Discord profile, the original placeholder, fresh tokens and a session. */
async function simulateLogin(userId: string, discordId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: "echter.name",
      email: `${discordId}@users.uniscrims.invalid`,
      image: "https://cdn.discordapp.com/avatars/1/a.png",
    },
  });
  await prisma.account.updateMany({
    where: { userId },
    data: { accessToken: "access", refreshToken: "refresh", scope: "identify guilds.join" },
  });
  await createSession(userId);
}

/**
 * Profile, verification with university, a decided and a pending verification request with files,
 * a DM to the user, a session and all OAuth token fields.
 */
async function personalData(userId: string) {
  const files = [`${uid()}.pdf`, `${uid()}.png`];
  for (const file of files) await writeFile(path.join(uploadDir, file), "file");
  const base = { userId, mimeType: "application/pdf", sizeBytes: 4, createdAt: NOW };
  await prisma.verificationRequest.create({
    data: { ...base, filePath: files[0], status: VerifStatus.REJECTED, rejectReason: "unlesbar" },
  });
  await prisma.verificationRequest.create({
    data: { ...base, filePath: files[1], status: VerifStatus.PENDING, pendingUserId: userId },
  });
  await queueNotifications(prisma, NOW, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.USER_DM,
      entityId: uid(),
      targetUserId: userId,
      payload: { approved: false, rejectReason: "unlesbar" },
    },
  ]);
  await createSession(userId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      image: "https://cdn.discordapp.com/avatars/1/a.png",
      verifiedAt: NOW,
      universityId,
      universityOther: "Hochschule Irgendwo",
      hubJoinFailedAt: NOW,
      dmFailedAt: NOW,
    },
  });
  await prisma.account.updateMany({
    where: { userId },
    data: {
      idToken: "id",
      accessTokenExpiresAt: NOW,
      refreshTokenExpiresAt: NOW,
      scope: "identify guilds.join",
    },
  });
  return files;
}

describe("getAccount", () => {
  it("shows the student status with the university", async () => {
    const user = await createUser();
    const status = async () => (await getAccount(user.id)).verification;
    expect(await status()).toEqual({ status: "NONE", university: null });
    const request = await prisma.verificationRequest.create({
      data: {
        userId: user.id,
        pendingUserId: user.id,
        universityId,
        mimeType: "application/pdf",
        sizeBytes: 4,
        status: VerifStatus.PENDING,
        createdAt: NOW,
      },
    });
    expect(await status()).toEqual({ status: "PENDING", university: "Konto-Uni" });
    await prisma.verificationRequest.update({
      where: { id: request.id },
      data: { status: VerifStatus.REJECTED, pendingUserId: null },
    });
    expect(await status()).toEqual({ status: "REJECTED", university: "Konto-Uni" });
    await prisma.user.update({
      where: { id: user.id },
      data: { verifiedAt: NOW, universityOther: "Hochschule Irgendwo" },
    });
    expect(await status()).toEqual({ status: "VERIFIED", university: "Hochschule Irgendwo" });
  });
});

describe("deleteAccount", () => {
  it("anonymizes a player and removes all personal data", async () => {
    const { team, members } = await createReadyTeam();
    const player = members[0]!;
    const files = await personalData(player.id);

    await remove(player.id);

    expect(await prisma.user.findUnique({ where: { id: player.id } })).toMatchObject({
      ...deletedValues(player.id),
      bannedAt: null,
    });
    expect(await prisma.teamMember.findUnique({ where: { userId: player.id } })).toBeNull();
    expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(4);
    expect(await prisma.session.count({ where: { userId: player.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: player.id } })).toBe(0);
    expect(await prisma.verificationRequest.count({ where: { userId: player.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { targetUserId: player.id } })).toBe(0);
    for (const file of files) expect(existsSync(path.join(uploadDir, file))).toBe(false);

    // A new login with the same Discord account starts over with a new user.
    expect(await findUserByDiscordId(player.discordId)).toBeNull();
    await expect(
      prisma.user.create({
        data: { id: uid(), name: "neu", email: `${player.discordId}@users.uniscrims.invalid` },
      }),
    ).resolves.toBeTruthy();
  });

  it("moves the ban of a banned user to a placeholder that holds only the Discord ID", async () => {
    const user = await createUser({ verified: true });
    await banUser({ adminId: admin.id, userId: user.id, uploadDir, now: NOW });
    const files = await personalData(user.id);

    await remove(user.id);

    // The account itself is as anonymous as any deleted one, without a link to the Discord ID.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject(
      deletedValues(user.id),
    );
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { targetUserId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    for (const file of files) expect(existsSync(path.join(uploadDir, file))).toBe(false);

    const placeholder = await findUserByDiscordId(user.discordId);
    expect(placeholder).toMatchObject({
      ...deletedValues(placeholder!.id),
      createdAt: NOW,
      bannedAt: NOW,
    });
    expect(placeholder!.id).not.toBe(user.id);
    expect(await prisma.account.findMany({ where: { userId: placeholder!.id } })).toMatchObject([
      {
        providerId: "discord",
        accountId: user.discordId,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
      },
    ]);
  });

  it("keeps the placeholder banned after a new login and lets it delete again", async () => {
    const user = await createUser();
    await banUser({ adminId: admin.id, userId: user.id, uploadDir, now: NOW });
    await remove(user.id);
    const placeholder = (await findUserByDiscordId(user.discordId))!;

    await simulateLogin(placeholder.id, user.discordId);
    await expect(requireUser(placeholder.id)).rejects.toMatchObject({ code: "BANNED" });
    expect(await requireAccountUser(placeholder.id)).toMatchObject({ id: placeholder.id });
    expect(await getAccount(placeholder.id)).toMatchObject({
      name: "echter.name",
      banned: true,
      team: null,
      deletionProblem: null,
    });

    await remove(placeholder.id);

    // Anonymized in place: still the one user that holds the Discord ID, no second placeholder.
    expect(await prisma.user.findUnique({ where: { id: placeholder.id } })).toMatchObject({
      ...deletedValues(placeholder.id),
      bannedAt: NOW,
    });
    expect(await findUserByDiscordId(user.discordId)).toMatchObject({ id: placeholder.id });
    expect(
      await prisma.account.findMany({
        where: { accountId: user.discordId },
        select: { userId: true, accessToken: true, scope: true },
      }),
    ).toEqual([{ userId: placeholder.id, accessToken: null, scope: null }]);
    expect(await prisma.session.count({ where: { userId: placeholder.id } })).toBe(0);
  });

  it("treats a deleted account as logged out", async () => {
    const user = await createUser();
    await remove(user.id);
    await expect(requireAccountUser(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(getAccount(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(remove(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("clears the notes of the user's own requests and keeps the requests", async () => {
    const { host, request } = await bookScrim({ note: "Discord: kontakt#1234" });
    const open = await createOpenRequest(host.captain.id, { note: "Meldet euch", time: "21:00" });
    await prisma.teamMember.deleteMany({
      where: { teamId: host.team.id, userId: { not: host.captain.id } },
    });

    await remove(host.captain.id);

    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      note: null,
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: open.id } })).toMatchObject({
      note: null,
    });
  });

  it("keeps the messages of applications, which belong to the team", async () => {
    const x = await createReadyTeam();
    const other = await createReadyTeam();
    const request = await createOpenRequest(other.captain.id);
    const { application } = await applyToRequest({
      userId: x.captain.id,
      requestId: request.id,
      message: "Wir spielen gern früher.",
      now: NOW,
    });
    await prisma.teamMember.deleteMany({
      where: { teamId: x.team.id, userId: { not: x.captain.id } },
    });

    await remove(x.captain.id);

    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.WITHDRAWN,
      message: "Wir spielen gern früher.",
    });
  });

  it("dissolves a banned team whose unbanned captain deletes the account", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 2,
      banned: true,
    });
    expect(await getAccount(captain.id)).toMatchObject({ banned: false, deletionProblem: null });

    await remove(captain.id);

    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      bannedAt: NOW,
      dissolvedAt: NOW,
    });
    for (const member of members) {
      expect(await prisma.teamMember.findUnique({ where: { userId: member.id } })).toBeNull();
    }
    expect(await prisma.account.count({ where: { userId: captain.id } })).toBe(0);
  });

  it("needs a captain with members to hand over the role first", async () => {
    const { team, captain } = await createTeamWithMembers({ extraMembers: 1 });
    expect((await getAccount(captain.id)).deletionProblem).toBe(
      "Übertrage zuerst die Captain-Rolle.",
    );
    await expect(remove(captain.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.user.findUnique({ where: { id: captain.id } })).toMatchObject({
      name: captain.name,
    });
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      dissolvedAt: null,
    });
  });

  it("dissolves the team of its last member and frees the name", async () => {
    const { host, scrim } = await bookScrim();
    await prisma.teamMember.deleteMany({
      where: { teamId: host.team.id, userId: { not: host.captain.id } },
    });
    expect((await getAccount(host.captain.id)).deletionProblem).toBeNull();

    await remove(host.captain.id);

    expect(await prisma.team.findUnique({ where: { id: host.team.id } })).toMatchObject({
      dissolvedAt: NOW,
      nameNormalized: null,
      inviteCode: null,
    });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      cancelledByTeamId: host.team.id,
      lateCancel: false,
    });
    const founder = await createUser();
    await expect(
      createTeam({
        userId: founder.id,
        name: host.team.name,
        tag: "NEU",
        now: NOW,
      }),
    ).resolves.toBeTruthy();
  });

  it("dissolves the banned team of a banned captain with members", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 2 });
    await banUser({ adminId: admin.id, userId: captain.id, uploadDir, now: NOW });
    expect(await getAccount(captain.id)).toMatchObject({ banned: true, deletionProblem: null });

    await remove(captain.id);

    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      bannedAt: NOW,
      dissolvedAt: NOW,
    });
    for (const member of members) {
      expect(await prisma.teamMember.findUnique({ where: { userId: member.id } })).toBeNull();
    }
  });

  it("keeps past scrims and the reliability of the team", async () => {
    const { guest, scrim } = await bookScrim();
    await prisma.scrim.update({
      where: { id: scrim.id },
      data: { status: ScrimStatus.COMPLETED },
    });
    const before = await getReliability(guest.team.id);
    await remove(guest.members[0]!.id);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.COMPLETED,
    });
    expect(await getReliability(guest.team.id)).toEqual(before);
  });

  it("needs a login", async () => {
    await expect(remove("")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("lets a second deletion that waited for the first find nothing left to do", async () => {
    const user = await createUser();
    await banUser({ adminId: admin.id, userId: user.id, uploadDir, now: NOW });
    const deleted = { email: { startsWith: "deleted-" } };
    const before = await prisma.user.count({ where: deleted });

    const results = await Promise.allSettled([remove(user.id), remove(user.id)]);

    // The second either ran after the first committed (nothing left to do) or was turned away.
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: "UNAUTHENTICATED" });
      }
    }
    // The account and exactly one placeholder, which holds the Discord ID.
    expect(await prisma.user.count({ where: deleted })).toBe(before + 2);
    expect(await findUserByDiscordId(user.discordId)).toMatchObject({ bannedAt: NOW });
  });

  it("treats a deleted user without a Discord account as logged out", async () => {
    // What a login that raced the deletion leaves if undoing it fails (ARCHITECTURE §5.1).
    const user = await createUser();
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: NOW } });
    await expect(requireAccountUser(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireUser(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("lets a new account without Discord in, but only to the account page (§5.8)", async () => {
    const user = await createUser();
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await expect(requireAccountUser(user.id)).resolves.toMatchObject({ id: user.id });
    await expect(requireUser(user.id)).rejects.toMatchObject({
      code: "ACCOUNT_INCOMPLETE",
      step: "LINK_DISCORD",
    });
  });
});

describe("finishInterruptedDeletions", () => {
  it("anonymizes a deleted user again whose profile a racing login wrote back", async () => {
    // What a login that raced the deletion leaves if the login hook could not undo it (§5.1).
    const user = await createUser({ verified: true });
    await remove(user.id);
    await simulateLogin(user.id, user.discordId);
    await prisma.user.update({ where: { id: user.id }, data: { dmFailedAt: NOW } });
    // A ban placeholder after a new login, and a user nobody deleted: both stay as they are.
    const banned = await createUser();
    await banUser({ adminId: admin.id, userId: banned.id, uploadDir, now: NOW });
    await remove(banned.id);
    const placeholder = (await findUserByDiscordId(banned.discordId))!;
    await simulateLogin(placeholder.id, banned.discordId);
    const active = await createUser();

    expect(await finishInterruptedDeletions()).toBeGreaterThanOrEqual(1);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject(
      deletedValues(user.id),
    );
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: placeholder.id } })).toMatchObject({
      name: "echter.name",
      email: `${banned.discordId}@users.uniscrims.invalid`,
    });
    expect(await prisma.user.findUnique({ where: { id: active.id } })).toMatchObject({
      name: active.name,
    });
    expect(await finishInterruptedDeletions()).toBe(0);
  });
});

describe("registrationSchema", () => {
  const valid = {
    firstName: " Ana ",
    lastName: "Muster",
    email: " Ana@Example.ORG ",
    password: "lang-genug1",
    consent: true,
  };

  it("trims the name and lowercases the address", () => {
    expect(registrationSchema.parse(valid)).toMatchObject({
      firstName: "Ana",
      email: "ana@example.org",
    });
  });

  it("needs a name, a valid address, 10 characters and the consent", () => {
    for (const broken of [
      { firstName: "  " },
      { lastName: "x".repeat(51) },
      { email: "keine-adresse" },
      // Placeholders of Discord, seed and deleted accounts (§4).
      { email: "deleted-abc@users.uniscrims.invalid" },
      { email: "x@uniscrims.invalid" },
      { password: "kurz" },
      { consent: false },
    ]) {
      expect(
        registrationSchema.safeParse({ ...valid, ...broken }).success,
        JSON.stringify(broken),
      ).toBe(false);
    }
  });
});

describe("completeAccount", () => {
  const complete = (userId: string, overrides: object = {}) =>
    completeAccount({
      userId,
      firstName: "Ana",
      lastName: "Muster",
      email: `Ana.${uid()}@Example.org`,
      passwordHash: "hash",
      uploadDir,
      now: NOW,
      ...overrides,
    });

  it("sets name, an unconfirmed address and the password, and takes back the verification", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    const user = members[0]!;
    await prisma.user.update({
      where: { id: user.id },
      data: { firstName: null, lastName: null, emailVerified: false, universityId },
    });
    const { email } = await complete(user.id);

    expect(email).toMatch(/^ana\..*@example\.org$/);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      firstName: "Ana",
      lastName: "Muster",
      email,
      emailVerified: false,
      verifiedAt: null,
      universityId: null,
    });
    expect(
      await prisma.account.findFirst({
        where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
      }),
    ).toMatchObject({ accountId: user.id, password: "hash" });
    // The team stays; the next step is confirming the address (§5.8).
    expect(await prisma.teamMember.findUnique({ where: { userId: user.id } })).toMatchObject({
      teamId: team.id,
    });
    await expect(requireUser(user.id)).rejects.toMatchObject({ step: "VERIFY_EMAIL" });
  });

  it("rejects a pending request of the account and deletes its file", async () => {
    const user = await createUser({ legacy: true });
    const filePath = `${uid()}.pdf`;
    await writeFile(path.join(uploadDir, filePath), "pdf");
    const request = await prisma.verificationRequest.create({
      data: {
        userId: user.id,
        pendingUserId: user.id,
        filePath,
        mimeType: "application/pdf",
        sizeBytes: 3,
        status: VerifStatus.PENDING,
        createdAt: NOW,
      },
    });
    await complete(user.id);
    expect(
      await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({
      status: VerifStatus.REJECTED,
      rejectReason: LEGACY_REJECT_REASON,
      pendingUserId: null,
      filePath: null,
    });
    expect(existsSync(path.join(uploadDir, filePath))).toBe(false);
    expect(
      await prisma.notification.count({
        where: { targetUserId: user.id, type: NotifType.VERIFICATION_RESULT },
      }),
    ).toBe(1);
  });

  it("refuses complete and banned accounts, taken addresses and invalid names", async () => {
    await expect(complete((await createUser()).id)).rejects.toMatchObject({ code: "CONFLICT" });
    const banned = await createUser({ legacy: true, banned: true });
    await expect(complete(banned.id)).rejects.toMatchObject({ code: "BANNED" });
    const legacy = await createUser({ legacy: true });
    await expect(complete(legacy.id, { firstName: " " })).rejects.toMatchObject({
      code: "INVALID",
    });
    const other = await createUser({ legacy: true });
    const taken = `taken-${uid()}@example.org`;
    await complete(other.id, { email: taken });
    await expect(complete(legacy.id, { email: taken.toUpperCase() })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Diese E-Mail-Adresse wird schon verwendet.",
    });
    // Nothing of the failed attempt is left.
    expect(
      await prisma.account.count({ where: { userId: legacy.id, providerId: CREDENTIAL_PROVIDER } }),
    ).toBe(0);
  });
});

describe("updateRealName", () => {
  it("changes the name until the certificate is uploaded", async () => {
    const user = await createUser();
    await updateRealName({ userId: user.id, firstName: " Bea ", lastName: "Neu" });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      firstName: "Bea",
      lastName: "Neu",
    });
    expect(await getAccount(user.id)).toMatchObject({ canEditName: true, firstName: "Bea" });

    await prisma.verificationRequest.create({
      data: {
        userId: user.id,
        pendingUserId: user.id,
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: VerifStatus.PENDING,
        createdAt: NOW,
      },
    });
    await expect(
      updateRealName({ userId: user.id, firstName: "Cleo", lastName: "Neu" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getAccount(user.id)).toMatchObject({ canEditName: false });

    const verified = await createUser({ verified: true });
    await expect(
      updateRealName({ userId: verified.id, firstName: "Cleo", lastName: "Neu" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const legacy = await createUser({ legacy: true });
    await expect(
      updateRealName({ userId: legacy.id, firstName: "Cleo", lastName: "Neu" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("setThemePreference", () => {
  it("stores the design of the own account, banned and incomplete accounts included", async () => {
    const user = await createUser();
    expect(await getCurrentUser(user.id)).toMatchObject({ theme: "SYSTEM" });
    await setThemePreference({ userId: user.id, theme: "LIGHT" });
    expect(await getCurrentUser(user.id)).toMatchObject({ theme: "LIGHT" });

    const banned = await createUser({ banned: true });
    const legacy = await createUser({ legacy: true });
    for (const other of [banned, legacy]) {
      await setThemePreference({ userId: other.id, theme: "DARK" });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).theme).toBe("DARK");
    }
  });

  it("rejects unknown designs and missing or deleted accounts", async () => {
    const user = await createUser();
    await expect(setThemePreference({ userId: user.id, theme: "BLUE" })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(setThemePreference({ userId: "missing", theme: "DARK" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    await expect(setThemePreference({ userId: user.id, theme: "DARK" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("goes back to the system setting when the account is deleted", async () => {
    const user = await createUser();
    await setThemePreference({ userId: user.id, theme: "LIGHT" });
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).theme).toBe("SYSTEM");
  });
});

describe("getAccount for incomplete accounts", () => {
  it("hides the placeholder address and tells the next step", async () => {
    const legacy = await createUser({ legacy: true });
    expect(await getAccount(legacy.id)).toMatchObject({
      setupStep: "COMPLETE_ACCOUNT",
      email: null,
      hasDiscord: true,
      hasPassword: false,
      canEditName: false,
    });
    const fresh = await createUser();
    await prisma.account.deleteMany({ where: { userId: fresh.id } });
    expect(await getAccount(fresh.id)).toMatchObject({
      setupStep: "LINK_DISCORD",
      email: fresh.email,
      hasDiscord: false,
    });
  });
});

describe("deleteAccount with a password", () => {
  it("removes the password and the real name", async () => {
    const user = await createUser();
    await prisma.account.create({
      data: {
        id: uid(),
        userId: user.id,
        accountId: user.id,
        providerId: CREDENTIAL_PROVIDER,
        password: "hash",
      },
    });
    await remove(user.id);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject(
      deletedValues(user.id),
    );
  });
});

describe("deleteAccount and Better Auth tokens", () => {
  it("removes open password reset tokens of the account", async () => {
    const user = await createUser();
    await prisma.verification.create({
      data: {
        id: uid(),
        identifier: `reset-password:${uid()}`,
        value: user.id,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      },
    });
    await remove(user.id);
    expect(await prisma.verification.count({ where: { value: user.id } })).toBe(0);
  });
});

describe("handOverCaptain", () => {
  it("lets a captain from before Phase 7 hand over the role and then delete (SPEC N-3)", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await prisma.user.update({
      where: { id: captain.id },
      data: { firstName: null, lastName: null, emailVerified: false },
    });
    expect(await getAccount(captain.id)).toMatchObject({
      setupStep: "COMPLETE_ACCOUNT",
      deletionProblem: expect.any(String),
      captainCandidates: [{ id: members[0]!.id, name: members[0]!.name }],
    });
    await handOverCaptain({ userId: captain.id, newCaptainId: members[0]!.id });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).captainId).toBe(
      members[0]!.id,
    );
    expect(await getAccount(captain.id)).toMatchObject({ deletionProblem: null });
  });

  it("refuses members, banned teams and banned users", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(
      handOverCaptain({ userId: members[0]!.id, newCaptainId: captain.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(
      handOverCaptain({ userId: captain.id, newCaptainId: members[0]!.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const banned = await createUser({ banned: true });
    await expect(
      handOverCaptain({ userId: banned.id, newCaptainId: captain.id }),
    ).rejects.toMatchObject({ code: "BANNED" });
  });
});
