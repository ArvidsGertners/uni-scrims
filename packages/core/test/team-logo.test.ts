import { crc32 } from "node:zlib";
import { LogoBackground, prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  LOGO_SIZE,
  MAX_LOGO_BYTES,
  getBoard,
  getMyTeam,
  getTeamLogo,
  leaveTeam,
  logoContentBox,
  processTeamLogo,
  removeTeamLogo,
  removeTeamLogoAsAdmin,
  setTeamLogo,
} from "../src/index.ts";
import {
  NOW,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
  createUser,
  useAdmin,
} from "./helpers.ts";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
type Box = { left: number; top: number; width: number; height: number };

/** A transparent canvas with opaque red rectangles. */
async function logo(
  width: number,
  height: number,
  shapes: (Box & { alpha?: number })[],
  format: "png" | "webp" = "png",
): Promise<Uint8Array> {
  const image = sharp({
    create: { width, height, channels: 4, background: TRANSPARENT },
  }).composite(
    shapes.map(({ left, top, width: w, height: h, alpha = 1 }) => ({
      input: {
        create: { width: w, height: h, channels: 4, background: { r: 230, g: 40, b: 40, alpha } },
      },
      left,
      top,
    })),
  );
  return new Uint8Array(
    await (format === "png" ? image.png() : image.webp({ lossless: true })).toBuffer(),
  );
}

/** Size and content box of a stored logo. */
async function inspect(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    alpha[pixel] = data[pixel * info.channels + info.channels - 1]!;
  }
  return {
    width: info.width,
    height: info.height,
    box: logoContentBox(alpha, info.width, info.height),
  };
}

/** The PNG with an acTL chunk after IHDR, as animated PNGs have. */
function withAnimationChunk(png: Uint8Array): Uint8Array {
  const data = Buffer.alloc(8); // 1 frame, endless
  data.writeUInt32BE(1, 0);
  const type = Buffer.from("acTL");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
  const afterHeader = 8 + 25; // signature, IHDR
  return Buffer.concat([png.subarray(0, afterHeader), chunk, png.subarray(afterHeader)]);
}

function touchedEdges(box: Box): number {
  return [
    box.left === 0,
    box.top === 0,
    box.left + box.width === LOGO_SIZE,
    box.top + box.height === LOGO_SIZE,
  ].filter(Boolean).length;
}

describe("logoContentBox", () => {
  it("finds the rectangle of visible pixels and ignores faint ones", () => {
    const alpha = new Uint8Array(5 * 4);
    alpha[1 * 5 + 1] = 255;
    alpha[2 * 5 + 3] = 9;
    alpha[3 * 5 + 4] = 8; // up to the threshold counts as transparent
    expect(logoContentBox(alpha, 5, 4)).toEqual({ left: 1, top: 1, width: 3, height: 2 });
    expect(logoContentBox(new Uint8Array(20).fill(8), 5, 4)).toBeNull();
  });
});

describe("processTeamLogo (SPEC N-6)", () => {
  it("trims transparent margins and fits a wide logo into the square, touching left and right", async () => {
    const result = await processTeamLogo(
      await logo(600, 400, [{ left: 100, top: 50, width: 200, height: 150 }]),
    );
    expect((await fileTypeFromBuffer(result))?.mime).toBe("image/webp");
    const { width, height, box } = await inspect(result);
    expect([width, height]).toEqual([LOGO_SIZE, LOGO_SIZE]);
    expect(box).toMatchObject({ left: 0, width: LOGO_SIZE });
    // 200×150 scaled to 256 wide is 192 high, centred.
    expect(box!.height).toBeGreaterThanOrEqual(191);
    expect(box!.height).toBeLessThanOrEqual(193);
    expect(touchedEdges(box!)).toBe(2);
  });

  it("fits a tall logo touching top and bottom, and a square one touching all edges", async () => {
    const tall = await inspect(
      await processTeamLogo(
        await logo(500, 500, [{ left: 300, top: 20, width: 100, height: 300 }]),
      ),
    );
    expect(tall.box).toMatchObject({ top: 0, height: LOGO_SIZE });
    expect(touchedEdges(tall.box!)).toBe(2);
    const square = await inspect(
      await processTeamLogo(await logo(400, 400, [{ left: 10, top: 30, width: 300, height: 300 }])),
    );
    expect(square.box).toEqual({ left: 0, top: 0, width: LOGO_SIZE, height: LOGO_SIZE });
  });

  it("takes WebP and lets nearly invisible pixels not hold a margin", async () => {
    const result = await inspect(
      await processTeamLogo(
        await logo(
          600,
          600,
          [
            { left: 200, top: 200, width: 200, height: 150 },
            // alpha 0.02 ≈ 5 of 255: leftovers in a corner
            { left: 0, top: 0, width: 20, height: 20, alpha: 0.02 },
          ],
          "webp",
        ),
      ),
    );
    expect(result.box).toMatchObject({ left: 0, width: LOGO_SIZE });
  });

  it("rejects other formats, images without alpha channel and animations", async () => {
    const jpeg = new Uint8Array(
      await sharp({ create: { width: 200, height: 200, channels: 3, background: "#e62828" } })
        .jpeg()
        .toBuffer(),
    );
    await expect(processTeamLogo(jpeg)).rejects.toMatchObject({
      code: "INVALID",
      message: "Erlaubt sind nur PNG und WebP.",
    });
    const opaque = new Uint8Array(
      await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } })
        .png()
        .toBuffer(),
    );
    await expect(processTeamLogo(opaque)).rejects.toThrow("durchsichtigen Hintergrund");
    // Two frames of 200×200 stacked; pageHeight makes sharp write them as an animation.
    const frames = Buffer.alloc(200 * 400 * 4);
    for (let pixel = 0; pixel < 200 * 150; pixel++) frames.set([230, 40, 40, 255], pixel * 4);
    const animated = new Uint8Array(
      await sharp(frames, { raw: { width: 200, height: 400, channels: 4, pageHeight: 200 } })
        .webp({ lossless: true, loop: 0 })
        .toBuffer(),
    );
    await expect(processTeamLogo(animated)).rejects.toThrow("Animierte Logos gehen nicht.");
    // An animated PNG: file-type sees the acTL chunk and calls it image/apng.
    await expect(
      processTeamLogo(
        withAnimationChunk(await logo(200, 200, [{ left: 0, top: 0, width: 150, height: 150 }])),
      ),
    ).rejects.toThrow("Animierte Logos gehen nicht.");
  });

  it("turns the image upright by its EXIF orientation first", async () => {
    // Wide content, stored turned: orientation 6 shows it rotated by 90°, so tall.
    const turned = new Uint8Array(
      await sharp(await logo(600, 400, [{ left: 100, top: 100, width: 300, height: 100 }]))
        .withMetadata({ orientation: 6 })
        .webp({ lossless: true })
        .toBuffer(),
    );
    expect((await sharp(turned).metadata()).orientation).toBe(6);
    const { box } = await inspect(await processTeamLogo(turned));
    expect(box).toMatchObject({ top: 0, height: LOGO_SIZE });
  });

  it("turns uploads away while too many logos are processed", async () => {
    const file = await logo(1500, 1000, [{ left: 100, top: 100, width: 1200, height: 800 }]);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => processTeamLogo(file)),
    );
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({ code: "CONFLICT" });
    }
    // Once the queue is empty, the next upload goes through.
    await expect(processTeamLogo(file)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("rejects empty, fully transparent, too small, too large and too many pixels", async () => {
    await expect(processTeamLogo(new Uint8Array())).rejects.toThrow("Die Datei ist leer.");
    await expect(processTeamLogo(await logo(300, 300, []))).rejects.toThrow(
      "Das Logo ist komplett durchsichtig.",
    );
    await expect(
      processTeamLogo(await logo(800, 800, [{ left: 300, top: 300, width: 127, height: 90 }])),
    ).rejects.toThrow("Das Logo ist zu klein");
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(await logo(200, 200, [{ left: 0, top: 0, width: 150, height: 150 }]));
    await expect(processTeamLogo(big)).rejects.toThrow("Die Datei ist größer als 2 MB.");
    await expect(
      processTeamLogo(await logo(5000, 10, [{ left: 0, top: 0, width: 300, height: 10 }])),
    ).rejects.toThrow("Das Bild ist zu groß");
  });
});

describe("team logo actions", () => {
  const admin = useAdmin();
  const { DARK, LIGHT } = LogoBackground;
  const upload = () => logo(400, 300, [{ left: 50, top: 50, width: 200, height: 150 }]);
  const set = async (userId: string, teamId: string, background: LogoBackground, now = NOW) =>
    setTeamLogo({ userId, teamId, background, file: await upload(), now });
  const teamRow = (id: string) => prisma.team.findUniqueOrThrow({ where: { id } });
  const later = new Date(NOW.getTime() + 1000);
  const evenLater = new Date(NOW.getTime() + 2000);

  it("lets the captain set, replace and remove one logo per background; others see each", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      verifiedCaptain: false,
      extraMembers: 1,
    });
    await set(captain.id, team.id, DARK);
    expect((await teamRow(team.id)).logoUpdatedAt).toEqual(NOW);
    const viewer = await createUser();
    const fetch = (background: LogoBackground) =>
      getTeamLogo({ userId: viewer.id, teamId: team.id, background });
    const dark = await fetch(DARK);
    expect(dark.version).toBe(NOW.getTime());
    expect((await inspect(dark.data)).width).toBe(LOGO_SIZE);
    await expect(fetch(LIGHT)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Replacing keeps one row per background; the version covers both URLs.
    await set(captain.id, team.id, LIGHT, later);
    await set(captain.id, team.id, LIGHT, later);
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(2);
    expect((await fetch(DARK)).version).toBe(later.getTime());

    await expect(
      removeTeamLogo({ userId: members[0]!.id, teamId: team.id, background: DARK, now: later }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await removeTeamLogo({ userId: captain.id, teamId: team.id, background: DARK, now: evenLater });
    // One logo is left, so the version moves on instead of ending.
    expect((await teamRow(team.id)).logoUpdatedAt).toEqual(evenLater);
    await expect(fetch(DARK)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await fetch(LIGHT)).version).toBe(evenLater.getTime());
    await removeTeamLogo({
      userId: captain.id,
      teamId: team.id,
      background: LIGHT,
      now: evenLater,
    });
    expect((await teamRow(team.id)).logoUpdatedAt).toBeNull();
  });

  it("refuses members without the captain role, outsiders, banned teams and unknown backgrounds", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    for (const userId of [members[0]!.id, (await createUser()).id]) {
      await expect(set(userId, team.id, DARK)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(set(captain.id, team.id, "BLUE" as LogoBackground)).rejects.toMatchObject({
      code: "INVALID",
    });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(set(captain.id, team.id, LIGHT)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("lets admins remove both logos, also of a banned team; banned users cannot fetch logos", async () => {
    const { team, captain } = await createTeamWithMembers();
    await set(captain.id, team.id, DARK);
    await set(captain.id, team.id, LIGHT);
    const logoVersion = NOW.getTime();
    await expect(
      removeTeamLogoAsAdmin({ adminId: captain.id, teamId: team.id, logoVersion }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const banned = await createUser({ banned: true });
    await expect(
      getTeamLogo({ userId: banned.id, teamId: team.id, background: DARK }),
    ).rejects.toMatchObject({ code: "BANNED" });

    // A state the admin did not see (changed meanwhile) stays.
    await expect(
      removeTeamLogoAsAdmin({ adminId: admin.id, teamId: team.id, logoVersion: logoVersion - 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(2);

    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await removeTeamLogoAsAdmin({ adminId: admin.id, teamId: team.id, logoVersion });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
    expect((await teamRow(team.id)).logoUpdatedAt).toBeNull();
  });

  it("deletes both logos when the team is dissolved", async () => {
    const { team, captain } = await createTeamWithMembers();
    await set(captain.id, team.id, DARK);
    await set(captain.id, team.id, LIGHT);
    await leaveTeam({ userId: captain.id, now: NOW });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
    expect(await teamRow(team.id)).toMatchObject({ dissolvedAt: NOW, logoUpdatedAt: null });
    await expect(
      removeTeamLogoAsAdmin({ adminId: admin.id, teamId: team.id, logoVersion: NOW.getTime() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives team reads the version and the backgrounds with a logo", async () => {
    const viewer = await createReadyTeam();
    const author = await createReadyTeam();
    await set(author.captain.id, author.team.id, LIGHT);
    const request = await createOpenRequest(author.captain.id);
    const card = async () =>
      (await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW })).requests.find(
        (item) => item.id === request.id,
      )?.team.logo;
    expect(await card()).toEqual({ version: NOW.getTime(), backgrounds: [LIGHT] });
    await set(author.captain.id, author.team.id, DARK, later);
    // Always in the order DARK, LIGHT.
    expect(await card()).toEqual({ version: later.getTime(), backgrounds: [DARK, LIGHT] });
    // The own team comes from findOwnTeam, its logos from an extra query.
    expect((await getMyTeam(author.captain.id))?.logo).toEqual({
      version: later.getTime(),
      backgrounds: [DARK, LIGHT],
    });
    expect((await getMyTeam(viewer.captain.id))?.logo).toBeNull();
  });
});
