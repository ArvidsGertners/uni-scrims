# @uni-scrims/replay-parser

Parses a Valorant replay (`.vrf`) in the browser or in Node via WebAssembly. Part of the 2D replay viewer ([docs/replay-viewer.md](../../docs/replay-viewer.md), phase R1).

- `wasm/`: the build of the parser fork `uni-scrims-replay-parser` (a fork of [vrfkit](https://github.com/yakisoba0728/vrfkit), Apache-2.0). Generated, never edited by hand. `wasm/source.json` names the fork tag, commit and the SHA-256 of the `.wasm`.
- `src/index.ts`: a typed wrapper. `initParserSync(bytes)` or `await initParser(url)`, then `parseReplay(bytes, fieldNames)` → `{ meta, movement }`.
  - `meta`: header (branch, length), players (account UUID → character GUIDs), Event chunks (kills, rounds, spike), actor opens/closes with spawn position/rotation, the requested fields, counters.
  - `meta.abilities` / `meta.ults` (since `us-v0.2.0`): every change of an ability's charges with its slot (`grenade` = C, `ability1` = Q, `ability2` = E, `passive`, `ultimate`) and ability actor (`actor`) and of the ult points/state, with `player` as an index into `meta.players`. Always included, whatever `fieldNames` says. The replay holds no maximum for ult points.
  - `meta.utility` (since `us-v0.3.0`): placed utility as `spawn` (`kind` = class name without `_C`, `player`, `pos`, `yaw`, segment ends `a`/`b`, `track`, `verified`), `update` (later ends, Blaze/Fast Lane `point`s, `state` RPCs) and `end`, keyed by the actor GUID `id`. Always included. No sizes: those come from the agent data. Since `us-v0.4.0`: pawns (turret, camera, drone, Boom Bot, …) have `track: true`, their path and facing are the `movement` rows with `character` = `id`; Cypher's tripwire has its anchors in `a`/`b`; a Nanoswarm, Blast Pack or Paint Shell bomblet spawns where it landed; `verified: false` marks agent classes no replay has confirmed yet.
  - `movement`: typed columns (`timeMs`, `character`, `x`, `y`, `z`, `yaw`).
  - Only the fields named in `fieldNames` are returned. A full match has about 1.3 M field rows.
  - 64-bit values beyond 2^53 come as decimal strings: `meta.timestampTicks`, a field's `intText`.
- **Memory**: WebAssembly memory only grows. After a 60 MB match the instance keeps about 300 MB. So the viewer (R5) parses each file in a fresh Web Worker and terminates it afterwards.

## Rebuild

Needs Rust 1.90.0 with the `wasm32-unknown-unknown` target and wasm-pack 0.14.0 (`cargo install wasm-pack --version 0.14.0 --locked`). The fork's `FORK.md` has the details.

```sh
cd ~/uni-scrims-replay-parser          # the fork checkout, branch uni-scrims
git tag us-v<version>                   # = version of crates/vrf-wasm
./scripts/build-wasm.sh                 # → pkg/
cd ~/uni-scrims
pnpm --filter @uni-scrims/replay-parser sync-wasm ~/uni-scrims-replay-parser
pnpm test                               # the parser test checks the tag against the module
```

`build-wasm.sh` only builds a clean tree and writes `pkg/BUILD_COMMIT`. `sync-wasm` refuses a fork with uncommitted changes, a HEAD without a `us-v*` tag, or a `pkg/` built from another commit.

## Tests

`test/parse.test.ts` loads the `.wasm` in Node and parses:

- the public 13.00 replay that vrfkit's CI uses, downloaded by pinned commit and SHA-256 into `node_modules/.cache/replay-fixtures/` (never committed), with the same row counts as `vrfkit export`
- a real 13.08 match from `replays/` when present (git-ignored, real replays never go into git), including the plausibility check of charges and ult points (phase R2): the ult is active or spent right after every `characterUltimateUsed`, and each slot's charge drops follow equipping that slot's ability; and the placed utility of all four local replays (phases R3a, R3b): owner agent, lifetime order, positions on the map, pawn paths, Shear/Barrier Mesh/tripwire ends, Nanoswarm/Paint Shell/Blast Pack landings, Sage's wall segments, Blaze/Fast Lane points; each shape check runs where its agent played, and one test checks that all of them ran
