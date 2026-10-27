import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initParserSync, parseReplay, parserVersion } from "../src/index.ts";

const root = path.resolve(import.meta.dirname, "..");

// Public test replay (build 13.00, a 39 s snippet) that vrfkit's CI uses:
// fetched by pinned commit + SHA-256, never copied into the repo.
const FIXTURE = {
  url: "https://raw.githubusercontent.com/michel-giehl/ValorantReplayParser/b51d67423b7b4952d59051cf91e55efa1c42da05/tests/Test.Integration/Replays/12974d2b-848f-490d-80ba-5f03a033c2d5.13_00.vrf",
  sha256: "fd49091dd43171bb060eb6bbae50ed6677aa1077344572c5bf65f0c6fe2b4c1a",
};
const CACHE = path.resolve(root, "../../node_modules/.cache/replay-fixtures");

// A real match on the current build, git-ignored (real replays never go into
// git). Checked when present, skipped otherwise.
const LOCAL_REPLAY = path.resolve(root, "../../replays/1b9fe9b9-9f0e-40e0-b6e1-8c24b20a9bfd.vrf");

async function publicFixture(): Promise<Uint8Array> {
  const file = path.join(CACHE, path.basename(FIXTURE.url));
  if (!existsSync(file)) {
    const response = await fetch(FIXTURE.url);
    if (!response.ok) throw new Error(`fixture download failed: ${response.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== FIXTURE.sha256) throw new Error(`fixture SHA-256 ${sha}, expected ${FIXTURE.sha256}`);
  return bytes;
}

beforeAll(() => {
  initParserSync(readFileSync(path.join(root, "wasm/vrf_wasm_bg.wasm")));
});

describe("replay parser (WASM)", () => {
  it("names the fork version that wasm/source.json records", () => {
    const source = JSON.parse(readFileSync(path.join(root, "wasm/source.json"), "utf8")) as {
      tag: string;
    };
    expect(source.tag).toBe(`us-v${parserVersion()}`);
  });

  it("parses the public 13.00 replay into events, actors and movement", async () => {
    const { meta, movement } = parseReplay(await publicFixture(), ["NumUltimatePoints"]);

    expect(meta.branch).toBe("++Ares-Core+release-13.00");
    // The same counts as `vrfkit export` of this file.
    expect(meta.stats).toMatchObject({
      lostContentBlocks: 0,
      malformedContentBlocks: 0,
      unknownChunks: 0,
      eventLayoutMismatches: 0,
      fieldRowsSeen: 12181,
      movementRows: 4991,
    });
    expect(meta.events).toHaveLength(6);
    expect(meta.actors).toHaveLength(98);
    expect(meta.players).toHaveLength(1);
    expect(meta.fields.every((f) => f.name === "NumUltimatePoints")).toBe(true);

    expect(movement.timeMs).toHaveLength(4991);
    for (const column of [movement.character, movement.x, movement.y, movement.z, movement.yaw]) {
      expect(column).toHaveLength(4991);
    }
    expect(movement.x.every(Number.isFinite)).toBe(true);
  });

  it.skipIf(!existsSync(LOCAL_REPLAY))(
    "parses a full 13.08 match with every player, round and sample",
    () => {
      const { meta, movement } = parseReplay(readFileSync(LOCAL_REPLAY), [
        "NumUltimatePoints",
        "RoundResults",
      ]);

      expect(meta.branch).toBe("++Ares-Core+release-13.08");
      expect(meta.stats.lostContentBlocks).toBe(0);
      expect(meta.players).toHaveLength(10);
      expect(meta.events).toHaveLength(195);
      expect(meta.events.filter((e) => e.group === "roundStarted")).toHaveLength(17);
      expect(meta.actors).toHaveLength(3979);
      expect(meta.stats.fieldRowsSeen).toBe(1285783);
      expect(movement.x).toHaveLength(1949925);
      expect(meta.fields.some((f) => f.name === "NumUltimatePoints")).toBe(true);
    },
    60_000,
  );

  it("throws on bytes that are not a replay", () => {
    expect(() => parseReplay(new Uint8Array(64), [])).toThrow();
  });
});
