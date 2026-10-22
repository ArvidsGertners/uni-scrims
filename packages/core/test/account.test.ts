import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotifChannel, NotifType, ScrimStatus, VerifStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DELETED_USER_NAME,
  banUser,
  createTeam,
  deleteAccount,
  deletedUserEmail,
  findUserByDiscordId,
  getAccount,
  getReliability,
  requireAccountUser,
  requireUser,
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

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-account-"));
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const remove = (userId: string) => deleteAccount({ userId, uploadDir, now: NOW });

/** A decided and a pending verification request with files, and a DM to the user. */
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
    data: { hubJoinFailedAt: NOW, dmFailedAt: NOW },
  });
  await prisma.account.updateMany({ where: { userId }, data: { scope: "identify guilds.join" } });
  return files;
}

describe("deleteAccount", () => {
  it("anonymizes a player and removes all personal data", async () => {
    const { team, members } = await createReadyTeam();
    const player = members[0]!;
    const files = await personalData(player.id);

    await remove(player.id);

    expect(await prisma.user.findUnique({ where: { id: player.id } })).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedUserEmail(player.id),
      image: null,
      verifiedAt: null,
      universityId: null,
      universityOther: null,
      hubJoinFailedAt: null,
      dmFailedAt: null,
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

  it("keeps only the Discord ID of a banned user, so the ban survives a new login", async () => {
    const user = await createUser({ verified: true });
    await banUser({ adminId: admin.id, userId: user.id, uploadDir, now: NOW });
    await personalData(user.id);

    await remove(user.id);

    expect(await prisma.account.findMany({ where: { userId: user.id } })).toMatchObject([
      {
        providerId: "discord",
        accountId: user.discordId,
        accessToken: null,
        refreshToken: null,
        scope: null,
      },
    ]);
    const again = await findUserByDiscordId(user.discordId);
    expect(again).toMatchObject({
      id: user.id,
      name: DELETED_USER_NAME,
      email: deletedUserEmail(user.id),
      image: null,
      verifiedAt: null,
      universityId: null,
      universityOther: null,
      hubJoinFailedAt: null,
      dmFailedAt: null,
      bannedAt: NOW,
    });
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { targetUserId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // A new login lands on the same user; Better Auth writes the original placeholder back (§4).
    await prisma.user.update({
      where: { id: user.id },
      data: { email: `${user.discordId}@users.uniscrims.invalid` },
    });
    await expect(requireUser(user.id)).rejects.toMatchObject({ code: "BANNED" });
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
        rank: host.team.rank,
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

  it("treats a user without a Discord account as logged out", async () => {
    // What a login that raced the deletion leaves if undoing it fails (ARCHITECTURE §5.1).
    const user = await createUser();
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await expect(requireAccountUser(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireUser(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
