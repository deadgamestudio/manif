/**
 * Melee hit (#4): the arc check, line of sight and cooldown. Pure functions
 * over plain data. The server runs them from its own positions and facing;
 * the client only sends the intent to swing.
 *
 * Targets are shapes (props now; CRS bodies, #5, are circles): a target is hit
 * when the swing's arc reaches any part of it and no static obstacle stands in
 * between.
 */
import type { BoxShape, CircleShape, Vec2 } from "../physics/index.js";
import type { PropShape } from "../prop/index.js";
import { MELEE_COOLDOWN, MELEE_HALF_ANGLE, MELEE_RANGE } from "./constants.js";

/** Who swings: a position and a facing angle around Y (0 faces +Z, like `Player.rotation`). */
export interface Attacker extends Vec2 {
  rotation: number;
}

/** Static obstacles that block a swing (the level's boxes and circles; not props). */
export interface Obstacles {
  boxes: readonly BoxShape[];
  circles: readonly CircleShape[];
}

const EPS = 1e-6;

/** Unit ground direction of a facing angle. */
export function facingDir(rotation: number): Vec2 {
  return { x: Math.sin(rotation), z: Math.cos(rotation) };
}

/** Whether a point is within `range` of the attacker and within `halfAngle` of its facing. A point on the attacker counts. */
export function inMeleeArc(
  attacker: Attacker,
  target: Vec2,
  range = MELEE_RANGE,
  halfAngle = MELEE_HALF_ANGLE,
): boolean {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d > range + EPS) return false;
  if (d < EPS) return true;
  const f = facingDir(attacker.rotation);
  return (dx * f.x + dz * f.z) / d >= Math.cos(halfAngle) - EPS;
}

/** The point of a shape closest to `p` (`p` itself when inside). */
export function closestPoint(shape: PropShape, p: Vec2): Vec2 {
  if (shape.type === "box") {
    return {
      x: Math.max(shape.x - shape.halfX, Math.min(shape.x + shape.halfX, p.x)),
      z: Math.max(shape.z - shape.halfZ, Math.min(shape.z + shape.halfZ, p.z)),
    };
  }
  const dx = p.x - shape.x;
  const dz = p.z - shape.z;
  const d = Math.hypot(dx, dz);
  if (d <= shape.r) return { x: p.x, z: p.z };
  return { x: shape.x + (dx / d) * shape.r, z: shape.z + (dz / d) * shape.r };
}

/**
 * Where a segment from `a` to `b` first enters a shape, as a fraction in
 * [0, 1], or null if it misses. 0 when `a` is inside.
 */
export function segmentEntry(a: Vec2, b: Vec2, shape: PropShape | ({ type: "box" } & BoxShape)): number | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (shape.type === "circle") {
    const fx = a.x - shape.x;
    const fz = a.z - shape.z;
    const c = fx * fx + fz * fz - shape.r * shape.r;
    if (c <= 0) return 0;
    const qa = dx * dx + dz * dz;
    if (qa < EPS * EPS) return null;
    const qb = 2 * (fx * dx + fz * dz);
    const disc = qb * qb - 4 * qa * c;
    if (disc < 0) return null;
    const t = (-qb - Math.sqrt(disc)) / (2 * qa);
    return t >= 0 && t <= 1 ? t : null;
  }
  // Slab test.
  let t0 = 0;
  let t1 = 1;
  for (const [o, d, min, max] of [
    [a.x, dx, shape.x - shape.halfX, shape.x + shape.halfX],
    [a.z, dz, shape.z - shape.halfZ, shape.z + shape.halfZ],
  ] as const) {
    if (Math.abs(d) < EPS) {
      if (o < min || o > max) return null;
      continue;
    }
    let ta = (min - o) / d;
    let tb = (max - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * Whether a segment passes through the inside of a box or circle. Grazing an
 * edge or a face does not count, and neither does an end point lying on the
 * surface (a target standing against a wall can still be hit).
 */
export function segmentBlockedBy(a: Vec2, b: Vec2, shape: BoxShape | CircleShape): boolean {
  if ("r" in shape) {
    const r = shape.r - EPS;
    if (r <= 0) return false;
    return segmentEntry(a, b, { type: "circle", x: shape.x, z: shape.z, r }) !== null;
  }
  const halfX = shape.halfX - EPS;
  const halfZ = shape.halfZ - EPS;
  if (halfX <= 0 || halfZ <= 0) return false;
  return segmentEntry(a, b, { type: "box", x: shape.x, z: shape.z, halfX, halfZ }) !== null;
}

/** True if no obstacle stands between `a` and `b`. */
export function hasLineOfSight(obstacles: Obstacles, a: Vec2, b: Vec2): boolean {
  for (const box of obstacles.boxes) if (segmentBlockedBy(a, b, box)) return false;
  for (const c of obstacles.circles) if (segmentBlockedBy(a, b, c)) return false;
  return true;
}

/**
 * Where a swing touches a shape, or null if it does not reach it. The swing
 * reaches a shape when its nearest point is in the arc, or when the straight
 * line along the facing meets it within range (a big car seen at an angle).
 */
export function meleeContact(
  attacker: Attacker,
  shape: PropShape,
  range = MELEE_RANGE,
  halfAngle = MELEE_HALF_ANGLE,
): Vec2 | null {
  const near = closestPoint(shape, attacker);
  if (inMeleeArc(attacker, near, range, halfAngle)) return near;
  const f = facingDir(attacker.rotation);
  const end = { x: attacker.x + f.x * range, z: attacker.z + f.z * range };
  const t = segmentEntry(attacker, end, shape);
  if (t === null) return null;
  return { x: attacker.x + f.x * range * t, z: attacker.z + f.z * range * t };
}

export interface MeleeTarget {
  id: string;
  shape: PropShape;
}

export interface MeleeHit {
  id: string;
  /** Where the swing landed, for the hit effect and the push direction. */
  point: Vec2;
}

/**
 * Every target the swing lands on: in reach and arc, with no static obstacle
 * in between. Targets do not shield each other (v1).
 */
export function meleeHits(
  attacker: Attacker,
  targets: Iterable<MeleeTarget>,
  obstacles: Obstacles,
  range = MELEE_RANGE,
  halfAngle = MELEE_HALF_ANGLE,
): MeleeHit[] {
  const hits: MeleeHit[] = [];
  for (const t of targets) {
    const point = meleeContact(attacker, t.shape, range, halfAngle);
    if (point && hasLineOfSight(obstacles, attacker, point)) hits.push({ id: t.id, point });
  }
  return hits;
}

/** Whether a new swing is allowed. `lastAt` is the room time of the previous accepted swing, if any. */
export function cooldownReady(lastAt: number | undefined, now: number, cooldown = MELEE_COOLDOWN): boolean {
  return lastAt === undefined || now - lastAt >= cooldown - EPS;
}
