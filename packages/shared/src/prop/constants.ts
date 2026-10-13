// Breakable prop tunables (#4). Shapes are in world units, local to the prop
// before its rotation (Z runs along the street). HP is synced as a uint8.

import type { PropKind } from "../level/index.js";

/** A collision shape local to a prop: a box (half extents) or a circle (radius). */
export type PropShapeDef = { type: "box"; halfX: number; halfZ: number } | { type: "circle"; r: number };

export interface PropType {
  /** Hits to break it, at MELEE_PROP_DAMAGE per hit. Keep <= 255 (uint8). */
  maxHp: number;
  /** Collision while intact. */
  intact: PropShapeDef;
  /** Collision once broken; null means walkable. Must fit inside `intact`, so breaking never traps anyone. */
  broken: PropShapeDef | null;
  /** Pavés dropped when it breaks (#8 owns the pickup; see `StreetRoom.dropPaves`). */
  paves: number;
  /** Can be set on fire (#16): bins and cars burn, glass and bus shelters do not. */
  flammable: boolean;
  /**
   * A hop (#45) clears it while it stands: a body in the air passes over its
   * shape. Bots never hop, so they still walk round it. Low props only.
   */
  hoppable: boolean;
}

export const PROP_TYPES: Readonly<Record<PropKind, PropType>> = {
  // A wheelie bin: two whacks and the lid flies. Nothing left to stand behind. Low enough to hop over (#45).
  bin: { maxHp: 2, intact: { type: "circle", r: 0.5 }, broken: null, paves: 0, flammable: true, hoppable: true },
  // The glass shatters; the frame and bench stay.
  bus_shelter: {
    maxHp: 4,
    intact: { type: "box", halfX: 0.6, halfZ: 1.6 },
    broken: { type: "box", halfX: 0.6, halfZ: 1.6 },
    paves: 2,
    flammable: false,
    hoppable: false,
  },
  // A shop front: once smashed you can step into the gap.
  shop_window: { maxHp: 3, intact: { type: "box", halfX: 0.5, halfZ: 1.5 }, broken: null, paves: 1, flammable: false, hoppable: false },
  // A burnt-out car is still a car.
  car: {
    maxHp: 6,
    intact: { type: "box", halfX: 1, halfZ: 2.1 },
    broken: { type: "box", halfX: 1, halfZ: 2.1 },
    paves: 1,
    flammable: true,
    hoppable: false,
  },
};
