// The header must not take the legal pages down with the database (ARCHITECTURE §8).
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getSignedInUser: vi.fn() }));
vi.mock("../lib/session.ts", () => session);
const core = vi.hoisted(() => ({ getNavTeam: vi.fn() }));
vi.mock("@uni-scrims/core", () => core);
const request = vi.hoisted(() => ({ host: "uniscrims.test" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: request.host }) }));

const { headerUser, siteChrome, siteNav } = await import("../lib/header-user.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  session.getSignedInUser.mockReset();
  core.getNavTeam.mockReset();
  request.host = "uniscrims.test";
});

describe("headerUser", () => {
  it("returns the signed-in user", async () => {
    session.getSignedInUser.mockResolvedValue({ id: "u1", name: "Nutzer" });
    await expect(headerUser()).resolves.toEqual({ id: "u1", name: "Nutzer" });
  });

  it("shows the header as logged out when the database cannot be reached", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    session.getSignedInUser.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(headerUser()).resolves.toBeNull();
    expect(errors).toHaveBeenCalledWith(
      "Could not load the user for the header",
      expect.any(Error),
    );
  });

  it("lets Next's own signals through", async () => {
    // What cookies() throws while Next prerenders a page that turns out to be dynamic.
    const dynamic = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    session.getSignedInUser.mockRejectedValue(dynamic);
    await expect(headerUser()).rejects.toBe(dynamic);
  });
});

describe("siteChrome (§5.15)", () => {
  const user = { id: "u1", name: "Nutzer", bannedAt: null, setupStep: null };
  const team = { id: "t1", name: "Team", tag: "TT", logo: null };

  it("loads the team for active accounts", async () => {
    session.getSignedInUser.mockResolvedValue(user);
    core.getNavTeam.mockResolvedValue(team);
    await expect(siteChrome()).resolves.toMatchObject({
      active: true,
      team,
      teamUnavailable: false,
      adminHost: false,
    });
  });

  it("asks for no team for banned and incomplete accounts and on the admin host", async () => {
    for (const restricted of [
      { ...user, bannedAt: new Date() },
      { ...user, setupStep: "LINK_DISCORD" },
    ]) {
      session.getSignedInUser.mockResolvedValue(restricted);
      await expect(siteChrome()).resolves.toMatchObject({ active: false, team: null });
    }
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.test");
    vi.stubEnv("ADMIN_URL", "https://admin.uniscrims.test");
    request.host = "admin.uniscrims.test";
    session.getSignedInUser.mockResolvedValue(user);
    await expect(siteChrome()).resolves.toMatchObject({ adminHost: true, team: null });
    expect(core.getNavTeam).not.toHaveBeenCalled();
  });

  it("keeps the user and marks the team unknown when the team query fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    session.getSignedInUser.mockResolvedValue(user);
    core.getNavTeam.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(siteChrome()).resolves.toMatchObject({
      user,
      team: null,
      teamUnavailable: true,
    });
    expect(errors).toHaveBeenCalledWith(
      "Could not load the team for the sidebar",
      expect.any(Error),
    );
  });
});

describe("siteNav (§5.16)", () => {
  const staff = {
    id: "u1",
    name: "Nutzer",
    avatarVersion: null,
    verifiedAt: new Date(),
    bannedAt: null,
    setupStep: null,
    staffRole: "ADMIN",
  };

  it("links the admin area for staff with an active account", async () => {
    session.getSignedInUser.mockResolvedValue(staff);
    core.getNavTeam.mockResolvedValue(null);
    await expect(siteNav()).resolves.toMatchObject({ full: true, adminUrl: "/admin" });
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.test");
    vi.stubEnv("ADMIN_URL", "https://admin.uniscrims.test");
    await expect(siteNav()).resolves.toMatchObject({ adminUrl: "https://admin.uniscrims.test/" });
  });

  it("has no admin link without a role or with a banned or incomplete account", async () => {
    core.getNavTeam.mockResolvedValue(null);
    for (const user of [
      { ...staff, staffRole: null },
      { ...staff, bannedAt: new Date() },
      { ...staff, setupStep: "LINK_DISCORD" },
    ]) {
      session.getSignedInUser.mockResolvedValue(user);
      await expect(siteNav()).resolves.toMatchObject({ adminUrl: null });
    }
  });
});
