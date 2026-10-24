import { MemberRole, Rank, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_TEAM_MEMBERS,
  createTeam,
  generateInviteCode,
  getMyTeam,
  getTeamByInviteCode,
  joinTeam,
  leaveTeam,
  linkTeamChannel,
  regenerateInvite,
  removeMember,
  setMemberRole,
  summarizeUniversities,
  transferCaptain,
  updateTeam,
  updateTeamLinks,
} from "../src/index.ts";
import { lockTeam } from "../src/locks.ts";
import { NOW, createTeamWithMembers, createUser, uid } from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

function teamName(): string {
  return `Team ${uid().slice(0, 8)}`;
}

async function newTeam(userId: string, name = teamName()) {
  return createTeam({ userId, name, tag: "ABC", rank: Rank.GOLD, now: NOW });
}

describe("createTeam", () => {
  it("creates the team with the captain as member", async () => {
    const user = await createUser();
    const team = await newTeam(user.id, "  Die Bären  ");
    expect(team).toMatchObject({
      name: "Die Bären",
      nameNormalized: "die bären",
      captainId: user.id,
      createdAt: NOW,
    });
    expect(team.inviteCode).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const member = await prisma.teamMember.findUniqueOrThrow({ where: { userId: user.id } });
    expect(member).toMatchObject({ teamId: team.id, joinedAt: NOW });
  });

  it("allows an unverified user to create a team", async () => {
    const user = await createUser({ verified: false });
    await expect(newTeam(user.id)).resolves.toBeTruthy();
  });

  it("treats names case-insensitively", async () => {
    const name = teamName();
    await newTeam((await createUser()).id, name);
    const other = await createUser();
    await expect(newTeam(other.id, name.toUpperCase())).rejects.toThrow("schon vergeben");
  });

  it("validates tag length and name", async () => {
    const user = await createUser();
    const base = { userId: user.id, name: teamName(), rank: Rank.GOLD, now: NOW };
    await expect(createTeam({ ...base, tag: "A" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(createTeam({ ...base, tag: "ABCDEF" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(createTeam({ ...base, tag: "AB", name: " " })).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("allows only one team per user", async () => {
    const user = await createUser();
    await newTeam(user.id);
    await expect(newTeam(user.id)).rejects.toThrow("schon in einem Team");
  });
});

describe("captain actions", () => {
  it("updates name, tag and rank", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    const name = teamName();
    const updated = await updateTeam({
      userId: captain.id,
      teamId: team.id,
      name,
      tag: "NEW",
      rank: Rank.RADIANT,
    });
    expect(updated).toMatchObject({ name, nameNormalized: name.toLowerCase(), rank: Rank.RADIANT });
  });

  it("rejects updates by non-captains and to taken names", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    const input = { teamId: team.id, name: teamName(), tag: "ABC", rank: Rank.GOLD };
    await expect(updateTeam({ ...input, userId: members[0]!.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const other = await createTeamWithMembers();
    await expect(
      updateTeam({ ...input, userId: other.captain.id, teamId: other.team.id, name: team.name }),
    ).rejects.toThrow("schon vergeben");
  });

  it("regenerates the invite code; the old one stops working", async () => {
    const { team, captain } = await createTeamWithMembers();
    const code = await regenerateInvite({ userId: captain.id, teamId: team.id });
    expect(code).not.toBe(team.inviteCode);
    const joiner = await createUser();
    await expect(
      joinTeam({ userId: joiner.id, inviteCode: team.inviteCode!, now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      joinTeam({ userId: joiner.id, inviteCode: code!, now: NOW }),
    ).resolves.toBeTruthy();
  });

  it("transfers the captain role to a member only", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const outsider = await createUser();
    await expect(
      transferCaptain({ userId: captain.id, teamId: team.id, newCaptainId: outsider.id }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await transferCaptain({ userId: captain.id, teamId: team.id, newCaptainId: members[0]!.id });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).captainId).toBe(
      members[0]!.id,
    );
    // The old captain is a normal member now.
    await expect(
      transferCaptain({ userId: captain.id, teamId: team.id, newCaptainId: captain.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("removes members, but not the captain himself", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(
      removeMember({ userId: captain.id, teamId: team.id, memberId: captain.id }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await removeMember({ userId: captain.id, teamId: team.id, memberId: members[0]!.id });
    expect(await prisma.teamMember.findUnique({ where: { userId: members[0]!.id } })).toBeNull();
  });

  it("sets roles of members and the own one, also without verification", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 1,
      verifiedCaptain: false,
    });
    const role = async (userId: string) =>
      (await prisma.teamMember.findUniqueOrThrow({ where: { userId } })).role;
    expect(await role(members[0]!.id)).toBe(MemberRole.PLAYER);

    await setMemberRole({
      userId: captain.id,
      teamId: team.id,
      memberId: members[0]!.id,
      role: MemberRole.COACH,
    });
    await setMemberRole({
      userId: captain.id,
      teamId: team.id,
      memberId: captain.id,
      role: MemberRole.SUBSTITUTE,
    });
    expect(await role(members[0]!.id)).toBe(MemberRole.COACH);
    expect(await role(captain.id)).toBe(MemberRole.SUBSTITUTE);
  });

  it("rejects role changes by non-captains, in banned teams and for non-members", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const other = await createTeamWithMembers({ extraMembers: 1 });
    const set = (userId: string, memberId: string, role: MemberRole = MemberRole.COACH) =>
      setMemberRole({ userId, teamId: team.id, memberId, role });

    await expect(set(members[0]!.id, members[0]!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(set(captain.id, other.members[0]!.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(set(captain.id, members[0]!.id, "CAPTAIN" as MemberRole)).rejects.toMatchObject({
      code: "INVALID",
    });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(set(captain.id, members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await prisma.teamMember.findUniqueOrThrow({ where: { userId: members[0]!.id } })).role,
    ).toBe(MemberRole.PLAYER);
  });
});

describe("team row lock", () => {
  it("rejects non-captains before taking the team lock", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const outsider = (await createTeamWithMembers()).captain;
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    // Another transaction holds the team row; calls that waited for it would hang until released.
    const holder = prisma.$transaction(
      async (tx) => {
        await lockTeam(tx, team.id);
        locked();
        await released;
      },
      { timeout: 20_000 },
    );
    await lockTaken;
    try {
      for (const userId of [outsider.id, members[0]!.id]) {
        const target = { userId, teamId: team.id, memberId: captain.id };
        await expect(setMemberRole({ ...target, role: MemberRole.COACH })).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(removeMember(target)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          transferCaptain({ userId, teamId: team.id, newCaptainId: userId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          updateTeamLinks({ userId, teamId: team.id, links: { x: "x.com/team" }, now: NOW }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    } finally {
      release();
      await holder;
    }
  });
});

describe("joinTeam", () => {
  it("rejects unknown codes, banned teams and users in another team", async () => {
    const user = await createUser();
    await expect(
      joinTeam({ userId: user.id, inviteCode: generateInviteCode(), now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const banned = await createTeamWithMembers({ banned: true });
    await expect(
      joinTeam({ userId: user.id, inviteCode: banned.team.inviteCode!, now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await createTeamWithMembers();
    const other = await createTeamWithMembers();
    await expect(
      joinTeam({ userId: own.captain.id, inviteCode: other.team.inviteCode!, now: NOW }),
    ).rejects.toThrow("schon in einem Team");
  });

  it("enforces the member limit", async () => {
    const { team } = await createTeamWithMembers({ extraMembers: MAX_TEAM_MEMBERS - 1 });
    const user = await createUser();
    await expect(
      joinTeam({ userId: user.id, inviteCode: team.inviteCode!, now: NOW }),
    ).rejects.toThrow("voll");
  });

  it("does not exceed the limit with parallel joins (§7)", async () => {
    const { team } = await createTeamWithMembers({ extraMembers: MAX_TEAM_MEMBERS - 3 });
    const joiners = await Promise.all(Array.from({ length: 5 }, () => createUser()));
    const results = await Promise.allSettled(
      joiners.map((user) => joinTeam({ userId: user.id, inviteCode: team.inviteCode!, now: NOW })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(MAX_TEAM_MEMBERS);
  });
});

describe("leaveTeam", () => {
  it("lets players leave, also banned teams", async () => {
    const { members } = await createTeamWithMembers({ extraMembers: 1, banned: true });
    await expect(leaveTeam({ userId: members[0]!.id, now: NOW })).resolves.toEqual({
      dissolved: false,
    });
    expect(await prisma.teamMember.findUnique({ where: { userId: members[0]!.id } })).toBeNull();
  });

  it("requires a captain transfer while other members exist", async () => {
    const { captain } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(leaveTeam({ userId: captain.id, now: NOW })).rejects.toThrow("Captain-Rolle");
  });

  it("dissolves the team when the captain leaves as the last member", async () => {
    const captain = await createUser();
    const name = teamName();
    const team = await newTeam(captain.id, name);
    await expect(leaveTeam({ userId: captain.id, now: NOW })).resolves.toEqual({ dissolved: true });

    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row).toMatchObject({ dissolvedAt: NOW, nameNormalized: null, inviteCode: null });
    expect(await getTeamByInviteCode(captain.id, team.inviteCode!)).toBeNull();
    const joiner = await createUser();
    await expect(
      joinTeam({ userId: joiner.id, inviteCode: team.inviteCode!, now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Name is free again; the former captain can found a new team.
    await expect(newTeam(captain.id, name)).resolves.toMatchObject({ name });
  });
});

describe("reads", () => {
  it("summarizes universities with +n", () => {
    expect(summarizeUniversities(["B", "A", "B", null, "D", "C"])).toEqual({
      shown: ["A", "B", "C"],
      more: 1,
    });
  });

  it("returns the own team with member status and readiness", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 4 });
    const pending = members[3]!;
    await prisma.user.update({ where: { id: pending.id }, data: { verifiedAt: null } });
    await prisma.verificationRequest.create({
      data: {
        userId: pending.id,
        pendingUserId: pending.id,
        mimeType: "application/pdf",
        sizeBytes: 1,
        status: "PENDING",
        createdAt: NOW,
      },
    });

    const own = await getMyTeam(captain.id);
    expect(own).toMatchObject({
      id: team.id,
      isCaptain: true,
      verifiedPlayerCount: 4,
      ready: false,
    });
    expect(own?.inviteCode).toBe(team.inviteCode);
    expect(own?.members.find((member) => member.id === pending.id)?.status).toBe("PENDING");
    expect(own?.members.every((member) => member.role === MemberRole.PLAYER)).toBe(true);

    const asMember = await getMyTeam(members[0]!.id);
    expect(asMember).toMatchObject({ isCaptain: false, inviteCode: null });
    expect(await getMyTeam((await createUser()).id)).toBeNull();
  });

  it("counts verified players and substitutes, never coaches", async () => {
    const { captain, members } = await createTeamWithMembers({ extraMembers: 4 });
    const setRole = (userId: string, role: MemberRole) =>
      prisma.teamMember.update({ where: { userId }, data: { role } });
    await setRole(members[3]!.id, MemberRole.COACH);
    expect(await getMyTeam(captain.id)).toMatchObject({ verifiedPlayerCount: 4, ready: false });
    expect(
      (await getMyTeam(captain.id))?.members.find((member) => member.id === members[3]!.id)?.role,
    ).toBe(MemberRole.COACH);

    await setRole(members[3]!.id, MemberRole.SUBSTITUTE);
    expect(await getMyTeam(captain.id)).toMatchObject({ verifiedPlayerCount: 5, ready: true });
  });

  it("previews a team by invite code", async () => {
    const { team } = await createTeamWithMembers({ extraMembers: 2 });
    const viewer = await createUser();
    expect(await getTeamByInviteCode(viewer.id, team.inviteCode!)).toMatchObject({
      id: team.id,
      memberCount: 3,
      full: false,
    });
  });

  it("previews teams only for logged-in, non-banned users", async () => {
    const { team } = await createTeamWithMembers();
    await expect(getTeamByInviteCode("", team.inviteCode!)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const banned = await createUser({ banned: true });
    await expect(getTeamByInviteCode(banned.id, team.inviteCode!)).rejects.toMatchObject({
      code: "BANNED",
    });
  });
});

describe("linkTeamChannel (/setup)", () => {
  const link = (discordUserId: string) =>
    linkTeamChannel({ discordUserId, guildId: "400", channelId: "401" });

  it("links server and channel for the captain, also without verification", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    expect(await link(captain.discordId)).toEqual({ id: team.id, name: team.name });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
      discordGuildId: "400",
      discordChannelId: "401",
    });
  });

  it("refuses the hub server", async () => {
    const { captain } = await createTeamWithMembers();
    await expect(
      linkTeamChannel(
        { discordUserId: captain.discordId, guildId: "500", channelId: "501" },
        { HUB_GUILD_ID: "500" },
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("rejects members, banned teams, users without a team and unknown Discord users", async () => {
    const { members } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(link(members[0]!.discordId)).rejects.toThrow("Das kann nur euer Captain.");
    const banned = await createTeamWithMembers({ banned: true });
    await expect(link(banned.captain.discordId)).rejects.toThrow("Das Team ist gesperrt.");
    const loner = await createUser();
    await expect(link(loner.discordId)).rejects.toThrow("Du bist in keinem Team.");
    await expect(link("123456789")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const bannedUser = await createUser({ banned: true });
    await expect(link(bannedUser.discordId)).rejects.toMatchObject({ code: "BANNED" });
  });
});
