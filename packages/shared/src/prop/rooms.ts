/**
 * Walk-in shops (#84): the room behind each shop front, and the building
 * blocks carved around those rooms. One pure function, `carveLevel`, run by
 * the server each round (physics, swings, fire, CRS) and by the client from
 * the synced shops (drawing), so both agree on every wall.
 *
 * A room is always carved, broken shop or not: while the shop is intact its
 * own hitbox (`shopFootprint`, reaching `SHOP_LAYOUT.inset` into the
 * building) seals the doorway, and once it breaks the doorway opens.
 */
import type { Rect } from "../physics/index.js";
import type { BoxObstacle, Level } from "../level/index.js";
import type { ShopLot } from "./shops.js";

export const SHOP_ROOM = {
  /** Wall left on each side of the doorway, inside the shop's width: the front frame. */
  frame: 0.5,
  /** No wall left by the carving is thinner than this (no tunnelling, #84). */
  minWall: 1,
} as const;

/** The room behind one shop front: a rectangle inside its building, open on the street side. */
export interface ShopRoom {
  /** The shop's prop id. */
  id: string;
  /** The building box it is carved out of. */
  building: string;
  side: -1 | 1;
  /** Floor of the room, world axes. Its street-side edge lies on the facade. */
  rect: Rect;
  /** Ceiling height (the storefront's height). */
  height: number;
  /** The doorway: its centre on the facade line, and its width along the street. */
  door: { x: number; z: number; width: number };
}

/** The room a shop opens into, or null when the lot leaves no room for one. */
export function shopRoom(lot: ShopLot, building: string): ShopRoom | null {
  const half = lot.width / 2 - SHOP_ROOM.frame;
  if (half <= 0 || lot.interior <= 0) return null;
  const near = lot.face;
  const far = lot.face + lot.interior;
  const rect: Rect =
    lot.side < 0
      ? { minX: -far, maxX: -near, minZ: lot.z - half, maxZ: lot.z + half }
      : { minX: near, maxX: far, minZ: lot.z - half, maxZ: lot.z + half };
  return { id: lot.id, building, side: lot.side, rect, height: lot.height, door: { x: lot.side * near, z: lot.z, width: half * 2 } };
}

/** True if (x, z) stands inside a room (its floor rectangle, edges included). */
export function roomAt(rooms: readonly ShopRoom[], x: number, z: number): ShopRoom | null {
  for (const r of rooms) if (x >= r.rect.minX && x <= r.rect.maxX && z >= r.rect.minZ && z <= r.rect.maxZ) return r;
  return null;
}

/** The level with every building box carved around this round's shop rooms. */
export interface CarvedLevel {
  /** The level, its building boxes replaced by the pieces left around the rooms. Other boxes as they were. */
  level: Level;
  rooms: readonly ShopRoom[];
}

function piece(src: BoxObstacle, n: number, minX: number, maxX: number, minZ: number, maxZ: number): BoxObstacle {
  return {
    id: `${src.id}:${n}`,
    kind: src.kind,
    height: src.height,
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    halfX: (maxX - minX) / 2,
    halfZ: (maxZ - minZ) / 2,
  };
}

/**
 * Carve each building box around the rooms of the shops built into it.
 * Along the street a block splits into slices: full-depth walls between
 * rooms (and at its ends), and behind each room a back wall from the room's
 * far end to the back of the block. Pieces of one block keep its id as a
 * prefix (`bldg-l1:0`, `bldg-l1:1`...) and come in street order. A block
 * with no shop stays whole, with its own id. Pure: rebuild it per round,
 * never per frame.
 */
export function carveLevel(level: Level, lots: readonly ShopLot[]): CarvedLevel {
  const rooms: ShopRoom[] = [];
  const boxes: BoxObstacle[] = [];
  for (const box of level.boxes) {
    if (box.kind !== "building") {
      boxes.push(box);
      continue;
    }
    const side = box.x < 0 ? -1 : 1;
    const minX = box.x - box.halfX;
    const maxX = box.x + box.halfX;
    const minZ = box.z - box.halfZ;
    const maxZ = box.z + box.halfZ;
    const inner = side < 0 ? -maxX : minX;
    const mine = lots
      .filter((l) => l.side === side && l.face === inner && l.z > minZ && l.z < maxZ)
      .map((l) => shopRoom(l, box.id))
      .filter((r): r is ShopRoom => r !== null)
      .sort((a, b) => a.rect.minZ - b.rect.minZ);
    if (mine.length === 0) {
      boxes.push(box);
      continue;
    }
    let n = 0;
    let cursor = minZ;
    for (const r of mine) {
      if (r.rect.minZ > cursor) boxes.push(piece(box, n++, minX, maxX, cursor, r.rect.minZ));
      // Behind the room: from its far end to the back of the block.
      if (side < 0) boxes.push(piece(box, n++, minX, r.rect.minX, r.rect.minZ, r.rect.maxZ));
      else boxes.push(piece(box, n++, r.rect.maxX, maxX, r.rect.minZ, r.rect.maxZ));
      cursor = r.rect.maxZ;
      rooms.push(r);
    }
    if (maxZ > cursor) boxes.push(piece(box, n++, minX, maxX, cursor, maxZ));
  }
  return { level: { ...level, boxes }, rooms };
}
