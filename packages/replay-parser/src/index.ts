// Typed wrapper around the parser fork's WebAssembly build (wasm/, see README).
// Runs in a browser Web Worker and in Node: load the module once with
// initParser / initParserSync, then call parseReplay per file.
//
// WebAssembly memory only grows: after a 60 MB match the instance keeps ~300 MB
// for its lifetime. Parse each file in a fresh Worker and terminate it after.
import init, { initSync, parse, version } from "../wasm/vrf_wasm.js";

export type ReplayPlayer = {
  /** Account UUID (Riot "subject"). */
  subject: string;
  /** The player-state actor GUID. */
  state: number;
  /** Character actor GUIDs (movement `character`), the current body last. */
  characters: number[];
};

export type ReplayEvent = {
  t: number;
  /** e.g. characterDeath, roundStarted, spikePlanted. */
  group: string;
  metadata: string;
  words: [number | null, number | null];
  tag: number | null;
  name: string | null;
  seconds: number | null;
};

export type ReplayActor = {
  t: number;
  guid: number;
  event: string;
  class: string | null;
  archetype: string | null;
  pos: [number, number, number] | null;
  /** Pitch, yaw, roll in degrees. */
  rot: [number, number, number] | null;
};

export type ReplayField = {
  t: number;
  actor: number;
  object: number | null;
  group: string;
  name: string;
  bits: number;
  /** Undecoded payload bytes, for fields the parser leaves raw. */
  raw: number[] | null;
  /** The integer value when a JS number holds it exactly. */
  int: number | null;
  /** The integer value as a decimal string beyond ±(2^53 - 1); `int` is null then. */
  intText: string | null;
  float: number | null;
  bool: boolean | null;
  str: string | null;
};

/**
 * The in-game ability slot, named like valorant-api's `slot` (Grenade = C,
 * Ability1 = Q, Ability2 = E); the key label comes from the agent data.
 */
export type AbilitySlot = "grenade" | "ability1" | "ability2" | "passive" | "ultimate";

/** An ability's charges changed (temporary charges included). */
export type ChargeChange = {
  t: number;
  /** Index into `players`. */
  player: number;
  slot: AbilitySlot;
  /** The ability actor GUID: tells two passives of one player apart. */
  actor: number;
  charges: number;
};

/** A player's ult points or ult state changed. The replay holds no maximum. */
export type UltChange = {
  t: number;
  /** Index into `players`. */
  player: number;
  points: number;
  /** True while the ult is in use. */
  active: boolean;
};

type Vec3 = [number, number, number];

/**
 * A piece of placed utility appeared (actor open). `kind` is the actor's class
 * without `_C`, e.g. "Zone_Wraith_4_Smoke"; icons and sizes come from the
 * agent data (the replay has no size).
 */
export type UtilitySpawn = {
  type: "spawn";
  t: number;
  /** The actor GUID; later updates and the end carry it. */
  id: number;
  kind: string;
  /** Index into `players`; null when no owner chain reaches a player. */
  player: number | null;
  pos: Vec3;
  /** Degrees; null when the spawn has no rotation (smoke spheres, stars). */
  yaw: number | null;
  /** A segment's ends (Vyse's Shear, Deadlock's Barrier Mesh arms). */
  a: Vec3 | null;
  b: Vec3 | null;
  /** False for classes no replay has confirmed yet (Cypher, Killjoy). */
  verified: boolean;
};

/**
 * A change of a live piece: a segment's ends sent after the spawn, the next
 * point of a polyline (Phoenix's Blaze), or a state multicast (e.g.
 * "TransitionToState" with a value, "DeactivateRift"). Only changed keys exist.
 */
export type UtilityUpdate = {
  type: "update";
  t: number;
  id: number;
  a?: Vec3;
  b?: Vec3;
  point?: Vec3;
  state?: string;
  value?: number;
};

/** The piece is gone (actor close). Pieces still live when the replay ends have none. */
export type UtilityEnd = { type: "end"; t: number; id: number };

export type UtilityEvent = UtilitySpawn | UtilityUpdate | UtilityEnd;

/** Decode counters, zero included. `lostContentBlocks > 0` means data is missing. */
export type ReplayStats = {
  packets: number;
  frames: number;
  contentBlocks: number;
  malformedContentBlocks: number;
  lostContentBlocks: number;
  unknownChunks: number;
  replayDataTrailingBytes: number;
  eventLayoutMismatches: number;
  firstEventLayoutMismatch: string | null;
  eventUnknownGroups: number;
  fieldRowsSeen: number;
  fieldRowsKept: number;
  movementRows: number;
  /** Charge rows on an actor in no player's ability slot. */
  chargeRowsUnresolved: number;
  /** Ult rows on an actor that is no player's state. */
  ultRowsUnresolved: number;
  /** Utility shape rows on an actor that is not live utility or unreadable, and utility opens without a position. */
  utilityRowsUnresolved: number;
  /** Utility spawns whose owner chain reaches no player. */
  utilityOwnerUnresolved: number;
};

export type ReplayMeta = {
  parserVersion: string;
  /** e.g. "++Ares-Core+release-13.08". */
  branch: string;
  changelist: number;
  lengthMs: number;
  /** Recording time in .NET ticks (100 ns since 0001-01-01), a decimal string (> 2^53). */
  timestampTicks: string;
  levels: { name: string; timeMs: number }[];
  gameSpecificData: string[];
  players: ReplayPlayer[];
  events: ReplayEvent[];
  actors: ReplayActor[];
  fields: ReplayField[];
  /** Every change of a player's charges, in time order; always present. */
  abilities: ChargeChange[];
  /** Every change of a player's ult points or state, in time order; always present. */
  ults: UltChange[];
  /** Placed utility: spawn, update, end, in time order; always present. */
  utility: UtilityEvent[];
  stats: ReplayStats;
};

/** Parallel columns: index i of each array is one movement sample. */
export type ReplayMovement = {
  timeMs: Uint32Array;
  character: Uint32Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
};

export type ParsedReplay = { meta: ReplayMeta; movement: ReplayMovement };

let ready = false;

function assertReady(): void {
  if (!ready) throw new Error("replay parser not initialised: call initParser first");
}

/** Load the module from its bytes (Node, tests). */
export function initParserSync(wasm: ArrayBuffer | ArrayBufferView): void {
  initSync({ module: wasm });
  ready = true;
}

/** Load the module from a URL or response (browser Worker). */
export async function initParser(
  wasm: URL | Response | ArrayBuffer | ArrayBufferView,
): Promise<void> {
  await init({ module_or_path: wasm });
  ready = true;
}

/** The fork's vrf-wasm version of the loaded module. */
export function parserVersion(): string {
  assertReady();
  return version();
}

/**
 * Parse a whole .vrf file. `fieldNames` selects the replicated fields to keep
 * by exact name (a full match has ~1.3 M field rows). Throws on a file the
 * parser cannot read, including an unknown game build.
 */
export function parseReplay(bytes: Uint8Array, fieldNames: readonly string[]): ParsedReplay {
  assertReady();
  const parsed = parse(bytes, [...fieldNames]);
  try {
    return {
      meta: JSON.parse(parsed.metaJson()) as ReplayMeta,
      movement: {
        timeMs: parsed.movementTimeMs(),
        character: parsed.movementCharacter(),
        x: parsed.movementX(),
        y: parsed.movementY(),
        z: parsed.movementZ(),
        yaw: parsed.movementYaw(),
      },
    };
  } finally {
    parsed.free();
  }
}
