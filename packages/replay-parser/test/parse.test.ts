import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initParserSync, parseReplay, parserVersion, type UtilitySpawn } from "../src/index.ts";

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
// A second one (Swiftplay on Split: Deadlock, Clove, Reyna, Pine).
const LOCAL_REPLAY_2 = path.resolve(root, "../../replays/9d636ef5-4dd0-4fd8-be89-dd3f667cf518.vrf");
// Two more Swiftplays: Killjoy, Sage, Raze, Neon, Miks; Cypher, Sage, Miks.
const LOCAL_REPLAY_3 = path.resolve(root, "../../replays/770394ae-b2d9-48da-b2fb-0ea10c1c19aa.vrf");
const LOCAL_REPLAY_4 = path.resolve(root, "../../replays/9b5967c6-ce75-4ec6-85f3-f787b6fe4af6.vrf");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function publicFixture(): Promise<Uint8Array> {
  const file = path.join(CACHE, path.basename(FIXTURE.url));
  if (existsSync(file)) {
    const cached = readFileSync(file);
    if (sha256(cached) === FIXTURE.sha256) return cached;
  }
  const response = await fetch(FIXTURE.url);
  if (!response.ok) throw new Error(`fixture download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha = sha256(bytes);
  if (sha !== FIXTURE.sha256) throw new Error(`fixture SHA-256 ${sha}, expected ${FIXTURE.sha256}`);
  // Only a verified file reaches the cache, renamed into place in one step.
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file);
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
    // A snippet with one ability charge (Cypher's E) and no ult change.
    expect(meta.abilities).toEqual([expect.objectContaining({ player: 0, slot: "ability2" })]);
    expect(meta.ults).toEqual([]);
    expect(meta.stats).toMatchObject({ chargeRowsUnresolved: 0, ultRowsUnresolved: 0 });
    // Cypher's actors are there, but nothing he placed.
    expect(meta.utility).toEqual([]);
    expect(meta.stats).toMatchObject({ utilityRowsUnresolved: 0, utilityOwnerUnresolved: 0 });

    expect(movement.timeMs).toHaveLength(4991);
    for (const column of [movement.character, movement.x, movement.y, movement.z, movement.yaw]) {
      expect(column).toHaveLength(4991);
    }
    expect(movement.x.every(Number.isFinite)).toBe(true);
    expect(meta.timestampTicks).toMatch(/^\d{17,}$/);
  }, 60_000);

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

  // Plausibility instead of a comparison with the in-game replay (user
  // decision, docs/replay-viewer.md R2): the values must fit what else the
  // replay says about each player.
  it.skipIf(!existsSync(LOCAL_REPLAY))(
    "maps charges and ult points of a 13.08 match to the right player and slot",
    () => {
      const { meta } = parseReplay(readFileSync(LOCAL_REPLAY), ["NewCurrentEquippable"]);
      expect(meta.stats.chargeRowsUnresolved).toBe(0);
      expect(meta.stats.ultRowsUnresolved).toBe(0);

      const playerOfCharacter = new Map<number, number>();
      meta.players.forEach((p, i) => p.characters.forEach((c) => playerOfCharacter.set(c, i)));
      const className = new Map<number, string>();
      for (const a of meta.actors) {
        if (a.event === "open" && a.class) className.set(a.guid, a.class.split("/").at(-1)!);
      }

      // Every player: an ult stream, charges in C, Q and E, values in range.
      for (let p = 0; p < meta.players.length; p++) {
        expect(meta.ults.some((u) => u.player === p)).toBe(true);
        const slots = new Set(meta.abilities.filter((a) => a.player === p).map((a) => a.slot));
        for (const slot of ["grenade", "ability1", "ability2"] as const) {
          expect(slots.has(slot), `player ${p} ${slot}`).toBe(true);
        }
      }
      expect(meta.abilities.every((a) => a.charges >= 0 && a.charges <= 8)).toBe(true);
      expect(meta.ults.every((u) => u.points >= 0 && u.points <= 9)).toBe(true);

      // Ult: within 1 s of every use, that player's ult turns active or is
      // spent (Jett's last knife ends it at once). A later use while the ult
      // a confirmed use started is still active continues it (Jett's knives).
      const uses = meta.events.filter((e) => e.group === "characterUltimateUsed");
      expect(uses).toHaveLength(32);
      const confirmed = new Map<number, number>();
      for (const use of uses) {
        const player = playerOfCharacter.get(use.words[0]!);
        expect(player).toBeDefined();
        const reacts = meta.ults.some(
          (u) =>
            u.player === player &&
            u.t >= use.t &&
            u.t <= use.t + 1000 &&
            (u.active || u.points === 0),
        );
        const latest = meta.ults.filter((u) => u.player === player && u.t <= use.t).at(-1);
        const continues =
          latest?.active === true && latest.t >= (confirmed.get(player!) ?? Infinity);
        expect(reacts || continues, `ult use at ${use.t}`).toBe(true);
        if (reacts) confirmed.set(player!, use.t);
      }

      // Charges: a cast is mostly preceded by equipping that ability, so per
      // slot the ability equipped last before a drop names the slot. The
      // class folder does not: Omen's smoke is `Ability_4` but his E.
      const equips = meta.fields
        .filter((f) => f.name === "NewCurrentEquippable" && f.int)
        .map((f) => ({
          t: f.t,
          player: playerOfCharacter.get(f.actor),
          ability: className.get(f.int!)?.split(".")[0] ?? "",
        }));
      const before = new Map<string, number>();
      const equippedBeforeDrop = new Map<string, Map<string, number>>();
      for (const a of meta.abilities) {
        const key = `${a.player} ${a.slot}`;
        const previous = before.get(key);
        before.set(key, a.charges);
        if (previous === undefined || a.charges >= previous) continue;
        const equip = equips
          .filter((e) => e.player === a.player && e.t <= a.t && e.t >= a.t - 10_000)
          .at(-1);
        const counts = equippedBeforeDrop.get(key) ?? new Map<string, number>();
        counts.set(equip?.ability ?? "", (counts.get(equip?.ability ?? "") ?? 0) + 1);
        equippedBeforeDrop.set(key, counts);
      }
      const usual = (player: number, slot: string): string => {
        const counts = [...(equippedBeforeDrop.get(`${player} ${slot}`) ?? [])];
        return counts.sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
      };
      const agentOf = (player: number): string =>
        /^(\w+?)_PC\./.exec(className.get(meta.players[player]!.characters.at(-1)!) ?? "")?.[1] ??
        "";
      const expected: Record<string, Record<string, string>> = {
        Wraith: { grenade: "Ability_Wraith_E_ShortTeleport", ability2: "Ability_Wraith_4_Smoke" },
        Hunter: {
          grenade: "Ability_Hunter_E_DeployDrone",
          ability1: "Ability_Hunter_4_BoltExplosive",
          ability2: "Ability_Hunter_Q_RevealBolt_Signature",
        },
        Nox: { grenade: "Ability_Nox_BarbedWire", ability1: "Ability_Nox_Wall" },
        BountyHunter: {
          grenade: "Ability_BountyHunter_4_WolfHoundBendable",
          ability2: "Ability_E_BountyHunter_ReconDivebomb",
        },
      };
      for (let p = 0; p < meta.players.length; p++) {
        for (const [slot, ability] of Object.entries(expected[agentOf(p)] ?? {})) {
          expect(usual(p, slot), `${agentOf(p)} ${slot}`).toBe(ability);
        }
      }
      expect(
        Object.keys(expected).every((agent) => meta.players.some((_, p) => agentOf(p) === agent)),
      ).toBe(true);
    },
    60_000,
  );

  // Plausibility as in R2 (docs/replay-viewer.md R3a, R3b): every piece of
  // utility must fit what else the replay says about the match and its owner.
  // A shape check runs where its agent played; together the replays must run
  // every one of them.
  const localReplays = [LOCAL_REPLAY, LOCAL_REPLAY_2, LOCAL_REPLAY_3, LOCAL_REPLAY_4];
  const shapeChecks = new Set<string>();
  for (const replay of localReplays) {
    it.skipIf(!existsSync(replay))(
      `places the utility of ${path.basename(replay)} with owner, shape and lifetime`,
      () => {
        const { meta, movement } = parseReplay(readFileSync(replay), []);
        expect(meta.stats).toMatchObject({ utilityRowsUnresolved: 0, utilityOwnerUnresolved: 0 });
        const spawns = meta.utility.filter((e): e is UtilitySpawn => e.type === "spawn");
        expect(spawns.length).toBeGreaterThan(50);
        expect(spawns.every((s) => s.verified && s.player !== null)).toBe(true);
        const ofKind = (kind: string) => spawns.filter((s) => s.kind === kind);
        const check = (name: string, pieces: unknown[]) => {
          if (pieces.length > 0) shapeChecks.add(name);
          return pieces.length > 0;
        };

        // Lifetime: one spawn per piece, updates while it lives, the end last.
        const life = new Map<number, { end?: number }>();
        for (const e of meta.utility) {
          const piece = life.get(e.id);
          if (e.type === "spawn") {
            const live = piece !== undefined && piece.end === undefined;
            expect(live, `spawn of live ${e.id}`).toBe(false);
            life.set(e.id, {});
          } else {
            expect(piece && piece.end === undefined, `${e.type} of ${e.id}`).toBe(true);
            if (e.type === "end") piece!.end = e.t;
          }
        }
        expect(meta.utility.map((e) => e.t)).toEqual(
          meta.utility.map((e) => e.t).sort((a, b) => a - b),
        );

        // Position: on the map, i.e. within where the players walked.
        const range = (column: Float32Array): [number, number] =>
          column.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);
        const [minX, maxX] = range(movement.x);
        const [minY, maxY] = range(movement.y);
        for (const s of spawns) {
          expect(s.pos[0] >= minX - 500 && s.pos[0] <= maxX + 500, `${s.kind} x`).toBe(true);
          expect(s.pos[1] >= minY - 500 && s.pos[1] <= maxY + 500, `${s.kind} y`).toBe(true);
        }

        // Owner: the piece belongs to the agent that has it (internal names).
        const className = new Map<number, string>();
        for (const a of meta.actors) {
          if (a.event === "open" && a.class) className.set(a.guid, a.class.split(".").at(-1)!);
        }
        const agentOf = (player: number): string =>
          className.get(meta.players[player]!.characters.at(-1)!)?.replace(/_PC_C$/, "") ?? "";
        const agentClasses: Record<string, RegExp> = {
          Cable: /_(Cable|CableJam|StealthingTrap)/,
          Gumshoe: /Gumshoe/,
          Iris: /_(Iris|Thumper)_/,
        };
        for (const s of spawns) {
          const agent = agentOf(s.player!);
          const pattern = agentClasses[agent] ?? new RegExp(`_${agent}_`);
          expect(pattern.test(s.kind), `${s.kind} of ${agent}`).toBe(true);
        }

        // Pawns: tracked, with their path in the movement columns; a spawn
        // without a rotation (yaw 0 is left out) still turns in movement.
        const moved = new Set(movement.character);
        const pawns = spawns.filter((s) => s.kind.startsWith("Pawn_"));
        expect(spawns.every((s) => s.track === s.kind.startsWith("Pawn_"))).toBe(true);
        for (const pawn of pawns) expect(moved.has(pawn.id), `${pawn.kind} path`).toBe(true);
        const facing = [
          ...ofKind("Pawn_Killjoy_E_Turret"),
          ...ofKind("Pawn_Killjoy_Q_StealthAlarmbot"),
        ];
        if (check("turret", facing)) expect(facing.every((s) => s.yaw !== null)).toBe(true);
        check("camera", ofKind("Pawn_Gumshoe_E_PossessableCamera"));

        // Segments: Vyse's Shear is 1200 units long unless a wall cut it
        // short; its raised wall has the trap's ends; Deadlock's mesh arms
        // start at the mesh's root.
        const length = (s: UtilitySpawn) => Math.hypot(s.a![0] - s.b![0], s.a![1] - s.b![1]);
        const traps = ofKind("GameObject_Nox_WallTrap");
        if (check("shear", traps)) {
          expect(traps.every((s) => s.a && s.b && length(s) <= 1200.5)).toBe(true);
          expect(traps.filter((s) => Math.abs(length(s) - 1200) < 0.5).length).toBeGreaterThan(
            traps.length / 2,
          );
        }
        for (const wall of ofKind("GameObject_Nox_Wall")) {
          const trap = traps.find(
            (s) =>
              s.player === wall.player && s.t <= wall.t && s.a!.every((v, i) => v === wall.a![i]),
          );
          expect(trap, `trap of the wall at ${wall.t}`).toBeDefined();
        }
        const roots = ofKind("GameObject_CableJamRoot");
        const arms = ofKind("GameObject_CableJam_CableDeployer_Precomputed");
        if (check("mesh", arms)) {
          for (const arm of arms) {
            const root = roots.find((r) => r.t === arm.t);
            expect(arm.a && arm.b).toBeTruthy();
            expect(
              root && Math.hypot(root.pos[0] - arm.a![0], root.pos[1] - arm.a![1]),
            ).toBeLessThan(1);
          }
        }

        // Cypher's tripwire: one piece from both anchors, as long as a wire
        // can be.
        const wires = ofKind("GameObject_Gumshoe_4_TripWire");
        if (check("tripwire", wires)) {
          for (const w of wires) {
            expect(w.a && w.b, `wire at ${w.t}`).toBeTruthy();
            expect(w.a!.every((v, i) => Math.abs(v - w.pos[i]!) < 0.01)).toBe(true);
            expect(length(w)).toBeGreaterThan(300);
            expect(length(w)).toBeLessThan(1500);
          }
        }

        // Landings: Killjoy's swarm activates where its grenade landed, Raze's
        // bomblets land around their burst, his Blast Packs explode where they
        // stuck (one may go off in the air).
        const near = (a: UtilitySpawn, b: UtilitySpawn) =>
          Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
        const swarms = ofKind("Projectile_Killjoy_4_RemoteBees_MultiDetonate");
        const bees = ofKind("GameObject_Killjoy_4_BeeSwarm_Damage");
        if (check("nanoswarm", bees)) {
          for (const b of bees) {
            const swarm = swarms.find((s) => s.player === b.player && near(s, b) < 1);
            expect(swarm, `swarm of the bees at ${b.t}`).toBeDefined();
          }
        }
        const bursts = ofKind("Projectile_Clay_4_Projectile_SecondarySpawner");
        const bomblets = ofKind("Projectile_Clay_4_Projectile_Secondary");
        if (check("paint shells", bomblets)) {
          for (const b of bomblets) {
            const burst = bursts.find(
              (s) => s.player === b.player && s.t <= b.t && near(s, b) < 800,
            );
            expect(burst, `burst of the bomblet at ${b.t}`).toBeDefined();
          }
        }
        const packs = ofKind("Projectile_Clay_Q_Satchel_Arming");
        const blasts = ofKind("GameObject_Clay_Q_Explosion");
        if (check("blast pack", blasts)) {
          expect(blasts.filter((e) => packs.some((p) => near(p, e) < 1)).length).toBeGreaterThan(
            blasts.length / 2,
          );
        }

        // Sage's wall: its segments open with it, around it.
        const sageWalls = ofKind("GameObject_Thorne_E_Wall_Fortifying");
        const sageSegments = ofKind("GameObject_Thorne_E_Wall_Segment_Fortifying");
        if (check("sage wall", sageSegments)) {
          for (const seg of sageSegments) {
            const wall = sageWalls.find(
              (w) => w.player === seg.player && w.t === seg.t && near(w, seg) < 400,
            );
            expect(wall, `wall of the segment at ${seg.t}`).toBeDefined();
          }
        }

        // Polylines: Phoenix's Blaze and Neon's Fast Lane grow away from
        // their first point.
        const points = new Map<number, number[][]>();
        for (const e of meta.utility) {
          if (e.type === "update" && e.point)
            points.set(e.id, [...(points.get(e.id) ?? []), e.point]);
        }
        for (const [name, kind] of [
          ["blaze", "GameObject_Phoenix_Q_FlameWallManager_Production"],
          ["fast lane", "GameObject_Sprinter_4_Tunnel"],
        ] as const) {
          const walls = ofKind(kind);
          if (!check(name, walls)) continue;
          for (const wall of walls) {
            const line = points.get(wall.id) ?? [];
            expect(line.length, `${name} at ${wall.t}`).toBeGreaterThan(1);
            const away = line.map((p) => Math.hypot(p[0]! - line[0]![0]!, p[1]! - line[0]![1]!));
            expect(away.every((d, i) => i === 0 || d >= away[i - 1]!)).toBe(true);
          }
        }

        // Chamber's Trademark always faces somewhere.
        const trademarks = ofKind("GameObject_Deadeye_E_Trap");
        if (check("trademark", trademarks)) {
          expect(trademarks.every((s) => s.yaw !== null)).toBe(true);
        }
      },
      60_000,
    );
  }

  it.skipIf(!localReplays.every((r) => existsSync(r)))(
    "runs every utility shape check in one of the local replays",
    () => {
      expect([...shapeChecks].sort()).toEqual(
        [
          "blast pack",
          "blaze",
          "camera",
          "fast lane",
          "mesh",
          "nanoswarm",
          "paint shells",
          "sage wall",
          "shear",
          "trademark",
          "tripwire",
          "turret",
        ].sort(),
      );
    },
  );

  it("throws on bytes that are not a replay", () => {
    expect(() => parseReplay(new Uint8Array(64), [])).toThrow();
  });
});
