/**
 * Doorways for walkers (#84): a bot going into a shop room, or out of one,
 * lines up square in front of the doorway first, so it never cuts the corner
 * of the front frame (and the protester it drags trails through the opening
 * behind it, not into the wall). `steerTo` applies it when its context has
 * the round's rooms; the grid path does the rest.
 */
import type { Vec2 } from "../physics/index.js";
import { roomAt, type ShopRoom } from "../prop/index.js";

/** How far out on the pavement, from the facade, a bot lines up in front of a doorway. */
export const DOOR_STANDOFF = 1.25;
/**
 * A bot walking out of a room goes straight on until it is this far out of
 * the facade before turning: by then whoever it drags (a body length behind)
 * is clear of the frame too. Short of `DOOR_STANDOFF`, so a lamp post just in
 * front of a shop never keeps it from getting there.
 */
const EXIT_DEPTH = 0.8;
/** In front of a doorway, this far out at most, a bot lined up with it walks straight in. */
const ENTRY_DEPTH = DOOR_STANDOFF + 0.75;

/** How far (x, z) stands out of `room`'s facade, towards the street: negative inside the building. */
function outOf(room: ShopRoom, x: number): number {
  return -room.side * (x - room.door.x);
}

/** Whether (x, z) is in front of `room`'s doorway and lined up with it, with a body of radius `r` fitting through. */
function linedUp(room: ShopRoom, x: number, z: number, r: number, depth: number): boolean {
  const out = outOf(room, x);
  return out >= -1e-9 && out <= depth && Math.abs(z - room.door.z) <= room.door.width / 2 - r;
}

/** The room `p` is in or just walking out of (on the apron in front of its doorway), or null. */
function roomOf(rooms: readonly ShopRoom[], p: Vec2, r: number): ShopRoom | null {
  const inside = roomAt(rooms, p.x, p.z);
  if (inside && outOf(inside, p.x) < 0) return inside;
  for (const room of rooms) if (linedUp(room, p.x, p.z, r, EXIT_DEPTH)) return room;
  return inside;
}

/** The point square in front of `room`'s doorway, out on the pavement. */
export function doorFront(room: ShopRoom, out: Vec2): Vec2 {
  out.x = room.door.x - room.side * DOOR_STANDOFF;
  out.z = room.door.z;
  return out;
}

/**
 * Where a walker of radius `r` at `from` heading for `goal` should aim first
 * because of a doorway, written into `out`; false when it can head for the
 * goal itself (both in the same room, or both out in the street).
 *
 * - Inside a room (or still on its doorstep) with the goal elsewhere: out
 *   through the middle of the doorway, to the point in front of it.
 * - Out in the street with the goal in a room: to the point in front of its
 *   doorway, then straight in once lined up with it.
 */
export function doorWaypoint(rooms: readonly ShopRoom[], from: Vec2, goal: Vec2, r: number, out: Vec2): boolean {
  if (rooms.length === 0) return false;
  const target = roomAt(rooms, goal.x, goal.z);
  const here = roomOf(rooms, from, r);
  if (here !== null && here !== target) {
    // Straight out, drifting towards the middle of the doorway: the room is as wide as its
    // doorway, so that line never meets the frame, and a passer-by on the doorstep only
    // steps out a little instead of walking back to the middle.
    doorFront(here, out);
    const half = Math.max(0, here.door.width / 2 - r - 0.1);
    out.z = Math.max(here.door.z - half, Math.min(here.door.z + half, (from.z + here.door.z) / 2));
    return true;
  }
  if (target === null || here === target) return false;
  if (linedUp(target, from.x, from.z, r, ENTRY_DEPTH)) return false;
  doorFront(target, out);
  return true;
}
