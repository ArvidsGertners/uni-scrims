# Replay viewer: R0 findings

Phase R0 of [replay-viewer.md](replay-viewer.md), 2026-10-27. Spike test without app code: where every item the viewer needs sits in a Valorant replay, and whether we can read it.

## Inputs

| Replay | Build | Map | Length | Notes |
| --- | --- | --- | --- | --- |
| **User's replay** (a friend's game, `replays/1b9f….vrf`, git-ignored) | `++Ares-Core+release-13.08` (current) | Jam = Lotus | 27:50, 17 rounds | **Primary input**, 60 MB, 10 players |
| vrfkit public fixture `12974d2b….13_00.vrf` | 13.00 | — | 39 s | Snippet; contains Cypher but no placed tripwire |
| vrfkit public fixtures `….12_10.vrf`, `….12_11.vrf` | 12.10 / 12.11 | — | short | Snippets, little gameplay |

The public fixtures come from `michel-giehl/ValorantReplayParser` at commit `b51d674`, with SHA-256 checks as in vrfkit's CI.

## Tooling

| What | Detail |
| --- | --- |
| Parser | vrfkit `yakisoba0728/vrfkit` at `b9496df` (2026-10-16), Apache-2.0, built from source on Linux |
| Rust | 1.90.0, user-local in `~/.cargo` |
| Work directory | `~/replay-work`, outside the repo. It holds the build, a Python venv with duckdb 1.4.1 + pyarrow 21.0.0, and the Parquet output |
| Speed on the user's replay | full export with checkpoints: **1.8 s, 169 MB peak RAM**; `validate`: PASS |
| Decompression | the pure-Rust crate `oozextract` (MIT), no native Oodle library |

**Memory and storage** (measured 2026-10-27 after the user asked about the 170 MB):

| Run | Peak RAM |
| --- | --- |
| export with checkpoints | 169 MB |
| export without checkpoints | 133 MB |
| `validate` (one decode pass, no tables) | 91 MB |

- The floor is roughly the file size (60 MB), because the whole file is held in memory.
- The memory is used once, in the uploader's own browser tab, for about 2 s. The server never parses.
- **Stored per replay**: the position tracks (10 players, 10 Hz, x/y/yaw, delta-encoded) are 1.5 MB as JSON and **0.27 MB gzipped**. With events, a full replay is expected well under 1 MB gzipped.
- Example: 150 scrims a week, each saved, kept 90 days ≈ 2,000 replays ≈ 1–2 GB of disk. The VPS has 157 GB free.
- R5 builds the reducer so it goes straight from decoded events to the replay JSON, without the large intermediate tables.

**WASM is feasible for R1**: the memory is far below browser limits, and there is no native dependency in the decode path.

## Results per item (§2 of the concept)

✅ readable with vrfkit as is · 🔧 present in the data, needs a small decoder of ours · ⚠️ not seen in these replays

| Item | Where it is (class → field) | Status |
| --- | --- | --- |
| Positions | `movement` table: `character_net_guid, pos_x/y/z`, 1.95 M rows | ✅ |
| View direction | `movement.yaw` (and `pitch`) | ✅ |
| Players ↔ agents | `manifest.players` (subject UUID → character actor) + `game_specific_data.playerLoadouts[].characterId` (agent UUID, maps via valorant-api) | ✅ |
| HP / armour after every hit | `DamageableComponent` → `MulticastNotifyDamage_Point/_Base.LifeChangeEvents[i].{ChangedComponent, DeltaLife, LifeResult}` (health and armour are separate components) | ✅ values decoded; map the component to health/armour in R4/R9 |
| Current weapon | `AresInventory.NewCurrentEquippable` (actor GUID → class path, e.g. `Gun_…`) | ✅ |
| **Ult points** | `BombPlayerState.NumUltimatePoints` (+ `TotalAcquiredUltimatePoints`, `bUltimateActive`); `characterUltimateUsed` events | ✅ |
| **Ability charges** | `EquipmentChargeComponent.AuthResourceAmount` (+ `CurrentTemporaryCharges`, `ChargesBoughtThisRound`), signature ability: `SignatureAbilityResourceComponent.AuthSignatureChargeAmount` | ✅ values; 🔧 map each component to its player and slot (C/Q/E) via the owner chain in R2 |
| Kills | `characterDeath` events (125); `<Agent>_PC.MulticastNotifyKilledEnemy.{KillerCharacter, KilledCharacter, MultikillLevel}`; `MulticastNotifyDamage_*.bDamageKilledTarget` | ✅ |
| Kill weapon | `MulticastNotifyDamage_*.DamageCauser` / `EquippableUsed` (actor GUID → class) | ✅ |
| Headshot | `MulticastNotifyDamage_Point.DamagedBone` (bone name per hit) | ✅ map bone → head in R4 |
| Wallbang | `MulticastNotifyDamage_Point.bIsWallPenetration` | ✅ |
| Assists | `MulticastNotifyDamage_*.AssistsList` (raw, 141 bits) and `BasicCombatStatsComponent.AggregateAssists` | 🔧 small array decoder (R4) |
| **Round winner, reason, score** | `BombGameState.RoundResults[n].{RoundResult, WinningTeam, WinningTeamRole}`, plus `roundStarted` (17) and `switchTeams` events | ✅ read directly, nothing to derive. This game: Red 13 : 4 Blue, Red attacked first |
| Spike | `spikePlanted` (15) / `spikeDefused` (5) events, `BombEquippable` owner + `MulticastPlayBombPickedUpAudio.NewCharacter` (carrier), `BombGameState.BombState` | ✅ |
| Smokes, walls, mollies (place, size, time) | actor opens/closes of `GameObject_*` / `Zone_*` classes with spawn position (e.g. `Zone_Wraith_4_Smoke_C`, `GameObject_Rift_E_SmokeZone_C`) | ✅ |
| **Orientation of deployables** | `actors.spawn_yaw` on open, e.g. Chamber trap `GameObject_Deadeye_E_Trap_C` (15 different yaws), Vyse `GameObject_Nox_WallTrap_C` | ✅ |
| **Wire/wall anchors** | Vyse's wall: `GameObject_Nox_WallTrap_C.MulticastInitializeTrapAnchors.{WallStartPoint, WallEndPoint, Impact Point, ImpactNormal}`. vrfkit leaves these as raw bits: 192 bits = three little-endian doubles. Decoded by hand: start `(4695.9, -3750.3, 108.2)` → end `(5895.9, -3750.3, 108.2)` | 🔧 3-double decoder (R3); confirmed working |
| **Cypher tripwire, KJ turret** | Not in the user's game (agents: Fade, Chamber, Sova, Vyse, Astra, Omen, 2× Jett, 2× Phoenix). The 13.00 fixture has Cypher's ability actors but no placed wire | ⚠️ not verified. Expected the same way as Vyse's wall (an anchor multicast on the `GameObject_Gumshoe_E_TripWire*` actor + `spawn_yaw` for the turret). Needs a replay with Cypher/KJ (§ open items) |
| Game mode | No queue field found. The replay has `BombPlayerState.CompetitiveTier` and weekly-mission progress (`Season26-6_Week*_Mission`), which point to a matchmade game, **probably not a custom game** | ⚠️ R0b stays open |

Internal agent names seen: BountyHunter = Fade, Deadeye = Chamber, Hunter = Sova, Nox = Vyse, Rift = Astra, Wraith = Omen, Wushu = Jett, Phoenix = Phoenix. Expected later: Gumshoe = Cypher, Killjoy = Killjoy. R6 builds the full list from the agent UUIDs, not from these names.

## What this means for the phases

- **R1** (fork + WASM): no blocker. `oozextract` is pure Rust and the peak memory is ~170 MB.
- **R2** (charges + ult): the values are already decoded. The work is mapping each charge component to its player and ability slot.
- **R3** (utility): orientation comes from `spawn_yaw`; the anchors need a 3-double decoder, already proven on Vyse's wall. Tripwire/turret: same pattern expected, to confirm with a Cypher/KJ replay.
- **R4** (kills + rounds): round results can be read directly; headshot, wallbang and weapon too. Only `AssistsList` needs a small decoder.
- **R5** (format): the replay JSON can be built from `movement`, `actors`, `fields`, `events` and the manifest.

## Open items

1. **A replay with Cypher and Killjoy** (any mode, current build) to confirm tripwire anchors and turret facing. Needed before R3 is finished.
2. **R0b**: a custom-game replay with recording turned on. Needed before R11. This replay was probably matchmade.
3. **Fixtures**:
   - Real replays never go into git: the user's replay holds 10 account UUIDs and gameplay.
   - Tests use small JSON fixtures derived from it, with the subject UUIDs replaced.
   - The public fixtures are hosted in an MIT repo, but the replay content is Riot/player data. Like vrfkit, we fetch them in tests by URL + SHA-256 and don't copy them in.
