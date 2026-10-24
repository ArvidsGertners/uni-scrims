import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  TEAM_LINK_MAX,
  type TeamLinkPlatform,
  getBoard,
  getMyTeam,
  getRequestDetail,
  getScrimDetail,
  leaveTeam,
  parseTeamLink,
  removeTeamLinksAsAdmin,
  searchModerationTargets,
  toTeamLinks,
  updateTeamLinks,
} from "../src/index.ts";
import {
  NOW,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
  createUser,
  useAdmin,
} from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

const admin = useAdmin();
const LATER = new Date(NOW.getTime() + 60_000);

function url(platform: TeamLinkPlatform, raw: string) {
  const result = parseTeamLink(platform, raw);
  if ("error" in result) throw new Error(result.error);
  return result.url;
}

function error(platform: TeamLinkPlatform, raw: string) {
  const result = parseTeamLink(platform, raw);
  return "error" in result ? result.error : null;
}

describe("parseTeamLink", () => {
  it("accepts each platform's own addresses, with and without https:// and www.", () => {
    const valid: [TeamLinkPlatform, string, string][] = [
      ["discord", "discord.gg/uniscrims", "https://discord.gg/uniscrims"],
      ["discord", "https://discord.com/invite/Ab-12", "https://discord.com/invite/Ab-12"],
      ["discord", "www.discord.com/invite/abc/", "https://www.discord.com/invite/abc/"],
      ["website", "eure-seite.de", "https://eure-seite.de/"],
      [
        "website",
        "https://Team.Uni-Example.de/valorant?x=1",
        "https://team.uni-example.de/valorant?x=1",
      ],
      ["x", "x.com/uniscrims", "https://x.com/uniscrims"],
      ["x", "https://twitter.com/uniscrims", "https://twitter.com/uniscrims"],
      ["x", "www.x.com/uniscrims", "https://www.x.com/uniscrims"],
      ["instagram", "instagram.com/uniscrims/", "https://instagram.com/uniscrims/"],
      ["twitch", "https://www.twitch.tv/uniscrims", "https://www.twitch.tv/uniscrims"],
      ["youtube", "youtube.com/@uniscrims", "https://youtube.com/@uniscrims"],
      ["youtube", "m.youtube.com/channel/UC123", "https://m.youtube.com/channel/UC123"],
      ["tiktok", "tiktok.com/@uniscrims", "https://tiktok.com/@uniscrims"],
      // The default port disappears when normalized.
      ["x", "https://x.com:443/uniscrims", "https://x.com/uniscrims"],
      ["x", "HTTPS://X.com/uniscrims", "https://x.com/uniscrims"],
      // "://" later in the address is no scheme; "https://" still goes in front.
      ["website", "eure-seite.de/?ref=https://x.com", "https://eure-seite.de/?ref=https://x.com"],
    ];
    for (const [platform, raw, expected] of valid) {
      expect(url(platform, raw), `${platform} ${raw}`).toBe(expected);
    }
  });

  it("treats an empty field as no link", () => {
    expect(url("website", "")).toBeNull();
    expect(url("x", "   ")).toBeNull();
  });

  it("rejects other hosts, naming the platform", () => {
    expect(error("instagram", "x.com/uniscrims")).toBe(
      "Instagram: Bitte einen Link zu eurem Profil auf instagram.com angeben.",
    );
    expect(error("x", "instagram.com/uniscrims")).toBe(
      "X: Bitte einen Link zu eurem Profil auf x.com oder twitter.com angeben.",
    );
    expect(error("x", "fakex.com/uniscrims")).toMatch(/^X: /);
    expect(error("x", "x.com.evil.de/uniscrims")).toMatch(/^X: /);
    expect(error("twitch", "twitch.tv.example.org/a")).toMatch(/^Twitch: /);
    // Discord takes server invites only.
    expect(error("discord", "discord.com/users/123")).toMatch(
      /^Discord-Server: Bitte einen Einladungslink/,
    );
    expect(error("discord", "discord.com/channels/1/2")).toMatch(/^Discord-Server: /);
    expect(error("tiktok", "tiktok.com/uniscrims")).toMatch(/^TikTok: /);
  });

  it("asks for a profile path on the platforms", () => {
    for (const [platform, raw] of [
      ["x", "x.com"],
      ["instagram", "https://instagram.com/"],
      ["twitch", "twitch.tv"],
      ["youtube", "youtube.com/"],
      ["tiktok", "tiktok.com/@"],
      ["discord", "discord.gg/"],
    ] as const) {
      expect(error(platform, raw), raw).not.toBeNull();
    }
  });

  it("rejects other schemes, credentials, ports and long links", () => {
    expect(error("website", "http://eure-seite.de")).toBe(
      "Website: Bitte einen https-Link angeben.",
    );
    expect(error("website", "ftp://eure-seite.de")).toBe(
      "Website: Bitte einen https-Link angeben.",
    );
    expect(error("website", "javascript:alert(1)")).not.toBeNull();
    expect(error("website", "https://user:pass@eure-seite.de")).toBe(
      "Website: Der Link darf keine Zugangsdaten und keinen Port enthalten.",
    );
    expect(error("website", "mailto:team@eure-seite.de")).not.toBeNull();
    expect(error("website", "eure-seite.de:8443")).toBe(
      "Website: Der Link darf keine Zugangsdaten und keinen Port enthalten.",
    );
    expect(error("website", "https://")).toBe("Website: Das ist kein gültiger Link.");
    const long = `eure-seite.de/${"a".repeat(TEAM_LINK_MAX)}`;
    expect(error("website", long)).toBe(
      `Website: Der Link darf höchstens ${TEAM_LINK_MAX} Zeichen haben.`,
    );
    // Fits as typed, too long once "https://" is put in front.
    const almost = `eure-seite.de/${"a".repeat(TEAM_LINK_MAX - "eure-seite.de/".length)}`;
    expect(almost.length).toBe(TEAM_LINK_MAX);
    expect(error("website", almost)).toMatch(/höchstens/);
  });

  it("takes websites with a domain only", () => {
    for (const raw of [
      "localhost",
      "https://localhost:3000",
      "foo.localhost",
      "127.0.0.1",
      "https://10.0.0.1/team",
      "[::1]",
      "intranet",
      "eure-seite.",
    ]) {
      expect(error("website", raw), raw).toMatch(/^Website: /);
    }
  });
});

describe("toTeamLinks", () => {
  it("lists the set links in the fixed order", () => {
    expect(
      toTeamLinks({
        discordUrl: null,
        websiteUrl: "https://eure-seite.de/",
        xUrl: null,
        instagramUrl: null,
        twitchUrl: null,
        youtubeUrl: null,
        tiktokUrl: "https://tiktok.com/@team",
      }),
    ).toEqual([
      { platform: "website", url: "https://eure-seite.de/" },
      { platform: "tiktok", url: "https://tiktok.com/@team" },
    ]);
  });
});

async function teamRow(teamId: string) {
  return prisma.team.findUniqueOrThrow({ where: { id: teamId } });
}

describe("updateTeamLinks", () => {
  it("saves the links of an unverified captain and removes empty ones", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { discord: "discord.gg/abc", x: "x.com/team", website: "" },
      now: NOW,
    });
    expect(await teamRow(team.id)).toMatchObject({
      discordUrl: "https://discord.gg/abc",
      xUrl: "https://x.com/team",
      websiteUrl: null,
      linksUpdatedAt: NOW,
    });

    // The same links again keep the version an admin may have seen.
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { discord: "https://discord.gg/abc", x: "x.com/team" },
      now: LATER,
    });
    expect((await teamRow(team.id)).linksUpdatedAt).toEqual(NOW);

    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { x: "x.com/team" },
      now: LATER,
    });
    expect(await teamRow(team.id)).toMatchObject({ discordUrl: null, linksUpdatedAt: LATER });

    // Without any link left there is no version.
    await updateTeamLinks({ userId: captain.id, teamId: team.id, links: {}, now: LATER });
    expect(await teamRow(team.id)).toMatchObject({ xUrl: null, linksUpdatedAt: null });
  });

  it("rejects invalid links, non-captains, other teams and banned teams", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const save = (userId: string, links: Record<string, string>, teamId = team.id) =>
      updateTeamLinks({ userId, teamId, links, now: NOW });

    await expect(save(captain.id, { instagram: "x.com/team" })).rejects.toMatchObject({
      code: "INVALID",
      message: "Instagram: Bitte einen Link zu eurem Profil auf instagram.com angeben.",
    });
    await expect(save(members[0]!.id, { x: "x.com/team" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const other = await createTeamWithMembers();
    await expect(save(other.captain.id, { x: "x.com/team" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(save(captain.id, { x: "x.com/team" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    expect(await teamRow(team.id)).toMatchObject({ xUrl: null, linksUpdatedAt: null });
  });

  it("clears the links when the team is dissolved", async () => {
    const { team, captain } = await createTeamWithMembers();
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { website: "eure-seite.de", twitch: "twitch.tv/team" },
      now: NOW,
    });
    await leaveTeam({ userId: captain.id, now: NOW });
    expect(await teamRow(team.id)).toMatchObject({
      dissolvedAt: NOW,
      websiteUrl: null,
      twitchUrl: null,
      linksUpdatedAt: null,
    });
  });
});

describe("removeTeamLinksAsAdmin", () => {
  it("removes all links of the version the admin saw, also of a banned team", async () => {
    const { team, captain } = await createTeamWithMembers();
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { website: "eure-seite.de", youtube: "youtube.com/@team" },
      now: NOW,
    });
    const linksVersion = NOW.getTime();
    await expect(
      removeTeamLinksAsAdmin({ adminId: captain.id, teamId: team.id, linksVersion }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Links changed since the admin looked stay.
    await expect(
      removeTeamLinksAsAdmin({
        adminId: admin.id,
        teamId: team.id,
        linksVersion: linksVersion - 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await teamRow(team.id)).websiteUrl).toBe("https://eure-seite.de/");

    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await removeTeamLinksAsAdmin({ adminId: admin.id, teamId: team.id, linksVersion });
    expect(await teamRow(team.id)).toMatchObject({
      websiteUrl: null,
      youtubeUrl: null,
      linksUpdatedAt: null,
    });
  });

  it("finds no dissolved team", async () => {
    const { team, captain } = await createTeamWithMembers();
    await leaveTeam({ userId: captain.id, now: NOW });
    await expect(
      removeTeamLinksAsAdmin({ adminId: admin.id, teamId: team.id, linksVersion: NOW.getTime() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reads with links", () => {
  it("gives the own team its game and links", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { tiktok: "tiktok.com/@team", discord: "discord.gg/abc" },
      now: NOW,
    });
    const expected = [
      { platform: "discord", url: "https://discord.gg/abc" },
      { platform: "tiktok", url: "https://tiktok.com/@team" },
    ];
    expect(await getMyTeam(captain.id)).toMatchObject({ game: "valorant", links: expected });
    expect((await getMyTeam(members[0]!.id))?.links).toEqual(expected);
  });

  it("shows the links of the request's team and of applicants, not on the board", async () => {
    const { host, guest, request, scrim } = await bookScrim();
    await updateTeamLinks({
      userId: host.captain.id,
      teamId: host.team.id,
      links: { website: "host.example.de" },
      now: NOW,
    });
    await updateTeamLinks({
      userId: guest.captain.id,
      teamId: guest.team.id,
      links: { x: "x.com/guest" },
      now: NOW,
    });
    const hostLinks = [{ platform: "website", url: "https://host.example.de/" }];
    const guestLinks = [{ platform: "x", url: "https://x.com/guest" }];

    const detail = await getRequestDetail({
      userId: host.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(detail?.team.links).toEqual(hostLinks);
    expect(detail?.applications?.[0]?.team.links).toEqual(guestLinks);

    expect(
      (await getScrimDetail({ userId: host.captain.id, scrimId: scrim.id, now: NOW }))?.opponent
        .links,
    ).toEqual(guestLinks);
    expect(
      (await getScrimDetail({ userId: guest.members[0]!.id, scrimId: scrim.id, now: NOW }))
        ?.opponent.links,
    ).toEqual(hostLinks);

    // Other logged-in users see the request's team with its links.
    const viewer = await createUser();
    const open = await createReadyTeam();
    const openRequest = await createOpenRequest(open.captain.id);
    await updateTeamLinks({
      userId: open.captain.id,
      teamId: open.team.id,
      links: { twitch: "twitch.tv/open" },
      now: NOW,
    });
    expect(
      (await getRequestDetail({ userId: viewer.id, requestId: openRequest.id, now: NOW }))?.team
        .links,
    ).toEqual([{ platform: "twitch", url: "https://twitch.tv/open" }]);
    const card = (await getBoard({ userId: viewer.id, ranks: "ALL", now: NOW })).requests.find(
      (item) => item.id === openRequest.id,
    );
    expect(card?.team).toBeDefined();
    expect(card?.team).not.toHaveProperty("links");
  });

  it("gives admins the links and their version on the ban page", async () => {
    const { team, captain } = await createTeamWithMembers();
    const result = () => searchModerationTargets({ adminId: admin.id, query: team.name });
    expect((await result()).teams[0]).toMatchObject({ links: [], linksVersion: null });
    await updateTeamLinks({
      userId: captain.id,
      teamId: team.id,
      links: { instagram: "instagram.com/team" },
      now: NOW,
    });
    expect((await result()).teams[0]).toMatchObject({
      links: [{ platform: "instagram", url: "https://instagram.com/team" }],
      linksVersion: NOW.getTime(),
    });
  });
});
