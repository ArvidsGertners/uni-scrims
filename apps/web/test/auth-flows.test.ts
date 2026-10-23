// The checks of ARCHITECTURE §11 Phase 7 against the real Better Auth handler and the test database:
// account endpoints only from the server, the confirmation link, linking Discord and the Discord
// login. Discord itself is replaced by a stubbed fetch; mails are captured instead of sent.
import { prisma } from "@uni-scrims/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mail } from "../lib/mail.ts";

const { sentMails } = vi.hoisted(() => ({ sentMails: [] as Mail[] }));
vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  sendMail: async (mail: Mail) => {
    sentMails.push(mail);
  },
}));

const { auth } = await import("../lib/auth.ts");

const BASE = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

/** Cookies a browser would keep between requests. */
class CookieJar {
  private cookies = new Map<string, string>();
  take(response: Response): Response {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (value === "" || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function http(jar: CookieJar, path: string, init: { method?: string; body?: unknown } = {}) {
  const url = path.startsWith("http") ? path : `${BASE}/api/auth${path}`;
  return jar.take(
    await auth.handler(
      new Request(url, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          cookie: jar.header(),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
      }),
    ),
  );
}

/** The Discord account the stub answers for, and what it was asked. */
const discord = {
  profile: { id: "", username: "", discriminator: "0", avatar: null as string | null },
  hubJoins: [] as string[],
};

function stubDiscord() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input instanceof Request ? input.url : input));
    if (url === "https://discord.com/api/oauth2/token") {
      return Response.json({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        token_type: "Bearer",
        expires_in: 604800,
        scope: "identify guilds.join",
      });
    }
    if (url.endsWith("/users/@me")) {
      return Response.json({ ...discord.profile, global_name: "Anzeigename", verified: false });
    }
    if (url.includes("/guilds/") && init?.method === "PUT") {
      discord.hubJoins.push(String(JSON.parse(String(init.body)).access_token));
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request to ${url}`);
  });
}

/** Starts an OAuth flow over HTTP (sign-in or link) and comes back through the callback. */
async function throughDiscord(
  jar: CookieJar,
  start: "/sign-in/social" | "/link-social",
  extra: Record<string, unknown> = {},
) {
  const started = await http(jar, start, {
    method: "POST",
    body: { provider: "discord", callbackURL: "/konto", errorCallbackURL: "/login", ...extra },
  });
  expect(started.status, await started.clone().text()).toBe(200);
  const state = new URL(((await started.json()) as { url: string }).url).searchParams.get("state");
  return http(jar, `/callback/discord?code=code&state=${state}`);
}

function uniqueEmail(): string {
  return `ana.${crypto.randomUUID()}@example.org`;
}

async function signUp(email: string) {
  return auth.api.signUpEmail({
    body: { email, password: "lang-genug1", name: "Ana", firstName: "Ana", lastName: "Muster" },
  });
}

/** Registered, confirmed through the mail link, signed in by that link. */
async function confirmedUser() {
  const email = uniqueEmail();
  await signUp(email);
  const jar = new CookieJar();
  const link = sentMails.findLast((mail) => mail.to === email)!.text.match(/https?:\S+/)![0];
  const confirmed = await http(jar, link);
  expect(confirmed.status).toBe(302);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { jar, user };
}

beforeEach(() => {
  sentMails.length = 0;
  discord.hubJoins.length = 0;
  discord.profile = {
    id: String(BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`)),
    username: `ana_${crypto.randomUUID().slice(0, 6)}`,
    discriminator: "0",
    avatar: "abc",
  };
  stubDiscord();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("registration (check 1)", () => {
  it("keeps the account endpoints off HTTP but serves the server actions", async () => {
    const jar = new CookieJar();
    const body = { email: uniqueEmail(), password: "lang-genug1", name: "Ana" };
    expect((await http(jar, "/sign-up/email", { method: "POST", body })).status).toBe(404);
    expect((await http(jar, "/sign-in/email", { method: "POST", body })).status).toBe(404);

    const email = uniqueEmail();
    await signUp(email);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      firstName: "Ana",
      lastName: "Muster",
      emailVerified: false,
    });
    expect(sentMails.map((mail) => [mail.to, mail.subject])).toEqual([
      [email, "Bitte bestätige deine E-Mail-Adresse"],
    ]);
  });

  it("answers a taken address like a new one and creates nothing", async () => {
    const email = uniqueEmail();
    await signUp(email);
    await expect(signUp(email)).resolves.toBeDefined();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("signs in only after the confirmation link, which also signs in", async () => {
    const email = uniqueEmail();
    await signUp(email);
    await expect(
      auth.api.signInEmail({ body: { email, password: "lang-genug1" } }),
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });

    const { jar, user } = await confirmedUser();
    expect(user.emailVerified).toBe(true);
    const session = await http(jar, "/get-session");
    expect(await session.json()).toMatchObject({ user: { id: user.id } });
  });
});

describe("Discord (checks 2 and 3)", () => {
  it("links Discord, takes over the profile, joins the hub and keeps the address", async () => {
    const { jar, user } = await confirmedUser();
    const linked = await throughDiscord(jar, "/link-social");
    expect(linked.status).toBe(302);
    expect(linked.headers.get("location")).toContain("/konto");

    expect(
      await prisma.account.findFirstOrThrow({ where: { userId: user.id, providerId: "discord" } }),
    ).toMatchObject({
      accountId: discord.profile.id,
      accessToken: null,
      refreshToken: null,
    });
    expect(discord.hubJoins).toEqual(["fresh-access"]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: discord.profile.username,
      image: `https://cdn.discordapp.com/avatars/${discord.profile.id}/abc.png`,
      email: user.email,
      emailVerified: true,
      hubJoinFailedAt: null,
    });
  });

  it("signs in linked accounts with Discord without touching their address", async () => {
    const { jar: first, user } = await confirmedUser();
    await throughDiscord(first, "/link-social");
    discord.profile.username = "neuer_name";

    const jar = new CookieJar();
    const signedIn = await throughDiscord(jar, "/sign-in/social");
    expect(signedIn.status).toBe(302);
    expect(await (await http(jar, "/get-session")).json()).toMatchObject({ user: { id: user.id } });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: "neuer_name",
      email: user.email,
      emailVerified: true,
    });
    expect(discord.hubJoins).toEqual(["fresh-access", "fresh-access"]);
  });

  it("creates no account for a Discord login without a linked account", async () => {
    const before = await prisma.user.count();
    const jar = new CookieJar();
    const refused = await throughDiscord(jar, "/sign-in/social");
    expect(refused.status).toBe(302);
    expect(refused.headers.get("location")).toMatch(/\/login\?error=signup_disabled/);
    expect(await prisma.user.count()).toBe(before);
    expect(await (await http(jar, "/get-session")).json()).toBeNull();
  });

  it("refuses a Discord account that belongs to another user", async () => {
    const { jar: owner } = await confirmedUser();
    await throughDiscord(owner, "/link-social");
    const { jar, user } = await confirmedUser();
    const refused = await throughDiscord(jar, "/link-social");
    expect(refused.headers.get("location")).toMatch(/error=/);
    expect(await prisma.account.count({ where: { userId: user.id, providerId: "discord" } })).toBe(
      0,
    );
  });

  it("creates no account either when the client asks for a sign-up", async () => {
    const before = await prisma.user.count();
    const jar = new CookieJar();
    const refused = await throughDiscord(jar, "/sign-in/social", { requestSignUp: true });
    expect(refused.headers.get("location")).toMatch(/error=signup_disabled/);
    expect(await prisma.user.count()).toBe(before);
  });

  it("keeps one Discord account per user; linking the same one again rejoins the hub", async () => {
    const { jar, user } = await confirmedUser();
    await throughDiscord(jar, "/link-social");
    const first = discord.profile.id;

    // The same Discord account again ("Discord erneut verbinden"): fresh tokens, another join.
    const again = await throughDiscord(jar, "/link-social");
    expect(again.headers.get("location")).toContain("/konto");
    expect(discord.hubJoins).toEqual(["fresh-access", "fresh-access"]);

    // Another Discord account is refused.
    discord.profile.id = String(BigInt(first) + 1n);
    const refused = await throughDiscord(jar, "/link-social");
    expect(refused.headers.get("location")).toMatch(/error=/);
    expect(
      await prisma.account.findMany({
        where: { userId: user.id, providerId: "discord" },
        select: { accountId: true },
      }),
    ).toEqual([{ accountId: first }]);
  });

  it("links nothing to an account deleted while the Discord page was open", async () => {
    const { jar, user } = await confirmedUser();
    const started = await http(jar, "/link-social", {
      method: "POST",
      body: { provider: "discord", callbackURL: "/konto", errorCallbackURL: "/login" },
    });
    const state = new URL(((await started.json()) as { url: string }).url).searchParams.get(
      "state",
    );
    const { deleteAccount } = await import("@uni-scrims/core");
    await deleteAccount({ userId: user.id, uploadDir: "/tmp", now: new Date() });

    await http(jar, `/callback/discord?code=code&state=${state}`);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(discord.hubJoins).toEqual([]);
  });
});
