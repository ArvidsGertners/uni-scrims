import { prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  LOGO_SIZE,
  MAX_LOGO_BYTES,
  getBoard,
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
  const upload = () => logo(400, 300, [{ left: 50, top: 50, width: 200, height: 150 }]);

  it("lets the captain set, replace and remove the logo; others see it", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      verifiedCaptain: false,
      extraMembers: 1,
    });
    await setTeamLogo({ userId: captain.id, teamId: team.id, file: await upload(), now: NOW });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
      logoUpdatedAt: NOW,
    });
    const viewer = await createUser();
    const stored = await getTeamLogo({ userId: viewer.id, teamId: team.id });
    expect((await inspect(stored)).width).toBe(LOGO_SIZE);

    const later = new Date(NOW.getTime() + 1000);
    await setTeamLogo({ userId: captain.id, teamId: team.id, file: await upload(), now: later });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(1);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).logoUpdatedAt).toEqual(
      later,
    );

    await expect(removeTeamLogo({ userId: members[0]!.id, teamId: team.id })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await removeTeamLogo({ userId: captain.id, teamId: team.id });
    expect(
      (await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).logoUpdatedAt,
    ).toBeNull();
    await expect(getTeamLogo({ userId: viewer.id, teamId: team.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses members without the captain role, outsiders and banned teams", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const file = await upload();
    for (const userId of [members[0]!.id, (await createUser()).id]) {
      await expect(setTeamLogo({ userId, teamId: team.id, file, now: NOW })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(
      setTeamLogo({ userId: captain.id, teamId: team.id, file, now: NOW }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Das Team ist gesperrt." });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("lets admins remove a logo, also of a banned team; banned users cannot fetch logos", async () => {
    const { team, captain } = await createTeamWithMembers();
    await setTeamLogo({ userId: captain.id, teamId: team.id, file: await upload(), now: NOW });
    await expect(
      removeTeamLogoAsAdmin({ adminId: captain.id, teamId: team.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const banned = await createUser({ banned: true });
    await expect(getTeamLogo({ userId: banned.id, teamId: team.id })).rejects.toMatchObject({
      code: "BANNED",
    });

    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await removeTeamLogoAsAdmin({ adminId: admin.id, teamId: team.id });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
    expect(
      (await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).logoUpdatedAt,
    ).toBeNull();
  });

  it("deletes the logo when the team is dissolved", async () => {
    const { team, captain } = await createTeamWithMembers();
    await setTeamLogo({ userId: captain.id, teamId: team.id, file: await upload(), now: NOW });
    await leaveTeam({ userId: captain.id, now: NOW });
    expect(await prisma.teamLogo.count({ where: { teamId: team.id } })).toBe(0);
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
      dissolvedAt: NOW,
      logoUpdatedAt: null,
    });
    await expect(
      removeTeamLogoAsAdmin({ adminId: admin.id, teamId: team.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives team cards the logo version for the URL", async () => {
    const viewer = await createReadyTeam();
    const author = await createReadyTeam();
    await setTeamLogo({
      userId: author.captain.id,
      teamId: author.team.id,
      file: await upload(),
      now: NOW,
    });
    const request = await createOpenRequest(author.captain.id);
    const board = await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW });
    expect(board.requests.find((card) => card.id === request.id)?.team.logoVersion).toBe(
      NOW.getTime(),
    );
  });
});
