// Check 3 of ARCHITECTURE §11 Phase 13 against the real Better Auth handler: with ADMIN_URL every
// Better Auth cookie is set for both hosts, and signing out works from the admin host.
import { StaffRole, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it, vi } from "vitest";

// Before auth.ts reads them.
vi.hoisted(() => {
  vi.stubEnv("BETTER_AUTH_URL", "http://uniscrims.test");
  vi.stubEnv("ADMIN_URL", "http://admin.uniscrims.test");
});
vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  sendMail: async () => {},
}));

const { auth } = await import("../lib/auth.ts");

const PASSWORD = "lang-genug1";

async function confirmedUser(data: { staffRole?: StaffRole; twoFactorEnabled?: boolean } = {}) {
  const email = `ana.${crypto.randomUUID()}@example.org`;
  await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Ana", firstName: "Ana", lastName: "Muster" },
  });
  await prisma.user.update({ where: { email }, data: { emailVerified: true, ...data } });
  return email;
}

async function signIn(email: string) {
  return auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
}

function cookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`));
}

function signOut(sessionCookie: string, origin: string) {
  return auth.handler(
    new Request("http://admin.uniscrims.test/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie: sessionCookie },
      body: "{}",
    }),
  );
}

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

describe("cookies for both hosts (§5.13)", () => {
  it("sets the session cookie with the new name for the whole domain", async () => {
    const response = await signIn(await confirmedUser());
    const session = cookie(response, "uni-scrims.session_token");
    expect(session).toMatch(/Domain=uniscrims\.test/i);
    expect(cookie(response, "better-auth.session_token")).toBeUndefined();
  });

  it("sets the cookie of a pending 2FA login for the whole domain too", async () => {
    const email = await confirmedUser({ staffRole: StaffRole.REVIEWER, twoFactorEnabled: true });
    const response = await signIn(email);
    expect(await response.clone().json()).toMatchObject({ twoFactorRedirect: true });
    expect(cookie(response, "uni-scrims.two_factor")).toMatch(/Domain=uniscrims\.test/i);
  });

  it("signs out from the admin host", async () => {
    // Better Auth skips its origin check under test; the list it checks against outside of tests:
    expect((await auth.$context).trustedOrigins).toEqual([
      "http://uniscrims.test",
      "http://admin.uniscrims.test",
    ]);
    const response = await signIn(await confirmedUser());
    const session = cookie(response, "uni-scrims.session_token")!.split(";")[0]!;
    const out = await signOut(session, "http://admin.uniscrims.test");
    expect(out.status).toBe(200);
    expect(cookie(out, "uni-scrims.session_token")).toMatch(/Domain=uniscrims\.test/i);
    const token = decodeURIComponent(session.split("=")[1]!).split(".")[0]!;
    expect(await prisma.session.findUnique({ where: { token } })).toBeNull();
  });
});
