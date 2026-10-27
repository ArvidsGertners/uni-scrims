// Typed wrapper around the parser fork's WebAssembly build (wasm/, see README).
// Runs in a browser Web Worker and in Node: load the module once with
// initParser / initParserSync, then call parseReplay per file.
import init, { initSync, parse, version } from "../wasm/vrf_wasm.js";

export type ReplayPlayer = {
  /** Account UUID (Riot "subject"). */
  subject: string;
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
  int: number | null;
  float: number | null;
  bool: boolean | null;
  str: string | null;
};

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
};

export type ReplayMeta = {
  parserVersion: string;
  /** e.g. "++Ares-Core+release-13.08". */
  branch: string;
  changelist: number;
  lengthMs: number;
  timestamp: number;
  levels: { name: string; timeMs: number }[];
  gameSpecificData: string[];
  players: ReplayPlayer[];
  events: ReplayEvent[];
  actors: ReplayActor[];
  fields: ReplayField[];
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

/** Load the module from its bytes (Node, tests). */
export function initParserSync(wasm: ArrayBuffer | ArrayBufferView): void {
  initSync({ module: wasm });
}

/** Load the module from a URL or response (browser Worker). */
export async function initParser(
  wasm: URL | Response | ArrayBuffer | ArrayBufferView,
): Promise<void> {
  await init({ module_or_path: wasm });
}

/** The fork's vrf-wasm version of the loaded module. */
export function parserVersion(): string {
  return version();
}

/**
 * Parse a whole .vrf file. `fieldNames` selects the replicated fields to keep
 * by exact name (a full match has ~1.3 M field rows). Throws on a file the
 * parser cannot read, including an unknown game build.
 */
export function parseReplay(bytes: Uint8Array, fieldNames: readonly string[]): ParsedReplay {
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
