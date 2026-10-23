// The header must not take the legal pages down with the database (ARCHITECTURE §8).
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getSignedInUser: vi.fn() }));
vi.mock("../lib/session.ts", () => session);

const { headerUser } = await import("../lib/header-user.ts");

afterEach(() => {
  vi.restoreAllMocks();
  session.getSignedInUser.mockReset();
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
