import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VerifStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  BAN_REJECT_REASON,
  DELETED_USER_NAME,
  type ModerationExport,
  deletedUserEmail,
  findUserByDiscordId,
  reapplyModeration,
  requireUser,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser, uid } from "./helpers.ts";

let uploadDir: string;

beforeEach(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-restore-"));
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const EMPTY: ModerationExport = { bannedTeams: [], bannedUsers: [], deletedUsers: [] };
const reapply = (entries: Partial<ModerationExport>) =>
  reapplyModeration({ entries: { ...EMPTY, ...entries }, uploadDir, now: NOW });

describe("reapplyModeration", () => {
  it("bans teams again and skips unknown, dissolved and banned ones", async () => {
    const { team } = await createTeamWithMembers();
    const dissolved = await createTeamWithMembers();
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });
    const banned = await createTeamWithMembers({ banned: true });

    const report = await reapply({
      bannedTeams: [
        { id: team.id },
        { id: dissolved.team.id },
        { id: banned.team.id },
        { id: uid() },
      ],
    });

    expect(report.bannedTeams).toBe(1);
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      bannedAt: NOW,
    });
    expect(await prisma.team.findUnique({ where: { id: dissolved.team.id } })).toMatchObject({
      bannedAt: null,
    });
  });

  it("bans users with the cascade of banUser, found by their Discord ID", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    const player = members[0]!;
    await prisma.verificationRequest.create({
      data: {
        userId: player.id,
        pendingUserId: player.id,
        mimeType: "application/pdf",
        sizeBytes: 4,
        status: VerifStatus.PENDING,
        createdAt: NOW,
      },
    });

    // The old export may carry another ID (a new login after a deletion); the Discord ID decides.
    const report = await reapply({ bannedUsers: [{ id: uid(), discordId: player.discordId }] });

    expect(report.bannedUsers).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: player.id } })).toMatchObject({
      bannedAt: NOW,
    });
    expect(await prisma.teamMember.findUnique({ where: { userId: player.id } })).toBeNull();
    expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(1);
    expect(
      await prisma.verificationRequest.findFirst({ where: { userId: player.id } }),
    ).toMatchObject({ status: VerifStatus.REJECTED, rejectReason: BAN_REJECT_REASON });
  });

  it("keeps a ban for a Discord account the restored database does not know", async () => {
    const discordId = "123456789012345678";
    const oldId = uid();

    const report = await reapply({ bannedUsers: [{ id: oldId, discordId }] });

    expect(report.bannedPlaceholders).toBe(1);
    const user = await findUserByDiscordId(discordId);
    expect(user).toMatchObject({
      id: oldId,
      name: DELETED_USER_NAME,
      email: deletedUserEmail(oldId),
      bannedAt: NOW,
    });
    // A new login lands on this user; Better Auth writes the original placeholder back.
    await prisma.user.update({
      where: { id: oldId },
      data: { email: `${discordId}@users.uniscrims.invalid` },
    });
    await expect(requireUser(oldId)).rejects.toMatchObject({ code: "BANNED" });
  });

  it("deletes accounts again and skips unknown and already deleted ones", async () => {
    const user = await createUser({ verified: true });
    const deleted = await createUser();
    await prisma.user.update({
      where: { id: deleted.id },
      data: { email: deletedUserEmail(deleted.id), name: DELETED_USER_NAME },
    });

    const report = await reapply({
      deletedUsers: [{ id: user.id }, { id: deleted.id }, { id: uid() }],
    });

    expect(report.deletedUsers).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedUserEmail(user.id),
      verifiedAt: null,
    });
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
  });

  it("hands the captain role to the longest-standing member before deleting a captain", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 2 });
    await prisma.teamMember.update({
      where: { userId: members[1]!.id },
      data: { joinedAt: new Date(NOW.getTime() - 60_000) },
    });

    const report = await reapply({ deletedUsers: [{ id: captain.id }] });

    expect(report).toMatchObject({ deletedUsers: 1, transferredCaptains: 1 });
    expect(await reapply({ deletedUsers: [{ id: captain.id }] })).toMatchObject({
      deletedUsers: 0,
      transferredCaptains: 0,
    });
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      captainId: members[1]!.id,
      dissolvedAt: null,
    });
    expect(await prisma.teamMember.findUnique({ where: { userId: captain.id } })).toBeNull();
  });

  it("leaves a user who was banned and deleted banned and deleted, and changes nothing twice", async () => {
    const user = await createUser({ verified: true });
    const entries = {
      bannedUsers: [{ id: user.id, discordId: user.discordId }],
      deletedUsers: [{ id: user.id }],
    };

    expect(await reapply(entries)).toMatchObject({ bannedUsers: 1, deletedUsers: 1 });
    // As after the deletion in the old database: the account is anonymous without a Discord link,
    // and the ban sits on a placeholder that holds only the Discord ID (§4).
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      email: deletedUserEmail(user.id),
      deletedAt: NOW,
    });
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    const placeholder = await findUserByDiscordId(user.discordId);
    expect(placeholder).toMatchObject({ bannedAt: NOW, email: deletedUserEmail(placeholder!.id) });
    expect(await prisma.account.findMany({ where: { userId: placeholder!.id } })).toMatchObject([
      { providerId: "discord", accountId: user.discordId, accessToken: null },
    ]);

    expect(await reapply(entries)).toEqual({
      bannedTeams: 0,
      bannedUsers: 0,
      bannedPlaceholders: 0,
      deletedUsers: 0,
      transferredCaptains: 0,
    });
  });

  it("rejects an export that does not match the format", async () => {
    await expect(
      reapplyModeration({ entries: { bannedUsers: [{ id: "x" }] }, uploadDir, now: NOW }),
    ).rejects.toThrow();
  });
});
