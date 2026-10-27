# Replay viewer: R0 findings

Phase R0 of [replay-viewer.md](replay-viewer.md), 2026-10-27. Spike test without app code: where every item the viewer needs sits in a Valorant replay, and whether we can read it.

## Inputs

| Replay | Build | Map | Length | Notes |
| --- | --- | --- | --- | --- |
| **User's replay** (a friend's game, `replays/1b9f….vrf`, git-ignored) | `++Ares-Core+release-13.08` (current) | Jam = Lotus | 27:50, 17 rounds | **Primary input**, 60 MB, 10 players |
| **User's 2nd replay** (`replays/9d63….vrf`, git-ignored, added 2026-10-27) | header says `release-13.08`, changelist 2153243948, identical to the first. The user expected 13.09 | Bonsai = Split | 13:07, 7 rounds, **Swiftplay** | 24 MB, 10 players; validate PASS, export 0.7 s / 82 MB, 0 malformed blocks |
| **User's 3rd replay** (`replays/7703….vrf`, git-ignored, a friend's Swiftplay, added 2026-10-27) | `release-13.08`, changelist 5760300 | Port = Icebox | 10:32 | 20 MB, 10 players; Killjoy, Sage, Raze, Neon, Miks |
| **User's 4th replay** (`replays/9b59….vrf`, git-ignored, a friend's Swiftplay, added 2026-10-27) | `release-13.08`, changelist 5760300 | Pitt = Pearl | 13:03 | 27 MB, 10 players; Cypher, Sage, Miks |
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
- Example: 150 scrims a week, each saved, kept 90 days ≈ 2,000 replays ≈ 1–2 GB. They are stored on the Hetzner Storage Box (user decision, concept §4), not on the VPS disk.
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

Internal agent names seen: BountyHunter = Fade, Deadeye = Chamber, Hunter = Sova, Nox = Vyse, Rift = Astra, Wraith = Omen, Wushu = Jett, Phoenix = Phoenix. Expected later: Gumshoe = Cypher, Killjoy = Killjoy. R6 builds the full list from the agent UUIDs, not from these names. The full list of codenames (valorant-api `developerName`, checked 2026-10-27) is in the R3b section.

## Second replay (Swiftplay, Split), 2026-10-27

Everything from the first replay holds here as well, with no parser change:
- 0.8 M movement rows
- `NumUltimatePoints` and `AuthResourceAmount` present
- damage with `bIsWallPenetration`
- `RoundResults` present: Red 5 : 2 Blue, round 7 won by defuse; the side switch is after round 4, as Swiftplay does it
- an extra `spikeExploded` event

New findings:
- **Game mode can be read**: the game-state actor's class is `Swiftplay_EoRCredits_GameState_C` here and `BombGameState_C` in the first replay. A custom game probably has its own class or uses `BombGameState_C`. That's to be checked with a custom replay (R0b).
- **More deployables with orientation or a target point**:
  - Deadlock's sound sensor `GameObject_StealthingTrap_SoundSensor_C` (with `spawn_yaw`)
  - `GameObject_CableJam_CableDeployer_Precomputed_C.MulticastInitialize.Destination` (a start + end point, the same kind of data as a tripwire)
  - teleporter / trap actors with spawn position
- **The "13.09" question**: this file says release-13.08 with the same changelist as the first one. Either the game client was already 13.09 and the server still recorded 13.08, or the replay is from 13.08. vrfkit accepts it either way. When a replay really says 13.09, vrfkit may reject the unknown branch; then we add the branch in our fork (R1).

New internal agent names: Cable, Pine, Smonk, Vampire. They map via the agent UUIDs in R6.

## R2: charges and ult points per player (2026-10-27)

Built in the fork (`vrf-wasm` 0.2.0, `crates/vrf-wasm/src/abilities.rs`); the binding returns `abilities` and `ults` per player.

- **Charges** = `AuthResourceAmount` on the ability actor's charge component (`EquipmentChargeComponent`, `SignatureAbilityResourceComponent`, `Comp_Ability_GunAmmoResourceComponent_C` for Chamber's pistol). It includes temporary charges, so it is the number the HUD shows. `AuthSignatureChargeAmount` is only a recharge flag. Gun magazines (`/Script/ShooterGame.AmmoComponent`) are ignored.
- Vyse's Shear keeps its charges in a group vrfkit only names `EquipmentChargeComp`, without field names. The handles match `EquipmentChargeComponent` (handle 2 = `AuthResourceAmount`, 32-bit LE), so the binding reads it from the raw bits. No other unnamed group holds charges (checked on both 13.08 replays).
- **Slot**: the character's `ItemSlot` subobjects come in a fixed order, 4 GUIDs apart: primary, secondary, melee, **grenade (C), ability 1 (Q), ability 2 (E)**, passives, defuser, ultimate, unarmed, armour. C/Q/E are the melee slot's GUID **+ 4, + 8, + 12** on all 20 characters of both 13.08 replays; the binding uses the offset, so a slot without contents shifts nothing. **The class folder is not the key**:

| Agent (internal) | Grenade / C | Ability 1 / Q | Ability 2 / E |
| --- | --- | --- | --- |
| Omen (Wraith) | `Wraith_E_ShortTeleport` | `Wraith_Q_NearsightMissile` | `Wraith_4_Smoke` |
| Sova (Hunter) | `Hunter_E_DeployDrone` | `Hunter_4_BoltExplosive` | `Hunter_Q_RevealBolt_Signature` |
| Phoenix | `Phoenix_Q_FireballWall` | `Phoenix_4_Molotov` | `Phoenix_E_FlareCurve` |
| Deadlock (Cable) | `Cable_E_CableJam` | `Cable_Q_SoundSensor` | `Cable_4_NetToss` |
| Jett (Wushu), Fade, Chamber, Astra, Vyse, Clove, Reyna, Pine | the class names happen to match the keys | | |

  The viewer names the slots like valorant-api (`Grenade`, `Ability1`, `Ability2`), so the key labels and icons come from the agent data (R6). Some abilities carry no charge component (Reyna's Dismiss in the Swiftplay replay).
- **Ult points**: `NumUltimatePoints` + `bUltimateActive` on the player state (`players[].state`). `active` turns true within 10 ms of every `characterUltimateUsed`; the points go to 0 when the ult ends. **No maximum in the replay**: `ult.max` comes from an agent table in R6.
- **Plausibility** (instead of an in-game comparison, user decision): on the 13.08 match 919 charge rows and 297 ult rows, none unresolved; all 32 ult uses fit; 393 of 440 charge drops follow equipping an ability within 10 s, and per slot it is that slot's own ability (exceptions: Jett's dash and Astra's stars are cast without equipping).

## R3a: placed utility (2026-10-27)

Built in the fork (`vrf-wasm` 0.3.0, `crates/vrf-wasm/src/utility.rs`); the binding returns `utility` as `spawn` / `update` / `end` events, keyed by the actor GUID.

- **Which actors**: a fixed class table, one row per class seen in the two 13.08 replays. `GameObject_*`, `Zone_*` (Omen's smoke), `Patch_*` (**mollies and slows**: `Patch_Phoenix_MolotovFire`, `Patch_Deadeye_E_Slow_Large`, `Patch_Nox_BarbedWire`, `Patch_Cable_4_NetToss`) and `Intention_Wraith_X_GlobalTeleport` (Omen's ult target). Left out: projectiles in flight, the `Ability_*` equippables, `UltPointOrb`, pickups, Sova's sonar pings and Omen's Paranoia warning (in flight), and **moving pawns** (Sova's drone, Fade's Prowler, Pine's `RadEater`) and Fade's Prowler trail (`Path_BountyHunter_Trail`, a 2104-bit point list not decoded). Cypher/Killjoy classes (`GameObject_Gumshoe_*`, `GameObject_Killjoy_*`) are taken by prefix with `verified: false`; none placed in any replay so far.
- **Position**: every utility open has a spawn position. **Yaw**: in the spawn where the game sends one; none for smoke spheres, Astra's stars and Nebulas, Reyna's Leer, Clove's smokes and some Shear traps (their ends carry the direction).
- **Lifetime**: actor open → close; a `dormant` row is not an end (Pine's teleporters and a few traps re-open). Pieces still live at the end of the replay have no `end`.
- **Size**: not in the replay. The spawn scale is 1 for every utility actor in both 13.08 matches (checked by logging vrfkit's `spawn_scale`; only Sova's sonar bolt has another value). Radii and lengths come from the agent data (R6/R10).
- **Segments** (three little-endian doubles, sent in the frame of the open, so they are part of the `spawn`):

| Class | Agent, ability | Ends |
| --- | --- | --- |
| `GameObject_Nox_WallTrap` | Vyse, Shear (armed) | `MulticastInitializeTrapAnchors.WallStartPoint` / `WallEndPoint`; 1200 units, shorter when geometry cuts it |
| `GameObject_Nox_Wall` | Vyse, Shear (raised wall) | `MulticastInitializeWall.WallStartLocation` / `WallEndLocation`, the trap's ends |
| `GameObject_CableJam_CableDeployer_Precomputed` | Deadlock, one arm of Barrier Mesh | `MulticastInitialize.RootLocation` (= the `GameObject_CableJamRoot` spawn) / `Destination` |

- **Polyline**: Phoenix's Blaze (`GameObject_Phoenix_Q_FlameWallManager_Production`) sends `MulticastAddSmokeScreenPoint.Translation` per wall point, 35–675 ms after the open, about 125 units apart → `update.point`.
- **States** (`update.state`, with `value` where the multicast has one): Vyse's Razorvine `TransitionToState` (values 4, 5, 6), Astra's stars `DeactivateRift`, Pine's `DeployTrap` / `FinishDeploy`, Deadlock's sensor `Deployed` / `BeginStealthTrap`. What each value means is for R10.
- **Player**: `Instigator`, else `Owner`, followed until a player's character (deployable → projectile → ability → character; Astra's targeting pawn → character). All 340 + 111 utility actors resolve; for every one the owner's agent matches the class's agent.
- **Plausibility** (Uni Scrims test, both 13.08 replays): counters 0, one spawn per piece with updates and the end after it, all positions within the area the players walked, owner agent matches, Shear ≤ 1200 units, raised walls on their trap's ends, mesh arms on their root, Blaze points moving away from the first one, every Trademark with a yaw.

## R3b: utility of Cypher, Killjoy, Sage, Raze, Neon, Miks (2026-10-27)

Built in the fork (`vrf-wasm` 0.4.0, `crates/vrf-wasm/src/utility.rs`) from the user's 3rd and 4th replay.

**Codenames** (valorant-api `developerName`): Aggrobot = Gekko, BountyHunter = Fade, Breach = Breach, Cable = Deadlock, Cashew = Tejo, Clay = Raze, Deadeye = Chamber, Grenadier = KAY/O, Guide = Skye, Gumshoe = Cypher, Hunter = Sova, Iris = Miks, Killjoy = Killjoy, Mage = Harbor, Nox = Vyse, Pandemic = Viper, Paprika = Hush, Phoenix = Phoenix, Pine = Veto, Rift = Astra, Sarge = Brimstone, Sequoia = Iso, Smonk = Clove, Sprinter = Neon, Stealth = Yoru, Terra = Waylay, Thorne = Sage, Vampire = Reyna, Wraith = Omen, Wushu = Jett. `Thumper` is Miks' M-Pulse/Harmonize device (its classes come with `Ability_Iris_Thumper`).

| Agent, ability | Class | What the replay has | In the binding |
| --- | --- | --- | --- |
| Cypher, Trapwire | `GameObject_Gumshoe_4_TripWire` + `…_SecondWire` | One actor per anchor, both opened in the same frame (34 pairs, one per frame); the spawn position is the anchor, 342–1425 units apart. The GUID gap is **not** fixed. `SetEnemyInTrap` on both when it catches someone | **pair**: one piece, `a` = its spawn, `b` = the partner's; the first close ends it |
| Cypher, Spycam | `Pawn_Gumshoe_E_PossessableCamera` | Spawn with yaw (one without: a yaw of 0 is left out); its facing while Cypher looks through it is in the movement rows (yaw 219–303 on one camera) | point, `track` |
| Cypher, Cyber Cage, Neural Theft, dart | `GameObject_Gumshoe_Q_CageTrap` (lying), `Zone_Gumshoe_Q_Cage` (active), `GameObject_Gumshoe_X_InterrogateHat`, `GameObject_RemovableObject_GumshoeTrackingDart` | Spawn | point |
| Killjoy, Turret | `Pawn_Killjoy_E_Turret` | Spawn yaw = facing; movement rows exist but the yaw never changes: **its aim is not in the replay** | point, `track` |
| Killjoy, Alarmbot | `Pawn_Killjoy_Q_StealthAlarmbot` | Spawn with yaw, movement rows, `IsBurrowed` | point, `track` |
| Killjoy, Nanoswarm | `Projectile_Killjoy_4_RemoteBees_MultiDetonate`, `GameObject_Killjoy_4_BeeSwarm_Damage` | The projectile opens where it was thrown; `MulticastTriggerExplodeIndicator.IndicatorLocation` (three doubles) is where it lies: all 5 swarm activations are < 0.1 units from it | **landing**: spawns at the indicator; the swarm as a point |
| Killjoy, Lockdown | `GameObject_Killjoy_X_Bomb`, `…_X_Shockwave` | Spawn | point |
| Sage, Barrier Orb | `GameObject_Thorne_E_Wall_Fortifying` + 4 × `…_Wall_Segment_Fortifying` | Each segment its own actor with position and yaw, opened in the wall's frame, < 400 units from it; destroyed one by one; `Fortify` when it hardens | point per segment, state `Fortify` |
| Sage, Slow Orb | `Patch_Thorne_4_SlowField_Production` | Spawn | point |
| Raze, Paint Shells | `Projectile_Clay_4_Projectile_SecondarySpawner`, `…_Projectile_Secondary` | The spawner opens where the shell burst (as the primary closes); the bomblets send the indicator where they land, < 800 units from it, and close there | spawner as a point, bomblets as **landings** |
| Raze, Blast Pack | `Projectile_Clay_Q_Satchel_Arming`, `GameObject_Clay_Q_Explosion` | The indicator is where it stuck; 7 of 8 explosions are on one | landing; explosion as a point |
| Raze, Boom Bot | `Pawn_Clay_E_Boomba` | A path in the movement rows (990 rows, 7800 units) | point, `track` |
| Neon, Fast Lane / Relay Bolt | `GameObject_Sprinter_4_Tunnel`, `GameObject_Sprinter_Q_ElectricSphere` | `MulticastAddTunnelPoint.Translation`, 20–28 points per lane | polyline / point |
| Miks, Waveform / Bassquake | `GameObject_Iris_E_Smoke` (no yaw), `GameObject_Iris_X_SonicWave` | Spawn | point |
| Miks, M-Pulse / Harmonize | `GameObject_Thumper_Concuss`, `GameObject_Thumper_Heal` | Spawn; `Lift` when it fires. `GameObject_Thumper_ConcussPulse` opens every 2 s and is **never closed** | point, state `Lift`; the pulse is left out |

- **Pawns** are now utility (`track: true`), including the moving ones R3a left out (Sova's drone, Fade's dogs, Veto's Interceptor `Pawn_Pine_E_RadEater`): every one has movement rows under its GUID, so the viewer takes their path and facing from there. Fade's trail stays out.
- `IndicatorLocation` is sent by almost every thrown projectile (flashes, mollies, bolts); only a landing class's counts, the rest is not counted as unresolved.
- No pawn shows up in `players[].characters` (the camera Cypher looks through included).
- **Agents without a replay** (R3c): `GameObject_`/`Zone_`/`Patch_` classes with their codename come as points with `verified: false`.
- **Plausibility** (Uni Scrims test, all four replays): counters 0, every owner's agent matches the class, the checks above, and every shape check runs in at least one replay.

## What this means for the phases

- **R1** (fork + WASM): no blocker. `oozextract` is pure Rust and the peak memory is ~170 MB.
- **R2** (charges + ult): the values are already decoded. The work is mapping each charge component to its player and ability slot.
- **R3** (utility): orientation comes from `spawn_yaw`; the anchors need a 3-double decoder, already proven on Vyse's wall. Tripwire/turret: same pattern expected, to confirm with a Cypher/KJ replay.
- **R4** (kills + rounds): round results can be read directly; headshot, wallbang and weapon too. Only `AssistsList` needs a small decoder.
- **R5** (format): the replay JSON can be built from `movement`, `actors`, `fields`, `events` and the manifest.

## Open items

1. ~~A replay with Cypher and Killjoy~~: done with the user's 3rd and 4th replay (R3b). Still open for R3c: replays with Brimstone, Viper, Harbor, KAY/O, Breach, Skye, Gekko, Yoru, Iso, Tejo, Waylay and Hush, and Deadlock's and Sova's ult.
2. **R0b**: a custom-game replay with recording turned on. Needed before R11. This replay was probably matchmade.
3. **Fixtures**:
   - Real replays never go into git: the user's replay holds 10 account UUIDs and gameplay.
   - Tests use small JSON fixtures derived from it, with the subject UUIDs replaced.
   - The public fixtures are hosted in an MIT repo, but the replay content is Riot/player data. Like vrfkit, we fetch them in tests by URL + SHA-256 and don't copy them in.
