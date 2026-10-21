import { Rank, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_OPEN_REQUESTS,
  MAX_TEAM_MEMBERS,
  createTeam,
  generateInviteCode,
  getMyTeam,
  getTeamByInviteCode,
  joinTeam,
  leaveTeam,
  regenerateInvite,
  removeMember,
  summarizeUniversities,
  transferCaptain,
  updateTeam,
} from "../src/index.ts";
import { NOW, createOpenRequest, createTeamWithMembers, createUser, uid } from "./helpers.ts";

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

    const own = await getMyTeam(captain.id, NOW);
    expect(own).toMatchObject({
      id: team.id,
      isCaptain: true,
      verifiedCount: 4,
      ready: false,
      requestProblem: "Das Team hat noch keine 5 verifizierten Mitglieder.",
    });
    expect(own?.inviteCode).toBe(team.inviteCode);
    expect(own?.members.find((member) => member.id === pending.id)?.status).toBe("PENDING");

    const asMember = await getMyTeam(members[0]!.id, NOW);
    expect(asMember).toMatchObject({
      isCaptain: false,
      inviteCode: null,
      requestProblem: "Das kann nur euer Captain.",
    });
    expect(await getMyTeam((await createUser()).id, NOW)).toBeNull();
  });

  it("tells the captain why the team cannot post requests", async () => {
    const ready = await createTeamWithMembers({ extraMembers: 4 });
    expect(await getMyTeam(ready.captain.id, NOW)).toMatchObject({
      ready: true,
      requestProblem: null,
    });
    const unverified = await createTeamWithMembers({ extraMembers: 4, verifiedCaptain: false });
    expect(await getMyTeam(unverified.captain.id, NOW)).toMatchObject({
      requestProblem: "Als Captain musst du für Scrim-Aktionen verifiziert sein.",
    });

    // Like createRequest: at most 5 open requests; one that has started no longer counts.
    const times = ["11:00", "12:00", "13:00", "14:00", "15:00"];
    for (const time of times) {
      await createOpenRequest(ready.captain.id, { date: "2026-10-22", time });
    }
    const full = `Ihr habt schon ${MAX_OPEN_REQUESTS} offene Anfragen. Löscht erst eine.`;
    expect(await getMyTeam(ready.captain.id, NOW)).toMatchObject({ requestProblem: full });
    await expect(
      createOpenRequest(ready.captain.id, { date: "2026-10-22", time: "16:00" }),
    ).rejects.toMatchObject({ message: full });
    const afterFirstStart = new Date("2026-10-22T09:00:00Z");
    expect(await getMyTeam(ready.captain.id, afterFirstStart)).toMatchObject({
      requestProblem: null,
    });
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
