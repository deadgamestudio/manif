/**
 * Who a bot goes after, and where a new bot appears (#5). Pure functions over
 * plain data, so they are unit tested without a room.
 */
import { PlayerStatus } from "../health/index.js";
import type { Vec2 } from "../physics/index.js";
import type { Level } from "../level/index.js";

/** What the bots see of a protester. */
export interface ProtesterView extends Vec2 {
  id: string;
  status: number;
  /** Knocked down (#2). */
  down: boolean;
}

/**
 * The protester a bot at `from` should chase: the nearest `free` one within
 * `sight`. Grabbed, KO and arrested protesters are never chosen. Ties go to
 * the smaller id, so the choice is deterministic.
 *
 * Sticky: while the current target is still valid, it is kept unless another
 * is more than `switchMargin` closer. `ignoreId` is skipped (a target the bot
 * just gave up on). Returns null when nobody qualifies.
 */
export function pickTarget(
  from: Vec2,
  protesters: Iterable<ProtesterView>,
  sight: number,
  currentId: string | null,
  switchMargin: number,
  ignoreId: string | null = null,
): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  let currentD = Infinity;
  const sightSq = sight * sight;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free || p.id === ignoreId) continue;
    const dSq = (p.x - from.x) ** 2 + (p.z - from.z) ** 2;
    if (!(dSq <= sightSq)) continue;
    const d = Math.sqrt(dSq);
    if (p.id === currentId) currentD = d;
    if (d < bestD || (d === bestD && bestId !== null && p.id < bestId)) {
      bestD = d;
      bestId = p.id;
    }
  }
  if (currentId !== null && currentD !== Infinity && bestD > currentD - switchMargin) return currentId;
  return bestId;
}

/**
 * Where to put a new bot: the spawn point closest to the protesters among
 * those at least `clearance` away from all of them (so it joins the action
 * without landing on anyone). With no protesters, the first point. With no
 * point far enough, the one farthest from everybody. Null if `points` is empty.
 */
export function pickSpawn(points: readonly Vec2[], protesters: readonly Vec2[], clearance: number): Vec2 | null {
  if (points.length === 0) return null;
  if (protesters.length === 0) return points[0] ?? null;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  let farthest: Vec2 | null = null;
  let farthestD = -Infinity;
  for (const pt of points) {
    let nearest = Infinity;
    for (const p of protesters) nearest = Math.min(nearest, Math.hypot(p.x - pt.x, p.z - pt.z));
    if (nearest >= clearance && nearest < bestD) {
      bestD = nearest;
      best = pt;
    }
    if (nearest > farthestD) {
      farthestD = nearest;
      farthest = pt;
    }
  }
  return best ?? farthest;
}

/**
 * Where a grabbing bot drags its protester (#5): a point beside each police
 * van of the level, on the side facing the middle of the street, `gap` out
 * from the van's flank.
 */
export function vanDoors(level: Level, gap = 1): Vec2[] {
  const doors: Vec2[] = [];
  for (const b of level.boxes) {
    if (b.kind !== "van") continue;
    const side = b.x > 0 ? -1 : 1;
    doors.push({ x: b.x + side * (b.halfX + gap), z: b.z });
  }
  return doors;
}
