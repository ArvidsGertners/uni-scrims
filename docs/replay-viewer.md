# 2D replay viewer — concept

Status: concept, 2026-10-27, with the user's decisions on all open questions (§11). Building is allowed; going live waits for Riot's answer. Not part of SPEC/ARCHITECTURE yet. Before building, this becomes one or more phases in ARCHITECTURE §11 (in German, like the rest of the docs) and needs the user's go-ahead. Roadmap slot: "VOD review", the last item after the Riot/Uniliga/OPL integrations.

## 1. Goal

After a scrim, both teams can watch it again as a 2D top-down replay on the scrim page, and draw on it to review rounds.

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

✅ = available in an existing parser. 🔧 = we decode or derive it ourselves. The 🔧 items are part of the scope. The first phase (§10, A) finds out exactly where they sit in the replay, not whether we build them.

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
  - The option "Save for both teams" uploads it to the scrim.
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
- Verify this in phase A. If it's true, the scrim page reminds the hosting team to turn recording on.

**Replays expire**

- Valorant deletes `.vrf` files when an Act ends, and a file only plays on the patch it was recorded on.
- So upload soon after the scrim; the scrim page shows a hint.
- Stored replays aren't affected, because we keep the parsed JSON.

## 9. Player names

The replay holds account UUIDs, not Riot IDs, and Uni Scrims doesn't store Riot IDs or PUUIDs today.

- **Now**: every player is shown by their agent name (Sova, Skye, Phoenix, …), with their team's colour and side. If both teams play the same agent, the team colour tells them apart. There is no manual mapping.
- **Later, with the Riot API (production key / RSO)**: the PUUID is linked to the Uni Scrims account, and real names replace the agent labels. This becomes its own phase.

## 10. Phases

| Phase | Content | Done when |
| --- | --- | --- |
| A — Spike test | Offline, no Uni Scrims code. Record a real custom scrim with recording on, run vrfkit on it, find the replicated properties for charges, ult points, tripwire anchors, turret/deployable rotation, kill weapon/assists/headshot/wallbang | Every 🔧 item in §2 is located in a real replay, and custom-game recording is confirmed |
| B — Parser | vrfkit fork with the 🔧 decoding, WASM build, reducer to the replay JSON (§5), tests against recorded replays | A real scrim converts to valid JSON in the browser |
| C — Upload and storage | Local playback without saving, optional "Save for both teams", `ScrimReplay`, schema validation, permissions, deletion after 90 days, data export | Every member of both teams can upload/see/delete, others can't; old replays disappear after 90 days |
| D — Viewer core | Map with positions and view cones, timeline, speeds, scrubbing, keyframes, round strip with scores | A full match plays at 0.5×–4× without stutter |
| E — Live data | Kill feed, player cards (agent, HP/armour, weapon, charges, ult, spike), scoreboard | Every value matches the in-game replay at sampled moments |
| F — Utility | Smokes, walls, mollies, traps; tripwires, turrets, cameras and other deployables with orientation | Every agent's utility shows correctly on a test replay |
| G — Drawing tools | All tools from §7, colours, side tag + filter, undo/redo, live collaboration over `/ws`, saving | Two team members draw at the same time and see each other's changes live; after a reload everything is still there; the other team sees nothing |
| H — Polish | Mobile layout, keyboard shortcuts, DE/EN, privacy texts | `pnpm test` + `pnpm lint` green, user OK |

Each phase follows the usual pattern: SPEC/ARCHITECTURE first, one phase at a time, review, then the user's OK. All phases can be built and tested locally/on dev. The deploy to production waits for Riot's answer.

## 11. Decisions (user, 2026-10-27)

1. **Riot**: building is allowed; no deploy to production before Riot answers.
2. **Upload**: every member of both teams can upload.
3. **Saving**: optional. Without saving, the replay plays locally only. A saved replay is deleted 90 days after the upload.
4. **Drawings**: own team only, every member can edit, live like a collaboration board (§7).
5. **Wall**: the rectangle tool, drawn like a selection box in Windows (§7). There is no separate rectangle tool.
6. **Names**: agent names (Sova, Skye, Phoenix, …) until the Riot API makes real names possible (§9).

### Still open

- Live cursors of team-mates and synchronised playback ("follow me") on the collaboration board. Not decided, so not planned.
- Whether custom games really record a replay when the lobby owner turns it on (phase A).
