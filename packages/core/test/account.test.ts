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
  requireUser,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import {
  NOW,
  bookScrim,
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
    await banUser({ adminId: admin.id, userId: user.id, now: NOW });
    await personalData(user.id);

    await remove(user.id);

    expect(await prisma.account.findMany({ where: { userId: user.id } })).toMatchObject([
      { providerId: "discord", accountId: user.discordId, accessToken: null, refreshToken: null },
    ]);
    const again = await findUserByDiscordId(user.discordId);
    expect(again).toMatchObject({ id: user.id, name: DELETED_USER_NAME, bannedAt: NOW });
    await expect(requireUser(again?.id)).rejects.toMatchObject({ code: "BANNED" });
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
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
    await banUser({ adminId: admin.id, userId: captain.id, now: NOW });
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
});
