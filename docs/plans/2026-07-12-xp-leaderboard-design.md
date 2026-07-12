# XP System & Leaderboard — Design

## Goal

Kills grant XP. Pilots level up on an unbounded curve. A top-right in-memory
leaderboard shows the top 10 by rank plus your own rank when you fall outside it.

## Decisions (locked with the user)

- **Reward scales with victim level** — killing a higher-level ship is worth more.
- **Score/cosmetic only** — level does not change hull/damage. No balance impact.
- **Reset on death** — dying (players *and* bots) resets level→1, xp→0. XP is
  purely current-life state.
- **Bots + players on the leaderboard** — bots share the same code path, so they
  rank too; they reset on death like everyone, so they don't runaway-climb.
- **Leaderboard ranks by current life** — level desc, xp desc. Die and you drop.
- **In-memory only** — no persistence; nothing survives a server restart.

## XP curve

```
xpForNextLevel(level)     = 10 * level^2      // 10, 40, 90, 160, 250, ...
killXp(victimLevel)       = 10 * victimLevel  // kill L1 -> 10, L2 -> 20, ...
```

Against an **equal-level** opponent this is exactly the user's spec: 1 kill → L2,
2 → L3, 3 → L4 … (kills-per-level == your level). Against **weaker** targets it's
`L^2` kills, so once you outlevel the level-1 bots, farming them stalls and you're
pushed to hunt leveled ships. Leftover XP carries into the next level. No cap.

everwilds' curve (`~12.5*L*(15+5L)`, ~12 kills for the first level) was used as a
reference but is far too steep for "one kill → level 2", so only its quadratic
*shape* was kept and retuned. Fast early leveling suits ~30-min sessions with
frequent respawns.

## Architecture

The sim is server-authoritative (the client does not run `CombatSubsystem`), so all
XP/kill/leaderboard logic is server-side. The shared sim only *records* kills.

### Kill attribution (shared sim, minimal)
- `Ship` gains `level = 1`, `xp = 0`, `lastHitBy: Ship | null = null`.
- `CombatSubsystem.dealDamage` stamps `victim.lastHitBy = attacker.owner` (mirrors
  the existing `lastImpact` stamp). Only bullets deal damage, so the killer is
  always the firing ship.
- When a *ship* (not an asteroid) dies, the death loop records
  `{ killerId, victimId, victimLevel }` into a drainable `kills[]`; `drainKills()`
  mirrors `MiningSubsystem.drainSpawned`.
- `RespawnSubsystem.respawnShip` resets `level→1, xp→0` alongside health.

### XP award (server)
- `GameServer` keeps a `combat` field; each tick after subsystems it drains kills
  and calls the pure `awardKill(killerShip, victimLevel)` from
  `shared/sim/progression.ts` (formulas + level-up loop). Null/self killers are
  ignored. Victim level is read from the kill record (captured at death, before the
  next tick's respawn reset).

### Transport (two new messages)
- `Progress` (id 19) — server → **owner only**, change-tracked like `Stats`:
  `{ level, xp, xpForNext }`. Drives the already-built HUD badge + XP bar.
- `Leaderboard` (id 20) — server → each connection, **throttled ~3 Hz**, tailored
  per recipient: top-10 `[name, level]` entries + `selfRank` + `selfLevel`. Ranked
  over all alive ships (players + bots). Highlight the row at `selfRank-1`; if
  `selfRank > 10`, append a `#selfRank You Lvl selfLevel` row.

### Client
- `connection.ts`: add both messages to the union + deserialize switch.
- `network-client.ts`: `Progress` → mirror onto local ship + `onProgress`
  callback; `Leaderboard` → `onLeaderboard` callback.
- `game.ts`: `onProgress` → `playerHud.setLevel` / `setXp(xp/xpForNext)`;
  instantiate `LeaderboardHud`, feed it `onLeaderboard`.
- New `client/src/ui/leaderboard-hud.ts` — top-right panel styled to match
  `player-hud.ts` (dark, cyan self-accent, gold levels), DOM-diffed per update.

## Tests
- `progression.test.ts` — curve values + `awardKill` level-up (carry, multi-level,
  victim-scaling).
- `combat.test.ts` — `lastHitBy` stamped; `drainKills` reports killer/victim/level
  on a ship death; asteroid death records no kill.
- `respawn.test.ts` — respawn resets level/xp.
- `messages.test.ts` — `Progress`/`Leaderboard` serialize↔deserialize round-trip.

## Out of scope (YAGNI)
- Stat boosts from leveling. Persistence. Showing other ships' levels in-world.
  Kill feed / notifications. Session-cumulative scoring.
