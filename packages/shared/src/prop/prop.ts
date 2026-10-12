/**
 * Breakable props (#4): HP, breaking, and the collision shape of a prop in its
 * current state. Pure functions over plain data; the server applies them and
 * syncs only `hp` and `broken`. Position, type and size come from the level.
 */
import type { BoxShape, CircleShape, CollisionWorld } from "../physics/index.js";
import { levelWorld, type Level, type PropSlot } from "../level/index.js";
import { PROP_TYPES, type PropShapeDef } from "./constants.js";

/** The synced runtime state of one prop. */
export interface PropState {
  hp: number;
  broken: boolean;
}

/** A world-space collision shape, ready for the collision functions. */
export type PropShape = ({ type: "box" } & BoxShape) | ({ type: "circle" } & CircleShape);

/** A fresh, intact prop of this slot's type. */
export function createPropState(slot: PropSlot): PropState {
  return { hp: PROP_TYPES[slot.kind].maxHp, broken: false };
}

/**
 * Take `amount` HP off. Returns the next state and whether this hit broke it.
 * A broken prop, or a non-positive / invalid amount, changes nothing.
 */
export function applyPropDamage(prop: PropState, amount: number): { state: PropState; broke: boolean } {
  if (prop.broken || !Number.isFinite(amount) || amount <= 0) return { state: prop, broke: false };
  const hp = Math.max(0, Math.round(prop.hp - amount));
  return { state: { hp, broken: hp === 0 }, broke: hp === 0 };
}

/**
 * World-space shape of a prop, intact or broken; null when it is walkable.
 * Collision boxes are axis-aligned, so rotation is rounded to a quarter turn
 * (a quarter turn swaps the half extents).
 */
export function propShape(slot: PropSlot, broken: boolean): PropShape | null {
  const type = PROP_TYPES[slot.kind];
  const def: PropShapeDef | null = broken ? type.broken : type.intact;
  if (!def) return null;
  if (def.type === "circle") return { type: "circle", x: slot.x, z: slot.z, r: def.r };
  const quarter = Math.abs(Math.sin(slot.rotation)) > Math.SQRT1_2;
  return {
    type: "box",
    x: slot.x,
    z: slot.z,
    halfX: quarter ? def.halfZ : def.halfX,
    halfZ: quarter ? def.halfX : def.halfZ,
  };
}

/**
 * The level's static obstacles plus every prop in its current state. Rebuild
 * it whenever a prop changes (the server does on each break), so a broken
 * shop window really becomes walkable.
 */
export function propCollisionWorld(level: Level, isBroken: (id: string) => boolean): CollisionWorld {
  const base = levelWorld(level);
  const boxes: BoxShape[] = [...base.boxes];
  const circles: CircleShape[] = [...base.circles];
  for (const slot of level.propSlots) {
    const shape = propShape(slot, isBroken(slot.id));
    if (shape?.type === "box") boxes.push(shape);
    else if (shape?.type === "circle") circles.push(shape);
  }
  return { bounds: base.bounds, boxes, circles };
}
