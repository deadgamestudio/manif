/**
 * Where an arrested protester comes back (#3): at the rear of the cortège,
 * RESPAWN_MARGIN behind the rearmost free protester, spread across the street,
 * pushed clear of obstacles, and never ahead of that rearmost protester. When
 * the rear is in (or behind) the start zone, or nobody is free, it falls back
 * to a normal start-zone spawn.
 */
import { circleOverlaps, clamp, resolveCircle, type Vec2 } from "../physics/index.js";
import { inRect, levelWorld, progressAt, spawnPoint, type Level } from "../level/index.js";
import { RESPAWN_MARGIN, RESPAWN_SPREAD } from "./constants.js";

/** Progress (0..1) of the rearmost of `positions`, or null if there are none. */
export function rearProgress(level: Level, positions: Iterable<Vec2>): number | null {
  let rear: number | null = null;
  for (const p of positions) {
    const t = progressAt(level, p.x, p.z);
    if (rear === null || t < rear) rear = t;
  }
  return rear;
}

/** Highest progress anywhere in the start zone: respawns at or behind it just use the start zone. */
function startFront(level: Level): number {
  const s = level.start;
  return Math.max(
    progressAt(level, s.minX, s.minZ),
    progressAt(level, s.minX, s.maxZ),
    progressAt(level, s.maxX, s.minZ),
    progressAt(level, s.maxX, s.maxZ),
  );
}

/**
 * Pick a respawn point. `freePositions` are the free protesters still in the
 * street (not the one respawning). `random` returns values in [0, 1).
 */
export function respawnPoint(
  level: Level,
  radius: number,
  freePositions: Iterable<Vec2>,
  random: () => number = Math.random,
  margin = RESPAWN_MARGIN,
  spread = RESPAWN_SPREAD,
): Vec2 {
  const rear = rearProgress(level, freePositions);
  const { from, to } = level.progress;
  const ax = to.x - from.x;
  const az = to.z - from.z;
  const len = Math.hypot(ax, az);
  if (rear === null || len === 0) return spawnPoint(level, radius, random);

  const t = rear - margin / len;
  if (t <= startFront(level)) return spawnPoint(level, radius, random);

  const world = levelWorld(level);
  const b = level.bounds;
  // Unit normal to the progress axis, for the sideways spread.
  const nx = -az / len;
  const nz = ax / len;
  const baseX = from.x + ax * t;
  const baseZ = from.z + az * t;
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = (random() * 2 - 1) * spread;
    const x = clamp(baseX + nx * s, b.minX + radius, b.maxX - radius);
    const z = clamp(baseZ + nz * s, b.minZ + radius, b.maxZ - radius);
    const res = resolveCircle(world, x, z, radius);
    if (
      inRect(b, res.x, res.z) &&
      !circleOverlaps(world, res.x, res.z, radius) &&
      progressAt(level, res.x, res.z) <= rear
    ) {
      return { x: res.x, z: res.z };
    }
  }
  // Nothing clear near the rear (a wall of obstacles there): the start zone is always safe.
  return spawnPoint(level, radius, random);
}
