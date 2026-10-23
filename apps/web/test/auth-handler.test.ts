// The allowlist of auth-paths.ts wired into Better Auth (ARCHITECTURE §5.1): requests go through the
// real handler, so a lost or overwritten before-hook would fail here.
import { describe, expect, it } from "vitest";
import { auth } from "../lib/auth.ts";

const BASE = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

function call(path: string, method: "GET" | "POST", body?: unknown) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method,
      headers: { "content-type": "application/json", origin: BASE },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("Better Auth handler", () => {
  it("answers 404 for every endpoint the app does not use", async () => {
    const blocked: [string, "GET" | "POST", unknown?][] = [
      ["/update-user", "POST", { name: "Anders" }],
      ["/change-email", "POST", { newEmail: "neu@example.org" }],
      ["/link-social", "POST", { provider: "discord" }],
      ["/unlink-account", "POST", { providerId: "discord" }],
      ["/list-accounts", "GET"],
      ["/list-sessions", "GET"],
      ["/delete-user", "POST", {}],
      ["/revoke-sessions", "POST", {}],
    ];
    for (const [path, method, body] of blocked) {
      expect((await call(path, method, body)).status, path).toBe(404);
    }
  });

  it("serves the endpoints the app uses", async () => {
    const session = await call("/get-session", "GET");
    expect(session.status).toBe(200);
    const signIn = await call("/sign-in/social", "POST", { provider: "discord", callbackURL: "/" });
    expect(signIn.status).toBe(200);
    expect(await signIn.json()).toMatchObject({
      url: expect.stringContaining("https://discord.com/"),
    });
  });
});
