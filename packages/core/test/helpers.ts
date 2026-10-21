import { randomUUID } from "node:crypto";
import { prisma, Rank } from "@uni-scrims/db";

export const NOW = new Date("2026-10-21T12:00:00Z");

// Unique per call: the test DB is only reset once per vitest process.
export function uid(): string {
  return randomUUID();
}

export async function createUser(
  options: { verified?: boolean; banned?: boolean; discordId?: string } = {},
) {
  const id = uid();
  const discordId = options.discordId ?? String(BigInt(`0x${id.replaceAll("-", "").slice(0, 15)}`));
  const user = await prisma.user.create({
    data: {
      id,
      name: `User ${id.slice(0, 8)}`,
      email: `${discordId}@users.uniscrims.invalid`,
      verifiedAt: options.verified ? NOW : null,
      bannedAt: options.banned ? NOW : null,
    },
  });
  await prisma.account.create({
    data: {
      id: `${id}-discord`,
      userId: id,
      providerId: "discord",
      accountId: discordId,
      accessToken: "access",
      refreshToken: "refresh",
    },
  });
  return { ...user, discordId };
}

/** Team with the captain as first member and `extraMembers` further members. */
export async function createTeamWithMembers(
  options: {
    verifiedCaptain?: boolean;
    extraMembers?: number;
    verifiedMembers?: boolean;
    banned?: boolean;
  } = {},
) {
  const captain = await createUser({ verified: options.verifiedCaptain ?? true });
  const id = uid();
  const team = await prisma.team.create({
    data: {
      id,
      name: `Team ${id.slice(0, 18)}`,
      nameNormalized: `team ${id.slice(0, 18)}`,
      tag: "TST",
      rank: Rank.GOLD,
      captainId: captain.id,
      inviteCode: id.replaceAll("-", "").slice(0, 12),
      bannedAt: options.banned ? NOW : null,
      createdAt: NOW,
    },
  });
  await prisma.teamMember.create({ data: { teamId: id, userId: captain.id, joinedAt: NOW } });
  const members = [];
  for (let i = 0; i < (options.extraMembers ?? 0); i++) {
    const member = await createUser({ verified: options.verifiedMembers ?? true });
    await prisma.teamMember.create({ data: { teamId: id, userId: member.id, joinedAt: NOW } });
    members.push(member);
  }
  return { team, captain, members };
}
