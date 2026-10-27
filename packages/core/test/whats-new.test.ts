// The what's new dialog (SPEC N-29, ARCHITECTURE §5.31): the closed edition on the account.
import { tmpdir } from "node:os";
import { prisma } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import { WHATS_NEW_EDITION } from "../config/whats-new.ts";
import {
  deleteAccount,
  exportAccountData,
  getCurrentUser,
  markWhatsNewSeen,
} from "../src/index.ts";
import { NOW, createUser } from "./helpers.ts";

describe("markWhatsNewSeen", () => {
  it("stores the current edition, which getCurrentUser returns", async () => {
    const user = await createUser();
    expect((await getCurrentUser(user.id))?.whatsNewSeen).toBeNull();
    await markWhatsNewSeen({ userId: user.id, edition: WHATS_NEW_EDITION });
    expect((await getCurrentUser(user.id))?.whatsNewSeen).toBe(WHATS_NEW_EDITION);
    // Again: nothing changes.
    await markWhatsNewSeen({ userId: user.id, edition: WHATS_NEW_EDITION });
    expect((await getCurrentUser(user.id))?.whatsNewSeen).toBe(WHATS_NEW_EDITION);
  });

  it("refuses another edition, e.g. from a page loaded before an update", async () => {
    const user = await createUser();
    await expect(
      markWhatsNewSeen({ userId: user.id, edition: "older-edition" }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect((await getCurrentUser(user.id))?.whatsNewSeen).toBeNull();
  });

  it("is for complete, unbanned accounts only", async () => {
    const banned = await createUser({ banned: true });
    await expect(
      markWhatsNewSeen({ userId: banned.id, edition: WHATS_NEW_EDITION }),
    ).rejects.toMatchObject({ code: "BANNED" });
    const legacy = await createUser({ legacy: true });
    await expect(
      markWhatsNewSeen({ userId: legacy.id, edition: WHATS_NEW_EDITION }),
    ).rejects.toMatchObject({ code: "ACCOUNT_INCOMPLETE" });
    await expect(
      markWhatsNewSeen({ userId: "missing", edition: WHATS_NEW_EDITION }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("is in the data export and goes with the account", async () => {
    const user = await createUser();
    await markWhatsNewSeen({ userId: user.id, edition: WHATS_NEW_EDITION });
    const data = await exportAccountData({
      userId: user.id,
      now: NOW,
      privacyPolicyUrl: "https://example.org/datenschutz",
      uploadDir: tmpdir(),
    });
    expect(data.konto.neuigkeitenGesehen).toBe(WHATS_NEW_EDITION);
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.whatsNewSeen).toBeNull();
  });
});
