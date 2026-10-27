/* tslint:disable */
/* eslint-disable */

/**
 * What [`parse`] returns. Movement columns are parallel arrays: index `i`
 * of each one is the same row.
 */
export class ParsedReplay {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Header, players, events, actors, the requested fields and the counters
     * (see [`Meta`]).
     */
    metaJson(): string;
    movementCharacter(): Uint32Array;
    movementRows(): number;
    movementTimeMs(): Uint32Array;
    movementX(): Float32Array;
    movementY(): Float32Array;
    movementYaw(): Float32Array;
    movementZ(): Float32Array;
}

/**
 * Decode a whole `.vrf` file. `field_names` selects the field rows to keep,
 * by exact `field_name`; an empty list keeps none. Throws on a file vrfkit
 * cannot read, including a game build whose branch it does not know.
 */
export function parse(bytes: Uint8Array, field_names: string[]): ParsedReplay;

/**
 * The version of this crate, so the JavaScript side can name the parser it
 * loaded.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_parsedreplay_free: (a: number, b: number) => void;
    readonly parse: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly parsedreplay_metaJson: (a: number) => [number, number];
    readonly parsedreplay_movementCharacter: (a: number) => any;
    readonly parsedreplay_movementRows: (a: number) => number;
    readonly parsedreplay_movementTimeMs: (a: number) => any;
    readonly parsedreplay_movementX: (a: number) => any;
    readonly parsedreplay_movementY: (a: number) => any;
    readonly parsedreplay_movementYaw: (a: number) => any;
    readonly parsedreplay_movementZ: (a: number) => any;
    readonly version: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_alloc: () => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
