/**
 * Circle-vs-static-shape collision on the ground plane (x, z).
 *
 * Pure functions over plain data, so they run in the server tick, in bots and
 * in unit tests alike. The server is the only place that collides players; the
 * client never runs this for movement, it only renders server positions.
 */

export interface Vec2 {
  x: number;
  z: number;
}

/** Axis-aligned rectangle on the ground. */
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Axis-aligned box obstacle: centre and half extents. */
export interface BoxShape {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /** A hop (#45) clears it: an intact bin. Ignored by walkers, bots and everything else. */
  hoppable?: boolean;
}

/** Round obstacle (bollard, tree, lamp post). */
export interface CircleShape {
  x: number;
  z: number;
  r: number;
  /** A hop (#45) clears it: an intact bin, a fallen CRS. Ignored by walkers, bots and everything else. */
  hoppable?: boolean;
  /**
   * Gives way when squeezed (#45: a CRS lying in the street). Blocks like any
   * shape, but where it closes a gap narrower than a body next to a wall or a
   * prop, those win and the body may overlap it a little. Never in level data.
   */
  soft?: boolean;
}

/**
 * `true` for a body in the air (#45): shapes flagged `hoppable` are skipped.
 * Filtered at query time, so a hopping body never needs a world of its own.
 */
export type SkipHoppable = boolean;

/** Everything a moving circle collides against. */
export interface CollisionWorld {
  /** The circle's centre is kept inside these bounds, shrunk by its radius. */
  bounds: Rect;
  boxes: readonly BoxShape[];
  circles: readonly CircleShape[];
}

/** Result of a collision query: the corrected position and the total push applied. */
export interface MoveResult {
  x: number;
  z: number;
  /**
   * Sum of all corrections (obstacles and bounds). Zero when nothing was hit.
   * Its direction is the average contact normal, handy for a bounce (#2).
   */
  pushX: number;
  pushZ: number;
}

/**
 * Smallest half-thickness any obstacle may have: half the width of a box on
 * both axes, or the radius of a circle. Enforced by the level tests.
 *
 * Push-out sends the circle out of the nearest side, so a move that carries the
 * centre past the middle of an obstacle comes out the far side (tunnelling).
 * That cannot happen while a single step is shorter than
 * MIN_OBSTACLE_HALF_THICKNESS + radius. `moveCircle` sub-steps to stay below
 * that, so fast moves (knockback, dodge, throws) are safe at any speed.
 */
export const MIN_OBSTACLE_HALF_THICKNESS = 0.5;

/** Resolution passes per step. Enough for a circle wedged between several shapes. */
const MAX_PASSES = 4;
/** Overlaps smaller than this are float noise and ignored, so touching is stable. */
const EPSILON = 1e-9;

/**
 * Push a circle out of one box. Mutates `p`, returns true if it was moved.
 * A circle exactly touching an edge is not overlapping and is left alone.
 */
export function pushOutOfBox(p: Vec2, r: number, box: BoxShape): boolean {
  const dx = p.x - box.x;
  const dz = p.z - box.z;
  const insideX = Math.abs(dx) <= box.halfX;
  const insideZ = Math.abs(dz) <= box.halfZ;

  if (insideX && insideZ) {
    // Centre inside (or on the edge of) the box: leave by the shallowest side.
    const penX = box.halfX - Math.abs(dx);
    const penZ = box.halfZ - Math.abs(dz);
    if (penX < penZ) {
      p.x = box.x + (dx < 0 ? -1 : 1) * (box.halfX + r);
    } else {
      p.z = box.z + (dz < 0 ? -1 : 1) * (box.halfZ + r);
    }
    return true;
  }

  // Centre outside: push away from the closest point on the box.
  const cx = Math.max(-box.halfX, Math.min(box.halfX, dx));
  const cz = Math.max(-box.halfZ, Math.min(box.halfZ, dz));
  const ox = dx - cx;
  const oz = dz - cz;
  const dist = Math.hypot(ox, oz);
  if (dist >= r - EPSILON) return false;
  const k = (r - dist) / dist;
  p.x += ox * k;
  p.z += oz * k;
  return true;
}

/** Push a circle out of one round obstacle. Mutates `p`, returns true if it was moved. */
export function pushOutOfCircle(p: Vec2, r: number, c: CircleShape): boolean {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const min = r + c.r;
  const dist = Math.hypot(dx, dz);
  if (dist >= min - EPSILON) return false;
  if (dist < EPSILON) {
    // Dead centre: no normal to follow, pick +x.
    p.x = c.x + min;
    return true;
  }
  const k = (min - dist) / dist;
  p.x += dx * k;
  p.z += dz * k;
  return true;
}

/** One pass over every box. Mutates `p`, returns true if anything moved it. */
export function resolveCircleVsBoxes(p: Vec2, r: number, boxes: readonly BoxShape[], skipHoppable: SkipHoppable = false): boolean {
  let moved = false;
  for (const box of boxes) if (!(skipHoppable && box.hoppable) && pushOutOfBox(p, r, box)) moved = true;
  return moved;
}

/** One pass over every circle. Mutates `p`, returns true if anything moved it. */
export function resolveCircleVsCircles(p: Vec2, r: number, circles: readonly CircleShape[], skipHoppable: SkipHoppable = false): boolean {
  let moved = false;
  for (const c of circles) if (!(skipHoppable && c.hoppable) && pushOutOfCircle(p, r, c)) moved = true;
  return moved;
}

/** Keep a circle inside a rectangle. Mutates `p`, returns true if it was moved. */
export function clampToBounds(p: Vec2, r: number, bounds: Rect): boolean {
  const x = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, p.x));
  const z = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, p.z));
  const moved = x !== p.x || z !== p.z;
  p.x = x;
  p.z = z;
  return moved;
}

/**
 * Push a circle at (x, z) out of every obstacle and back inside the bounds.
 * Repeats the pass so a circle in an inner corner settles against both walls
 * instead of being pushed from one into the other.
 */
export function resolveCircle(world: CollisionWorld, x: number, z: number, r: number, skipHoppable: SkipHoppable = false): MoveResult {
  const p = { x, z };
  let settled = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Soft shapes first, so whatever is solid has the last word in every pass.
    const hitSoft = resolveVsCircles(p, r, world.circles, skipHoppable, true);
    const hitBoxes = resolveCircleVsBoxes(p, r, world.boxes, skipHoppable);
    const hitCircles = resolveVsCircles(p, r, world.circles, skipHoppable, false);
    const hitBounds = clampToBounds(p, r, world.bounds);
    if (!hitSoft && !hitBoxes && !hitCircles && !hitBounds) {
      settled = true;
      break;
    }
  }
  // Still wedged: a soft shape (a fallen CRS, #45) closes a gap narrower than
  // the body. Settle against the solid shapes alone; the body may overlap the
  // soft one a little, never a wall or a prop.
  if (!settled) {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const hitBoxes = resolveCircleVsBoxes(p, r, world.boxes, skipHoppable);
      const hitCircles = resolveVsCircles(p, r, world.circles, skipHoppable, false);
      const hitBounds = clampToBounds(p, r, world.bounds);
      if (!hitBoxes && !hitCircles && !hitBounds) break;
    }
  }
  return { x: p.x, z: p.z, pushX: p.x - x, pushZ: p.z - z };
}

/** One pass over the soft circles only (`soft` true) or the solid ones only. */
function resolveVsCircles(p: Vec2, r: number, circles: readonly CircleShape[], skipHoppable: SkipHoppable, soft: boolean): boolean {
  let moved = false;
  for (const c of circles) {
    if ((c.soft === true) !== soft || (skipHoppable && c.hoppable)) continue;
    if (pushOutOfCircle(p, r, c)) moved = true;
  }
  return moved;
}

/**
 * Move a circle by (dx, dz) and collide it. Walking into a wall stops at the
 * wall; walking into it at an angle slides along it, because only the part of
 * the move going into the wall is pushed back.
 *
 * Long moves are split into sub-steps shorter than the thinnest obstacle can
 * absorb, so nothing tunnels through walls whatever the speed.
 */
export function moveCircle(
  world: CollisionWorld,
  from: Vec2,
  dx: number,
  dz: number,
  r: number,
  skipHoppable: SkipHoppable = false,
): MoveResult {
  const len = Math.hypot(dx, dz);
  const maxStep = (MIN_OBSTACLE_HALF_THICKNESS + r) * 0.5;
  const steps = Math.max(1, Math.ceil(len / maxStep));
  let x = from.x;
  let z = from.z;
  for (let i = 0; i < steps; i++) {
    const res = resolveCircle(world, x + dx / steps, z + dz / steps, r, skipHoppable);
    x = res.x;
    z = res.z;
  }
  return { x, z, pushX: x - (from.x + dx), pushZ: z - (from.z + dz) };
}

/** True if a circle at (x, z) overlaps any obstacle or sticks out of the bounds. */
export function circleOverlaps(
  world: CollisionWorld,
  x: number,
  z: number,
  r: number,
  tolerance = 1e-6,
  skipHoppable: SkipHoppable = false,
): boolean {
  const b = world.bounds;
  if (x - r < b.minX - tolerance || x + r > b.maxX + tolerance) return true;
  if (z - r < b.minZ - tolerance || z + r > b.maxZ + tolerance) return true;
  const rr = r - tolerance;
  for (const box of world.boxes) {
    if (skipHoppable && box.hoppable) continue;
    const ox = Math.max(Math.abs(x - box.x) - box.halfX, 0);
    const oz = Math.max(Math.abs(z - box.z) - box.halfZ, 0);
    if (ox * ox + oz * oz < rr * rr) return true;
  }
  for (const c of world.circles) {
    if (skipHoppable && c.hoppable) continue;
    if (Math.hypot(x - c.x, z - c.z) < rr + c.r) return true;
  }
  return false;
}
