/**
 * Jeun-Lac Moluchan (#85), the pure rules: whether and when he shows up, who
 * stands in his ring, what the ring gives, where he walks and what he says.
 * The server runs the event (`apps/server/src/features/moluchan/`); clients
 * draw the ring from his synced position, so no per-player flag is synced.
 *
 *   round starts ──rolled (chance)──> arrival point picked in [earliest, latest]
 *   front passes it ──> Rallying (aura on, duration) ──> Leaving (to a side street) ──> gone
 *                            └──── a CRS grabs him ────> Grabbed (a last line) ──> gone
 *
 * He is not a protester: he counts for neither the win, the wipe, the bot
 * fill nor the scores. The room never puts him in `state.players`.
 */
import { PlayerStatus } from "../health/index.js";
import { progressAt, type Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import { MOLUCHAN, MOLUCHAN_LINES, type MoluchanLineKind } from "./constants.js";

/**
 * The start-of-round roll: the front progress at which he arrives this round,
 * or null when he doesn't come. One roll per round, so at most one visit.
 */
export function rollMoluchan(random: () => number = Math.random, chance: number = MOLUCHAN.chance): number | null {
  if (!(random() < chance)) return null;
  return MOLUCHAN.earliest + (MOLUCHAN.latest - MOLUCHAN.earliest) * random();
}

/**
 * Whether he arrives now: the cortège's `front` has reached the rolled point
 * `at`, and is not past MOLUCHAN.latest (a front that jumped past it, a
 * debug teleport say, means no visit this round).
 */
export function moluchanDue(at: number | null, front: number): boolean {
  return at !== null && front >= at && front <= MOLUCHAN.latest;
}

/** Whether `p` stands in the ring around `centre` (none: nobody does). Centre to centre, edge included. */
export function inMoluchanAura(centre: Vec2 | null, p: Vec2, radius: number = MOLUCHAN.auraRadius): boolean {
  if (!centre) return false;
  return (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2 <= radius * radius;
}

/**
 * The walking speed factor of the ring: a factor that multiplies the others
 * (archetype, gas, fire, a bot's own), 1 outside. There is one Moluchan at
 * most, so it never stacks with itself.
 */
export function moluchanSpeedFactor(inside: boolean): number {
  return inside ? MOLUCHAN.speedFactor : 1;
}

/** How much meter one counted struggle press fills, as a factor of the usual (#70). 1 outside the ring. */
export function moluchanStruggleFactor(inside: boolean): number {
  return inside ? MOLUCHAN.struggleFactor : 1;
}

/**
 * The heal rate (HP a second) of someone with `cgtRate` from the CGT's aura
 * (#14, already the best in reach): the ring adds its own on top. Two
 * different sources add up; neither stacks with itself.
 */
export function combinedHealRate(cgtRate: number, inside: boolean): number {
  return Math.max(0, cgtRate) + (inside ? MOLUCHAN.healRate : 0);
}

/** What he sees of a protester. */
export interface MoluchanSeen extends Vec2 {
  /** A `PlayerStatus`. */
  status: number;
}

/** The point on the street's axis at progress `t`. */
function along(level: Level, t: number): Vec2 {
  const { from, to } = level.progress;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

/**
 * Where he heads: the thickest group of free protesters (the one with the most
 * others within his ring, ties to the one nearest him), but never closer than
 * MOLUCHAN.behindFront to the front: a point past that is pulled back along
 * the street's axis. With nobody free, he stays where he is.
 */
export function moluchanGoal(level: Level, self: Vec2, protesters: readonly MoluchanSeen[], front: number): Vec2 {
  let best: MoluchanSeen | null = null;
  let bestCount = -1;
  let bestD = Infinity;
  const r2 = MOLUCHAN.auraRadius * MOLUCHAN.auraRadius;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free) continue;
    let count = 0;
    for (const q of protesters) {
      if (q !== p && q.status === PlayerStatus.Free && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= r2) count++;
    }
    const d = Math.hypot(p.x - self.x, p.z - self.z);
    if (count > bestCount || (count === bestCount && d < bestD)) {
      best = p;
      bestCount = count;
      bestD = d;
    }
  }
  if (!best) return { x: self.x, z: self.z };
  const limit = front - MOLUCHAN.behindFront;
  const t = progressAt(level, best.x, best.z);
  if (t <= limit) return { x: best.x, z: best.z };
  // Same side of the street, pulled back to the limit.
  const a = along(level, t);
  const b = along(level, Math.max(0, limit));
  return { x: best.x - a.x + b.x, z: best.z - a.z + b.z };
}

/**
 * His way in: the side street door (see `truckBays`) closest behind the
 * front, no further back than MOLUCHAN.entryBehindMax; with none, `rear`
 * (the back of the cortège). A surprise either way: never in front.
 */
export function moluchanEntry(level: Level, doors: readonly Vec2[], front: number, rear: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestT = -Infinity;
  for (const d of doors) {
    const t = progressAt(level, d.x, d.z);
    if (t > front - MOLUCHAN.behindFront || t < front - MOLUCHAN.entryBehindMax) continue;
    if (t > bestT) {
      bestT = t;
      best = d;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: rear.x, z: rear.z };
}

/** His way out: the nearest side street door, or `fallback` with none. */
export function moluchanExit(doors: readonly Vec2[], at: Vec2, fallback: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const d of doors) {
    const dist = Math.hypot(d.x - at.x, d.z - at.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: fallback.x, z: fallback.z };
}

/**
 * A line of `kind` for his bubble, as an index into MOLUCHAN_LINES, avoiding
 * `previous` when the kind has another. -1 when the kind has none.
 */
export function pickMoluchanLine(kind: MoluchanLineKind, previous: number, random: () => number = Math.random): number {
  const pool: number[] = [];
  MOLUCHAN_LINES.forEach((l, i) => {
    if (l.kind === kind && i !== previous) pool.push(i);
  });
  if (pool.length === 0) return MOLUCHAN_LINES[previous]?.kind === kind ? previous : -1;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? -1;
}

/** The text of a synced line index, "" when out of range. */
export function moluchanLineText(index: number): string {
  return MOLUCHAN_LINES[index]?.text ?? "";
}
