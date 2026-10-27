# 2D replay viewer — concept

Status: concept, 2026-10-27, with the user's decisions on all open questions (§11). Building is allowed; going live waits for Riot's answer. Not part of SPEC/ARCHITECTURE yet. Before building, this becomes one or more phases in ARCHITECTURE §11 (in German, like the rest of the docs) and needs the user's go-ahead. Roadmap slot: "VOD review", the last item after the Riot/Uniliga/OPL integrations.

## 0. Progress log

**This section is updated at every step**:
- when a phase starts (status 🟡, date)
- after every commit (commit hash, what's done, what's next)
- when a phase is finished (status ✅, date, the user's OK)

A new session starts by reading only §0, the "Current state" block and the section of the current phase in §10. That's enough to continue without the rest of the history.

### Current state

- **Phase**: none started. Next: **R0 Spike test** on vrfkit's public test replays. The user can't record a real replay for now (2026-10-27).
- **Last commit**: —
- **Next step**: start R0 after the user's go.
- **Waiting for the user**: a `.vrf` from a custom game with recording on, for **R0b**. Needed before R11 (saving) and before go-live, not before.
- **Open problems**: —

### Phases

Status: ⬜ open · 🟡 in progress · ✅ done · ⏸ waiting for the user

| Phase | Title | Status | Started | Finished | Commits | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Spike test on public replays | ⬜ | | | | |
| R0b | Custom-game check with a real scrim replay | ⏸ | | | | Waiting for a `.vrf` from the user; needed before R11 |
| R1 | Parser fork + WASM build | ⬜ | | | | |
| R2 | Decoding: charges + ult points | ⬜ | | | | |
| R3 | Decoding: utility rotation, tripwire, turret | ⬜ | | | | |
| R4 | Decoding: kill details + round results | ⬜ | | | | |
| R5 | Replay JSON + reducer + Web Worker | ⬜ | | | | |
| R6 | Game assets (maps, icons, transforms) | ⬜ | | | | |
| R7 | Scrims tab "Replays" + local viewer shell | ⬜ | | | | |
| R8 | Playback: timeline, speeds, round strip | ⬜ | | | | |
| R9 | Live data: player cards, kill feed, scoreboard | ⬜ | | | | |
| R10 | Utility on the map | ⬜ | | | | |
| R11 | Saving: upload, storage, 90 days | ⬜ | | | | |
| R12 | Drawing tools (local) | ⬜ | | | | |
| R13 | Live collaboration board | ⬜ | | | | |
| R14 | Polish: mobile, DE/EN, performance | ⬜ | | | | |
| Go-live | Deploy | ⏸ | | | | Only after Riot answers |

### Log

Newest entry first. One entry per commit or decision: date, phase, what was done, commit, what's next.

- 2026-10-27: the user can't record a real replay for now. R0 now runs on vrfkit's public test replays (builds 12.10, 12.11, 13.00, fetched by vrfkit's CI), and the custom-game check moved to R0b, needed before R11.
- 2026-10-27: concept written, user decisions (§11) added, phases planned for one session each, placement under Scrims decided.

## 1. Goal

After a scrim, both teams can watch it again as a 2D top-down replay and draw on it to review and plan rounds. The replay viewer/planner lives in the **Scrims** section of the sidebar (§6.1).

### Requirements

Every point is a must-have. None of them is optional.

**Timeline and playback**

- A live timeline that plays the match, with speeds 0.5×, 1×, 2×, 3× and 4×, play/pause and scrubbing.
- Every event appears on the timeline as a marker: utility usage, kills, spike plant/defuse/detonation, round start/end.
- A round strip below the timeline. Each round shows the winner and the score after that round, for example "R1 0:1", "R2 0:2", "R3 1:2", seen from the attackers' side of round 1.

**Live kill feed**

- Shows killer, victim, weapon, assists, headshot and wallbang.

**Live player state, per player**

- agent
- HP and armour
- current weapon
- abilities with remaining charges
- ult points
- who carries the spike

**Map view**

- Every player's position and view direction (a view cone).
- Placed utility at its real position, size and orientation:
  - smokes, walls, mollies, slows, traps
  - **Cypher tripwire**: both anchor points and the wire between them
  - **Killjoy turret**: position and the direction it faces
  - other agents' deployables likewise (e.g. Cypher camera, Deadlock sensor, Sage wall)

**Drawing tools** (§7)

- select, pen, arrow, text, area (circle), wall (rectangle) and eraser
- a colour for every tool
- a side tag on every drawing: attackers, defenders or both
- a live collaboration board for the own team: every member can draw and edit, and changes appear for everyone at once

**Look and feel**

- Clean and calm, with valorantscout.com's viewer as the reference (the user likes how it looks). Built with the site's own tokens and components (§6).

## 2. Is it possible?

Yes. The hosted viewer on valorantscout.com already shows almost the whole list (movement, view direction, HP/armour/ult/charges, spike carrier, kill feed with assists/headshots/wallbangs, 1×/2×/4×), and it parses the `.vrf` file in the browser. So the data is in Valorant's replay files. The open-source parsers cover most of it today. The rest needs our own decoding work (marked below).

| Requirement | Source in the replay | Status |
| --- | --- | --- |
| Positions | movement batches | ✅ vrfkit (valre plays positions back on top of it) |
| View direction | movement batches (yaw) | ✅ valre shows facing on top of vrfkit |
| HP, armour, overheal | damage log | ✅ vrfkit |
| Current weapon, ammo | equipped-weapon timeline | ✅ vrfkit |
| Agent per player | account → actor → character in the manifest | ✅ vrfkit |
| Ability casts (time, place) | ability actors | ✅ vrfkit |
| Smokes, walls, mollies, slows, traps (position, lifetime) | persistent effects | ✅ vrfkit |
| Spike carrier, plant, defuse, detonation | spike events + carrier history | ✅ vrfkit |
| Kills (killer, victim, round) | `characterDeath` events | ✅ vrfkit |
| Kill weapon, assists, headshot, wallbang | damage events around the death | 🔧 own decoding (shown by valorantscout, so it's in the data) |
| Round winner and score | round start/end, deaths, spike events | 🔧 derive ourselves from events |
| **Ability charges, ult points** | replicated properties of the player state | 🔧 **own decoding** (not documented in vrfkit; valorantscout shows them) |
| **Tripwire anchors, turret facing, rotation of deployables** | replicated actor rotation and properties | 🔧 **own decoding** (vrfkit documents positions only) |
| Player labels | the replay only holds account UUIDs | ✅ agent names now; real names later via the Riot API, see §9 |

✅ = available in an existing parser. 🔧 = we decode or derive it ourselves. The 🔧 items are part of the scope. The first phase (§10, R0) finds out exactly where they sit in the replay, not whether we build them.

## 3. Existing projects

| Project | What it is | License | Use for us |
| --- | --- | --- | --- |
| [yakisoba0728/vrfkit](https://github.com/yakisoba0728/vrfkit) (forks e.g. [thomas-quant/vrfkit](https://github.com/thomas-quant/vrfkit)) | Rust parser, 10 crates, usable as a library, Parquet export. Verified on 1,018 replays, game builds 11.06–13.08. HP/armour, weapons, economy, ability casts, persistent effects, kills, spike, round events | Apache-2.0 (MIT up to v0.2.0) | **Base parser.** We fork it and add the 🔧 items, or send them upstream |
| [michel-giehl/ValorantReplayParser](https://github.com/michel-giehl/ValorantReplayParser) | C#/.NET 10 parser, alpha. Movement, agents, gunplay, economy; abilities in progress, game/world state missing | MIT | Fallback / cross-check |
| [talhakoek/ValorantWebReplayer](https://github.com/talhakoek/ValorantWebReplayer) | Windows tool (PowerShell + Node) with an HTML minimap viewer on a patched copy of the C# parser. Positions, timeline, smokes/walls, spike; anonymous, no kill attribution | MIT | Reference for the map rendering |
| [ni8x/valre](https://github.com/ni8x/valre) | Local Python + React app on vrfkit: 2D playback with positions + facing, kills, round results | GPL-3.0 | Proves positions/facing work with vrfkit. **Don't copy code** (GPL) |
| [valorantscout.com](https://valorantscout.com/valorant-replays) | Hosted viewer, parsing in the browser via WebAssembly; everything in §1 except our drawing tools and tripwire/turret details | source not found | **UI and feature reference** |
| [valab.gg](https://www.valab.gg/), [valoplant.gg](https://valoplant.gg/) | Commercial viewers | closed | Benchmark only |

## 4. Architecture

```
Player's PC (browser)                         Uni Scrims server
────────────────────────────                  ──────────────────────────────
.vrf (from %LOCALAPPDATA%\VALORANT\Saved\Demos)
  → Web Worker: vrfkit (Rust → WASM)
  → reduce to replay JSON (§5)
  → gzip, upload ───────────────────────────▶ core: validate, store file,
                                              ScrimReplay row
Viewer (canvas + SVG) ◀── fetch JSON ──────── permission check (both teams)
```

- **Parsing happens in the browser**, in a Web Worker running vrfkit compiled to WebAssembly. This is the same approach valorantscout uses. The `.vrf` never leaves the player's PC. The VPS does no heavy work: a full decode can take more than 1 GB of RAM, and parallel load has already frozen the server once. Fallback, if the WASM build fails or is too slow: a small download (`uni-scrims-replay.exe`) that writes the JSON locally for upload.
- **Saving is optional.**
  - After parsing, the replay plays at once in the browser, without any upload. It is local only and gone on reload.
  - The option "Save for both teams" uploads it and attaches it to one of the team's past scrims (picked from a list).
  - Only the reduced replay JSON is uploaded, gzip-compressed, with a size limit (target well below 5 MB per match).
- **Storage**: a new model `ScrimReplay`, one per scrim, holding uploader, game version, upload date and the file path. The file lives under `UPLOAD_DIR`, like team logos. All logic sits in `packages/core` (validate the JSON schema, attach to the scrim, delete). `apps/web` only calls `core`.
- **Permissions** go through `core/permissions.ts`:
  - Every member of the two teams of that scrim can upload, view and delete.
  - Others, including admins, have no access.
- **Retention**: a saved replay is deleted 90 days after the upload, together with its drawings. The janitor does this sequentially and gets `now` as a parameter, per CLAUDE.md.
- **Patch fragility**: every Valorant patch can change the replay format.
  - The JSON carries `gameVersion` and `formatVersion`.
  - The upload form says clearly when a game version isn't supported yet.
  - Stored replays keep working, because we store parsed data, not the `.vrf`.

## 5. Replay JSON (sketch)

```jsonc
{
  "formatVersion": 1,
  "gameVersion": "release-13.08",
  "map": "Ascent",                       // map id → minimap + coordinate transform (§7)
  "players": [
    { "id": "p1", "accountId": "…", "team": "A", "agent": "Cypher", "rankTier": 21 }
                                         // label = agent name until the Riot API (§9)
  ],
  "rounds": [
    {
      "index": 0, "startMs": 0, "endMs": 98500,
      "attackers": "A", "winner": "B", "winReason": "elimination",
      "scoreAfter": { "A": 0, "B": 1 },
      "tracks": {                         // sampled at ~10 Hz, delta-encoded
        "p1": { "t": [...], "x": [...], "y": [...], "yaw": [...] }
      },
      "events": [                         // everything that changes state, sorted by time
        { "t": 1200, "type": "loadout", "player": "p1", "weapon": "Vandal", "armour": 50 },
        { "t": 15400, "type": "ability", "player": "p1", "slot": "C", "charges": 1,
          "actor": "u7" },
        { "t": 15400, "type": "utilitySpawn", "id": "u7", "kind": "cypher_trip",
          "a": [x, y], "b": [x, y] },
        { "t": 30100, "type": "utilitySpawn", "id": "u9", "kind": "kj_turret",
          "pos": [x, y], "yaw": 1.57 },
        { "t": 41000, "type": "damage", "from": "p6", "to": "p1", "hp": 42, "armour": 0 },
        { "t": 41010, "type": "kill", "killer": "p6", "victim": "p1", "weapon": "Phantom",
          "assists": ["p8"], "headshot": true, "wallbang": false },
        { "t": 52000, "type": "ult", "player": "p2", "points": 6, "max": 7 },
        { "t": 60000, "type": "spikePickup", "player": "p3" },
        { "t": 71000, "type": "plant", "player": "p3", "site": "A", "pos": [x, y] },
        { "t": 75000, "type": "utilityEnd", "id": "u7" }
      ]
    }
  ]
}
```

The viewer state at time `t` = the latest value of every state stream up to `t`, plus interpolated positions. Per round, keyframes every 5 s make scrubbing instant.

## 6. Viewer UI

### 6.1 Place in the navigation

The viewer/planner sits under **Scrims** in the sidebar. There is no new sidebar entry.

- **A new tab "Replays"** on `/scrims` (`?tab=replays`, next to Board, Anstehend, Anfragen, Bewerbungen, Vergangen):
  - the team's saved replays (scrim, opponent, map, score, date, uploader, days until deletion)
  - a button "Open replay file" for a local `.vrf`
- **Viewer routes**: `/replays/local` (a parsed file that wasn't saved) and `/replays/[id]` (a saved replay).
  - `"/replays"` is added to the Scrims entry's `sections` in `apps/web/components/app-nav.tsx`, so the sidebar keeps Scrims highlighted, like `/requests` and `/ready` today.
  - The viewer page uses the full width of the content area. The chat sidebar is hidden there.
- **Links into it**:
  - a past scrim's page (`/scrims/[id]`) shows "Watch replay" when a saved replay exists, and "Add replay" otherwise
  - the Vergangen tab shows a small replay icon on scrims that have one

### 6.2 Layout

The reference is the [valorantscout.com viewer](https://valorantscout.com/valorant-replays): clean, with the map at the centre and live player data.

We adopt its feature set and calm feel:

- a round picker
- utility at its real size
- a scrubber that jumps to kills, plants and defuses
- a kill feed with assists, headshots and wallbangs
- live HP, armour, ult and charges
- a scoreboard
- pausing and then drawing on the frame

Its exact layout isn't public, so this layout is our own in that spirit. It uses the site's existing tokens and components (Button, Select, bg-secondary boxes, border-primary, light/dark mode), no new visual language, and no copied code or assets.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Round 7 · 3:3        [Scoreboard]                     [Draw tools ▾] │
├─────────────┬──────────────────────────────────────────┬─────────────┤
│ Attackers   │                                          │ Kill feed   │
│ ┌─────────┐ │                                          │ A ⟶ B  HS   │
│ │Cypher ♦ │ │            map (canvas + SVG)            │ C ⟶ D       │
│ │HP ███▒ 80│ │      players with view cone, utility,   ├─────────────┤
│ │Vandal   │ │      tripwire lines, turret cone,        │ Defenders   │
│ │C1 Q2 E1 │ │      spike icon on the carrier           │ (5 cards)   │
│ │Ult 5/7  │ │                                          │             │
│ └─────────┘ │                                          │             │
├─────────────┴──────────────────────────────────────────┴─────────────┤
│ ▶ ❚❚  0.5× 1× 2× 3× 4×   1:12 / 1:38                                 │
│ ──●──────✕────◆──✕✕─────────────────▲──────────  (event markers)     │
│ R1 0:1 │ R2 0:2 │ R3 1:2 │ R4 2:2 │ … (winner colour, click = jump)  │
└──────────────────────────────────────────────────────────────────────┘
```

**Player card**

- agent icon and name
- HP bar with armour
- current weapon
- the four ability slots with charges
- ult points (x/y)
- spike icon when carrying
- greyed out when dead

Hovering a card highlights the player on the map.

**Timeline**

- Marker types: kill, ability, plant, defuse, round end. Hovering a marker shows what happened.
- Keyboard:
  - Space: play/pause
  - ←/→: ±5 s
  - , and .: frame step
  - 1–4: speed
  - [ and ]: previous/next round
- The round strip shows every round with the winner's colour and the score after it. A click jumps to the start of that round.

**Scoreboard** (overlay): ACS, ADR, K/D/A, KAST, HS %, first kills, buys per round.

**Mobile**

- Map at full width.
- Player cards as a horizontal strip below.
- Kill feed as an overlay.
- Timeline and round strip fixed at the bottom.
- Drawing tools in a bottom sheet.

**Language**: all texts via the dictionaries (DE as the template, EN). Agent, weapon and map names stay in English, as in the game.

## 7. Drawing tools

A toolbar next to the map, used mostly on a paused frame, like valorantscout's "Planner".

| Tool | Behaviour |
| --- | --- |
| Select | Click a drawing to select it. Then move it, resize it with handles, change colour/side, or delete it (Del) |
| Pen | Freehand line, smoothed |
| Arrow | Drag from start to end. Afterwards it is fully editable: start and end handles, plus a midpoint handle that bends it into a curve; the arrowhead follows the curve |
| Text | Click to place, type inline. Editable and movable later |
| Area | A circle: press at the centre and drag outwards, and it grows with the mouse |
| Wall | A rectangle drawn like a selection box in Windows: the first corner is where the drag starts, and it grows with the mouse until you let go |
| Eraser | Click or drag over drawings to remove them |

- **Colours**: a palette (e.g. 8 colours, readable in light and dark mode) for every tool. The last choice is remembered.
- **Side**: every drawing is tagged *Attackers*, *Defenders* or *both*. A filter in the toolbar shows all drawings, only attacker drawings or only defender drawings.
- **Editing**: undo/redo (Ctrl+Z / Ctrl+Shift+Z), touch support (drag with a finger, pinch to zoom the map).
- **Technique**:
  - Drawings are vectors in map coordinates, on an SVG layer above the canvas, so they stay in place when you zoom or resize the window.
  - Our own implementation, no new drawing library unless it turns out to be necessary (exact version pinning per CLAUDE.md applies).
- **Live collaboration board**:
  - Drawings belong to a team, a saved replay and a round. Optionally they are pinned to a timestamp, so they show up when playback reaches that moment.
  - Only the own team sees them. Every member can draw, edit and delete, including other members' drawings.
  - Changes appear live for every team member who has the replay open.
  - Avatars show who of the team is viewing right now.
- **Live technique**:
  - Uses the existing WebSocket server from Phase 32 (`apps/web/lib/realtime/server.ts`, `/ws`) with per-object operations (add, update, delete).
  - Last write wins per object. Every operation is stored through `core`, so a reload shows the current state.
  - Undo/redo only undoes your own operations.
- **Local replays**: a replay that isn't saved (§4) can be drawn on too, but nothing is stored or shared.

## 8. Assets, privacy, legal

**Assets**

- Minimaps, agent/weapon/ability icons and the map coordinate transforms (`xMultiplier`, `yMultiplier`, `xScalarToAdd`, `yScalarToAdd`) come from [valorant-api.com](https://valorant-api.com).
- A script downloads them at build time and the site serves them itself, like the rank icons.
- The browser never contacts a third party, so nothing new for the privacy policy on that side.
- The Riot notice in the Impressum covers game assets. Check that it still fits.

**Privacy**

- A replay holds gameplay data (positions, performance) of named players.
- Stored only if a member chooses to save it. Visible only to the two teams of the scrim.
- Deleted 90 days after the upload, or earlier with the scrim or by a member.
- Covered by the data export ("Datenauskunft").
- A new paragraph in `datenschutz.txt` / `datenschutz.en.txt`, approved by the user before the deploy.

**Riot**

- The replay format is undocumented and decoded by reverse engineering.
- The user is asking Riot. Decision 2026-10-27: building it is allowed, but **no deploy to production before Riot answers**.
- Unverified reports say patch 26.20 restricted third-party access to replay *downloads*. That concerns downloading other people's replays from Riot's servers. We only read files the player already has on disk, but it shows Riot is watching this area.

**Custom games**

- The replay system first excluded custom games.
- An unofficial report (patch 12.10) says custom games now get a replay **only when the lobby owner enables recording in the custom options before every game**.
- Verify this in phase R0. If it's true, the scrim page reminds the hosting team to turn recording on.

**Replays expire**

- Valorant deletes `.vrf` files when an Act ends, and a file only plays on the patch it was recorded on.
- So upload soon after the scrim; the scrim page shows a hint.
- Stored replays aren't affected, because we keep the parsed JSON.

## 9. Player names

The replay holds account UUIDs, not Riot IDs, and Uni Scrims doesn't store Riot IDs or PUUIDs today.

- **Now**: every player is shown by their agent name (Sova, Skye, Phoenix, …), with their team's colour and side. If both teams play the same agent, the team colour tells them apart. There is no manual mapping.
- **Later, with the Riot API (production key / RSO)**: the PUUID is linked to the Uni Scrims account, and real names replace the agent labels. This becomes its own phase.

## 10. Phases

### Rules: keep each phase small enough for one session

- **One phase = one session.** Each phase below fits one context window: about 5–15 files, one topic, its own tests.
  - If a phase turns out bigger, split it (R8a, R8b, …), note the split in §0 and finish only the first part.
- **Start of a phase**: read §0 and the phase's section here, plus only the files listed for it. Don't re-read the whole doc or codebase. Set the status to 🟡 in §0.
- **During a phase**: commit small and on topic. After every commit, add a log line in §0 and update "Current state".
- **End of a phase**:
  - `pnpm test` and `pnpm lint` green (one at a time on the VPS)
  - `/code-review`
  - status ✅ in §0
  - wait for the user's OK
- **Docs per phase**: R0–R4 change only this doc and the parser fork. From R5 on, each phase first adds its part to SPEC/ARCHITECTURE (German, ARCHITECTURE §11), as usual.
- **No deploy** of any phase to production before Riot answers (§11). Everything is built and tested on dev.
- Heavy jobs (Rust/WASM builds, tests, lint, Docker builds) never run in parallel on the VPS.

### R0 — Spike test on public replays (no app code)

- **Input**: the public test replays that vrfkit's CI fetches from a pinned commit (builds 12.10, 12.11, 13.00; see vrfkit's CONTRIBUTING.md). No replay from the user needed.
- **Work**:
  - Run vrfkit (CLI) on them, one at a time on the VPS.
  - Find where ability charges, ult points, utility rotation, tripwire anchors, turret facing, and kill weapon/assists/headshot/wallbang sit (actor classes, replicated properties).
  - Check positions + yaw, and the round/score events.
  - Note which agents appear, since deployables of missing agents can't be checked yet.
- **Output**:
  - `docs/replay-viewer-findings.md` with every 🔧 item from §2 and where it is found, and a short sample of the data.
  - The replays' game mode and build.
  - The licence/permission of the public replays: may we keep cut-down fixtures from them in our tests?
- **Done when**: every 🔧 item is located, or the finding says exactly what is missing and why.
- **Limits**: these are older builds and probably not custom games. R0b closes that gap.

### R0b — Custom-game check (waiting for the user)

- **Input**: a `.vrf` from a custom game with recording turned on, from the user, on the current build.
- **Work**:
  - Confirm that custom games record a replay.
  - Run the R0 findings on it, and note what changed in the current build.
  - Check agents that were missing in R0.
- **When**: whenever the user has a replay. Required before R11 (saving) and before go-live. The phases in between can use the public replays.

### R1 — Parser fork + WASM build

- **Work**:
  - Fork vrfkit as its own repo (`uni-scrims-replay-parser`, Apache-2.0 notice kept).
  - A small Rust crate on top of it that exposes `parse(bytes) → events` to JavaScript via `wasm-bindgen`.
  - A build script (`wasm-pack`, exact pinned versions).
- **Into Uni Scrims**: a new package `packages/replay-parser` with the built `.wasm` + JS glue, pinned to a fork version, and a short README on how to rebuild.
- **Done when**: a Node test loads the WASM and parses an R0 replay into events. Peak memory and time are written into §0.

### R2 — Decoding: ability charges + ult points

- **Work**: in the fork, decode the replicated charge and ult properties found in R0. Emit `ability` (slot, charges) and `ult` (points, max) events. Fork tests on an R0 replay.
- **Done when**: at 5 sampled moments, charges and ult points match the in-game replay.

### R3 — Decoding: utility rotation, tripwire, turret

- **Work**:
  - Decode actor rotation for deployables.
  - Decode tripwire anchors (both ends), KJ turret facing, and Cypher camera / Deadlock sensor / walls with orientation.
  - Emit `utilitySpawn` / `utilityUpdate` / `utilityEnd` events.
- **Done when**: every deployable of the agents in the test replay shows the correct position and orientation.

### R4 — Decoding: kill details + round results

- **Work**:
  - Decode the kill weapon, assists, headshot and wallbang.
  - Derive round winner, win reason (elimination, spike, defuse, time) and score after each round, including the side switch and overtime.
- **Done when**: the kill feed and round scores of the test replay match the in-game replay.

### R5 — Replay JSON + reducer + Web Worker

- **Docs first**: the replay JSON format (§5) into ARCHITECTURE.
- **Work**:
  - `packages/core/src/replay/`: zod schema for the format (`formatVersion` 1), and a pure function `stateAt(replay, round, t)` (positions interpolated, latest value per state stream, keyframes every 5 s).
  - The reducer events → JSON, inside a Web Worker module in `apps/web` that loads `packages/replay-parser`.
  - A clear error for unsupported game versions.
- **Done when**: Vitest covers the schema and `stateAt` (fixtures cut from an R0 replay), and the Worker turns an R0 replay into valid JSON under a time and size budget.

### R6 — Game assets

- **Work**:
  - A script (like the rank icons) that downloads minimaps, agent/weapon/ability icons and the map transforms from valorant-api.com into the repo at a pinned game version.
  - Served by the site itself; a small typed index (`map → image + transform`, `agent → icons`).
- **Done when**: every current map and agent has its assets, and a test checks the index is complete. No browser request goes to a third party.

### R7 — Scrims tab "Replays" + local viewer shell

- **Docs first**: SPEC requirement + ARCHITECTURE section for the viewer and navigation (§6.1).
- **Work**:
  - New tab "Replays" on `/scrims` (empty list for now plus "Open replay file").
  - `"/replays"` in the Scrims `sections`.
  - Page `/replays/local`: drop zone, parsing in the Worker with progress, then the map with the players' positions at round 1, 0:00.
  - DE/EN dictionary entries.
- **Done when**: you can open a `.vrf` from the Scrims tab and see the right map with 10 players. The sidebar shows Scrims as active.

### R8 — Playback: timeline, speeds, round strip

- **Work**:
  - Play/pause and a requestAnimationFrame clock.
  - Speeds 0.5×/1×/2×/3×/4×.
  - A scrubber with event markers (kill, ability, plant, defuse, round end) and hover details.
  - The round strip with winner colour and score after each round; a click jumps to that round.
  - Keyboard shortcuts.
  - View cones on the players.
- **Done when**: a full match plays at every speed without stutter, and scrubbing and round jumps are instant.

### R9 — Live data: player cards, kill feed, scoreboard

- **Work**:
  - Player cards per side: agent name + icon (agent names as labels, §9), HP/armour bar, weapon, four ability slots with charges, ult x/y, spike icon, greyed out when dead, hover highlights the player on the map.
  - Kill feed with weapon/assists/HS/wallbang.
  - Scoreboard overlay.
- **Done when**: values match the in-game replay at sampled moments (checklist in §0).

### R10 — Utility on the map

- **Work**: draw smokes, walls, mollies, slows and traps at real size and lifetime; tripwires as lines between their anchors; turret, camera and sensor with a facing cone. One small renderer per kind, so more agents can be added later.
- **Done when**: every agent in the test replays shows its utility correctly. Missing agents are listed in §0.

### R11 — Saving: upload, storage, 90 days

- **Docs first**: data model, permissions table row, privacy draft.
- **Work**:
  - Prisma model `ScrimReplay` + migration.
  - `core` functions: save (gzip JSON, schema check, size limit, attach to a past scrim of the team), list, load, delete (all with permission checks in `core/permissions.ts`: members of both teams).
  - "Save for both teams" in the viewer.
  - The Replays tab list, `/replays/[id]`, and the links from the scrim page and the Vergangen tab.
  - Janitor deletes after 90 days (sequential, `now` parameter).
  - Data export entry.
  - Privacy paragraph draft (DE/EN) for the user's approval.
- **Done when**: tests cover permissions, retention and the size limit; both teams see a saved replay and others get 404.

### R12 — Drawing tools (local)

- **Work**:
  - An SVG layer in map coordinates over the canvas.
  - Toolbar: select, pen, arrow (editable with start/end/mid handles), text, area (circle), wall (rectangle like a selection box), eraser.
  - Colour palette, side tag + filter, undo/redo, touch.
  - Drawings per round, optionally pinned to a timestamp.
  - Kept in memory only in this phase.
- **Done when**: every tool works with mouse and touch, and drawings stay in place when zooming/resizing.

### R13 — Live collaboration board

- **Docs first**: drawing model and the realtime messages in ARCHITECTURE.
- **Work**:
  - Prisma model for drawings (team, replay, round, object JSON, author, updatedAt) + migration.
  - `core` functions with permission checks (own team only).
  - Operations over the existing `/ws` server (add/update/delete, last write wins per object).
  - Presence avatars of the team members viewing.
  - Undo only undoes your own operations.
  - Drawings deleted together with the replay.
- **Done when**: two team members in two browsers see each other's changes live; after a reload everything is still there; the opponent team sees nothing (tested).

### R14 — Polish

- **Work**:
  - Mobile layout (§6.2).
  - Full DE/EN review.
  - Keyboard/focus accessibility.
  - Performance (large matches, overtime, slow devices).
  - The hint for the hosting team to turn recording on before the scrim, and to save the replay before the Act ends.
- **Done when**: the whole flow works on a phone and a desktop in both languages, and the user gives the OK.

### Go-live

Only after Riot answers (§11): privacy texts approved, deploy like any other phase.

## 11. Decisions (user, 2026-10-27)

1. **Riot**: building is allowed; no deploy to production before Riot answers.
2. **Upload**: every member of both teams can upload.
3. **Saving**: optional. Without saving, the replay plays locally only. A saved replay is deleted 90 days after the upload.
4. **Drawings**: own team only, every member can edit, live like a collaboration board (§7).
5. **Wall**: the rectangle tool, drawn like a selection box in Windows (§7). There is no separate rectangle tool.
6. **Names**: agent names (Sova, Skye, Phoenix, …) until the Riot API makes real names possible (§9).

### Still open

- Live cursors of team-mates and synchronised playback ("follow me") on the collaboration board. Not decided, so not planned.
- Whether custom games really record a replay when the lobby owner turns it on (R0b, waiting for a replay from the user).
