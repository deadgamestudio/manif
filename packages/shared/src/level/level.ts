/**
 * Level format and queries. A level is static data imported by both the server
 * (collision, spawns, progress) and the client (rendering). It is never synced
 * through Schema; if several maps exist one day, send a level id, not geometry.
 */
import type { BoxShape, CircleShape, CollisionWorld, Rect, Vec2 } from "../physics/index.js";
import { circleOverlaps, resolveCircle } from "../physics/index.js";

/** What a box obstacle looks like. The client picks colours and heights from it. */
export type BoxKind = "building" | "wall" | "kiosk" | "barrier" | "van" | "prefecture";

/** What a round obstacle looks like. */
export type CircleKind = "bollard" | "tree" | "lamp";

/** Breakable prop types (#4 owns their HP, shapes and state). */
export type PropKind = "bin" | "bus_shelter" | "shop_window" | "car";

export interface BoxObstacle extends BoxShape {
  id: string;
  kind: BoxKind;
  /** Visual height, for rendering only. */
  height: number;
}

export interface CircleObstacle extends CircleShape {
  id: string;
  kind: CircleKind;
  /** Visual height, for rendering only. */
  height: number;
}

/**
 * A place where a breakable prop stands. Only position and type live here;
 * HP, broken state and collision shapes are #4's, keyed by `id`.
 * Collided as `PROP_TYPES[kind]` shapes, intact or broken (see `propCollisionWorld`).
 */
export interface PropSlot {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  /** Rotation around Y, in radians. */
  rotation: number;
}

export interface Level {
  id: string;
  /** Walkable area. Players are kept inside it. */
  bounds: Rect;
  /** Where players spawn. Must be clear of obstacles (checked by tests). */
  start: Rect;
  /** The Préfecture forecourt: reaching it is the march's goal (#12). */
  destination: Rect;
  /** Progress runs from 0 at `from` to 1 at `to`, measured along the line between them. */
  progress: { from: Vec2; to: Vec2 };
  boxes: readonly BoxObstacle[];
  circles: readonly CircleObstacle[];
  propSlots: readonly PropSlot[];
  /**
   * Where CRS bots appear (#5): ahead of the cortège and in the side streets.
   * Must be clear of obstacles for a CRS and outside the start zone (checked by tests).
   * #12 picks among them for its waves.
   */
  crsSpawns: readonly Vec2[];
}

/** The static collision world of a level, without its breakable props (`propCollisionWorld` adds them). */
export function levelWorld(level: Level): CollisionWorld {
  return { bounds: level.bounds, boxes: level.boxes, circles: level.circles };
}

/**
 * How far along the march a point is: 0 at the start, 1 at the Préfecture,
 * clamped to [0, 1]. Only the component along the street counts.
 */
export function progressAt(level: Level, x: number, z: number): number {
  const { from, to } = level.progress;
  const ax = to.x - from.x;
  const az = to.z - from.z;
  const lenSq = ax * ax + az * az;
  if (lenSq === 0) return 0;
  const t = ((x - from.x) * ax + (z - from.z) * az) / lenSq;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** True if (x, z) lies inside the rectangle. */
export function inRect(rect: Rect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/**
 * Pick a spawn point in the start zone. `random` returns values in [0, 1)
 * (Math.random in the room, a seeded generator in tests). The point is pushed
 * out of any obstacle, and retried if that pushed it out of the start zone.
 */
export function spawnPoint(level: Level, radius: number, random: () => number = Math.random): Vec2 {
  const world = levelWorld(level);
  const s = level.start;
  let p: Vec2 = { x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2 };
  for (let attempt = 0; attempt < 16; attempt++) {
    const x = s.minX + radius + random() * Math.max(0, s.maxX - s.minX - 2 * radius);
    const z = s.minZ + radius + random() * Math.max(0, s.maxZ - s.minZ - 2 * radius);
    const res = resolveCircle(world, x, z, radius);
    p = { x: res.x, z: res.z };
    if (inRect(s, p.x, p.z) && !circleOverlaps(world, p.x, p.z, radius)) return p;
  }
  // The start zone is validated clear, so this is only reached with a broken level.
  const res = resolveCircle(world, p.x, p.z, radius);
  return { x: res.x, z: res.z };
}
