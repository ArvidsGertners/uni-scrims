import { randomUUID } from "node:crypto";
import { prisma, Rank, ScrimFormat } from "@uni-scrims/db";
import type { ValorantMap } from "../config/maps.ts";
import { applyToRequest, confirmApplication, createRequest } from "../src/index.ts";

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

/** A Better Auth session row, to check that bans and account deletion end sessions. */
export async function createSession(userId: string) {
  const id = uid();
  return prisma.session.create({
    data: { id, token: id, userId, expiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR) },
  });
}

/** Team with the captain as first member and `extraMembers` further members. */
export async function createTeamWithMembers(
  options: {
    verifiedCaptain?: boolean;
    extraMembers?: number;
    verifiedMembers?: boolean;
    banned?: boolean;
    rank?: Rank;
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
      rank: options.rank ?? Rank.GOLD,
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

const HOUR = 60 * 60 * 1000;

/** Ready to play: verified captain plus 4 verified members. */
export async function createReadyTeam(options: { rank?: Rank; verifiedCaptain?: boolean } = {}) {
  return createTeamWithMembers({ extraMembers: 4, ...options });
}

/** Thu 22.10.2026, 20:00 Berlin = 18:00 UTC, 30 h after NOW. */
export const REQUEST_INPUT: {
  date: string;
  time: string;
  format: ScrimFormat;
  rankMin: Rank;
  rankMax: Rank;
  maps: ValorantMap[];
  note: string | null;
} = {
  date: "2026-10-22",
  time: "20:00",
  format: ScrimFormat.ONE_MAP,
  rankMin: Rank.SILVER,
  rankMax: Rank.PLATINUM,
  maps: [],
  note: null,
};
export const REQUEST_STARTS_AT = new Date("2026-10-22T18:00:00Z");

/** Wed 21.10.2026, 20:00 Berlin = 6 h after NOW, inside the late-cancel window. */
export const SOON = { date: "2026-10-21", time: "20:00" };
export const SOON_STARTS_AT = new Date(NOW.getTime() + 6 * HOUR);

export async function createOpenRequest(
  captainId: string,
  overrides: Partial<typeof REQUEST_INPUT> = {},
) {
  return createRequest({ ...REQUEST_INPUT, ...overrides, userId: captainId, now: NOW });
}

/** Two ready teams, a request of the host and the guest's confirmed application. */
export async function bookScrim(overrides: Partial<typeof REQUEST_INPUT> = {}) {
  const host = await createReadyTeam();
  const guest = await createReadyTeam();
  const request = await createOpenRequest(host.captain.id, overrides);
  const { application } = await applyToRequest({
    userId: guest.captain.id,
    requestId: request.id,
    now: NOW,
  });
  const scrim = await confirmApplication({
    userId: host.captain.id,
    requestId: request.id,
    applicationId: application.id,
    now: NOW,
  });
  return { host, guest, request, application, scrim };
}
