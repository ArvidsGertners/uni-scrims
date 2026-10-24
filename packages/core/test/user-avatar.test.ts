import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StaffRole, prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AVATAR_SIZE,
  avatarFetchUrl,
  backfillDiscordAvatars,
  deleteAccount,
  getUserAvatar,
  handleDiscordLogin,
  refreshDiscordAvatar,
  syncDiscordAvatar,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser } from "./helpers.ts";

const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const avatarUrl = (discordId: string, hash = HASH) =>
  `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png`;
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/3.png";

let picture: Uint8Array;
beforeAll(async () => {
  picture = new Uint8Array(
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "#3a7bd5" } })
      .png()
      .toBuffer(),
  );
});

/** A fake CDN that records the URLs it was asked for. */
function cdn(answer: () => Promise<Uint8Array> = async () => picture) {
  const urls: string[] = [];
  return {
    urls,
    fetchImage: async (url: string) => {
      urls.push(url);
      return answer();
    },
  };
}

const userRow = (id: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id },
    select: { avatarUpdatedAt: true, avatar: { select: { data: true } } },
  });

async function withAvatarUrl(user: { id: string; discordId: string }) {
  await prisma.user.update({ where: { id: user.id }, data: { image: avatarUrl(user.discordId) } });
}

describe("avatarFetchUrl", () => {
  it("asks for real avatars as a 128 px PNG and skips default avatars and other hosts", () => {
    expect(avatarFetchUrl(avatarUrl("123"))).toBe(
      `https://cdn.discordapp.com/avatars/123/${HASH}.png?size=128`,
    );
    // Animated avatars come as a still image.
    expect(avatarFetchUrl(`https://cdn.discordapp.com/avatars/123/a_${HASH}.gif`)).toBe(
      `https://cdn.discordapp.com/avatars/123/a_${HASH}.png?size=128`,
    );
    expect(avatarFetchUrl(DEFAULT_AVATAR)).toBeNull();
    expect(avatarFetchUrl(`https://evil.example/avatars/123/${HASH}.png`)).toBeNull();
    expect(avatarFetchUrl(`${avatarUrl("123")}?x=1`)).toBeNull();
    expect(avatarFetchUrl(null)).toBeNull();
  });
});

describe("syncDiscordAvatar (SPEC N-8)", () => {
  it("stores a 128×128 WebP, drops it for a default avatar and keeps it when fetching fails", async () => {
    const user = await createUser();
    const fake = cdn();
    expect(await syncDiscordAvatar(user.id, avatarUrl(user.discordId), fake.fetchImage, NOW)).toBe(
      "stored",
    );
    expect(fake.urls).toEqual([avatarFetchUrl(avatarUrl(user.discordId))]);
    const stored = await userRow(user.id);
    expect(stored.avatarUpdatedAt).toEqual(NOW);
    expect((await fileTypeFromBuffer(stored.avatar!.data))?.mime).toBe("image/webp");
    const { width, height } = await sharp(stored.avatar!.data).metadata();
    expect([width, height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);

    // Discord down, or something that is no image: the copy stays.
    const later = new Date(NOW.getTime() + 1000);
    const down = cdn(async () => {
      throw new Error("timeout");
    });
    expect(
      await syncDiscordAvatar(user.id, avatarUrl(user.discordId), down.fetchImage, later),
    ).toBe("failed");
    const text = cdn(async () => new TextEncoder().encode("<html>nope</html>"));
    expect(
      await syncDiscordAvatar(user.id, avatarUrl(user.discordId), text.fetchImage, later),
    ).toBe("failed");
    expect((await userRow(user.id)).avatarUpdatedAt).toEqual(NOW);

    // Back to a default avatar: no copy, initials again.
    expect(await syncDiscordAvatar(user.id, DEFAULT_AVATAR, fake.fetchImage, later)).toBe(
      "removed",
    );
    expect(await userRow(user.id)).toEqual({ avatarUpdatedAt: null, avatar: null });
    expect(fake.urls).toHaveLength(1);
  });

  it("never writes a copy onto a deleted account", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: NOW } });
    expect(await syncDiscordAvatar(user.id, avatarUrl(user.discordId), cdn().fetchImage, NOW)).toBe(
      "unchanged",
    );
    expect(await userRow(user.id)).toEqual({ avatarUpdatedAt: null, avatar: null });
  });
});

describe("refreshDiscordAvatar and handleDiscordLogin", () => {
  const profile = (id: string, avatar: string | null) => ({
    id,
    username: "spieler",
    discriminator: "0",
    avatar,
  });

  it("takes the current avatar from Discord's profile, as Better Auth writes it only later", async () => {
    const user = await createUser();
    // The stored address is outdated; the profile has the new hash.
    await prisma.user.update({
      where: { id: user.id },
      data: { image: avatarUrl(user.discordId, "0".repeat(32)) },
    });
    const fake = cdn();
    const tokens: string[] = [];
    const calls = {
      fetchProfile: async (token: string) => {
        tokens.push(token);
        return profile(user.discordId, HASH);
      },
      fetchImage: fake.fetchImage,
    };
    expect(await refreshDiscordAvatar(user.id, "token-1", calls, NOW)).toBe("stored");
    expect(tokens).toEqual(["token-1"]);
    expect(fake.urls).toEqual([avatarFetchUrl(avatarUrl(user.discordId))]);

    const failing = {
      fetchProfile: async () => {
        throw new Error("401");
      },
      fetchImage: fake.fetchImage,
    };
    expect(await refreshDiscordAvatar(user.id, "token-2", failing, NOW)).toBe("failed");
    expect((await userRow(user.id)).avatar).not.toBeNull();
  });

  it("copies the avatar at a Discord login, but not for banned users", async () => {
    for (const banned of [false, true]) {
      const user = await createUser({ banned });
      await prisma.account.updateMany({
        where: { userId: user.id },
        data: { accessToken: "fresh-token" },
      });
      const fake = cdn();
      await handleDiscordLogin(
        user.id,
        async () => true,
        { fetchProfile: async () => profile(user.discordId, HASH), fetchImage: fake.fetchImage },
        NOW,
      );
      expect(fake.urls).toHaveLength(banned ? 0 : 1);
      expect((await userRow(user.id)).avatarUpdatedAt).toEqual(banned ? null : NOW);
    }
  });
});

describe("getUserAvatar", () => {
  it("shows the avatar to the person, teammates and staff, and to nobody else", async () => {
    const { captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await syncDiscordAvatar(captain.id, avatarUrl(captain.discordId), cdn().fetchImage, NOW);
    const view = (viewerId: string) => getUserAvatar({ viewerId, userId: captain.id });

    expect((await view(captain.id)).version).toBe(NOW.getTime());
    expect((await view(members[0]!.id)).data.byteLength).toBeGreaterThan(0);
    const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
    await expect(view(reviewer.id)).resolves.toMatchObject({ version: NOW.getTime() });
    // Staff without 2FA set up, strangers and banned teammates get the same answer as no avatar.
    const noCode = await createUser({ staffRole: StaffRole.ADMIN, twoFactor: false });
    for (const viewer of [noCode, await createUser()]) {
      await expect(view(viewer.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await prisma.user.update({ where: { id: members[0]!.id }, data: { bannedAt: NOW } });
    await expect(view(members[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Without a copy: NOT_FOUND also for the person.
    await expect(
      getUserAvatar({ viewerId: members[0]!.id, userId: members[0]!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleting and backfilling", () => {
  let uploadDir: string;
  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-avatar-"));
  });
  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it("deletes the copy with the account", async () => {
    const user = await createUser();
    await syncDiscordAvatar(user.id, avatarUrl(user.discordId), cdn().fetchImage, NOW);
    await deleteAccount({ userId: user.id, uploadDir, now: NOW });
    expect(await userRow(user.id)).toEqual({ avatarUpdatedAt: null, avatar: null });
    expect(await prisma.userAvatar.count({ where: { userId: user.id } })).toBe(0);
  });

  it("fetches only real avatars without a copy, one after another", async () => {
    // Other test files leave users behind; this one only checks its own.
    const missing = await createUser();
    await withAvatarUrl(missing);
    const copied = await createUser();
    await withAvatarUrl(copied);
    await syncDiscordAvatar(copied.id, avatarUrl(copied.discordId), cdn().fetchImage, NOW);
    const standard = await createUser();
    await prisma.user.update({ where: { id: standard.id }, data: { image: DEFAULT_AVATAR } });
    const banned = await createUser({ banned: true });
    await withAvatarUrl(banned);

    const fake = cdn();
    const counts = await backfillDiscordAvatars(fake.fetchImage, NOW, 0);
    expect(fake.urls).toContain(avatarFetchUrl(avatarUrl(missing.discordId)));
    for (const skipped of [copied, standard, banned]) {
      expect(fake.urls.some((url) => url.includes(`/${skipped.discordId}/`))).toBe(false);
    }
    expect(counts.stored).toBeGreaterThanOrEqual(1);
    expect((await userRow(missing.id)).avatarUpdatedAt).toEqual(NOW);
  });
});
