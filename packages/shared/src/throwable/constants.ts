// Throwables (#8): things a protester picks up from the ground and throws.
// One row per kind, so #15 (tomatoes, dog poo, trottinettes...) adds items as
// new rows without touching the pick-up / throw pipeline. Distances in world
// units, speeds in m/s, durations in seconds of room time.

import { HEAVY_IMPULSE } from "../physics/index.js";

/**
 * Item kind, synced as a uint8 on ground items, projectiles and the player's
 * `carrying` field. 0 is reserved for "nothing" (empty hands).
 */
export const ThrowableKind = {
  None: 0,
  Pave: 1,
} as const;
export type ThrowableKind = (typeof ThrowableKind)[keyof typeof ThrowableKind];
/** A kind that is an actual item (not `None`). */
export type ItemKind = Exclude<ThrowableKind, typeof ThrowableKind.None>;

/** Everything that makes one throwable play differently. Change a value here, not in the pipeline. */
export interface ThrowableType {
  /** Collision radius in flight. Walls, props and CRS are tested against a swept circle this big. */
  radius: number;
  /** Flight speed. */
  speed: number;
  /** Max flight distance; past it the item falls and lies on the ground again. */
  range: number;
  /** HP taken off a prop it hits (props count HP in swings, #4). */
  propDamage: number;
  /** HP taken off a CRS it hits (a CRS has 6, a swing takes 1). */
  crsDamage: number;
  /** Knockback on a CRS, along the throw, m/s. At KNOCKDOWN_THRESHOLD (10) or more it floors the bot. */
  knockback: number;
  /** How long a CRS it hits stays stunned (it lets go of any grab). 0: no stun. */
  stun: number;
}

export const THROWABLE_TYPES: Readonly<Record<ItemKind, ThrowableType>> = {
  // The pavé: heavy, a cartoon bonk that floors a CRS and makes it drop whoever it holds.
  [ThrowableKind.Pave]: {
    radius: 0.15,
    speed: 18,
    range: 14,
    propDamage: 1,
    crsDamage: 2,
    knockback: HEAVY_IMPULSE,
    stun: 1.5,
  },
};

/** A ground item is picked up when its centre is this close to the protester's centre (a protester is 0.4 in radius). */
export const PICKUP_RANGE = 1.2;

/** Most items lying on the ground per room. Dropping one more removes the oldest, so broken props can't fill the street. */
export const MAX_GROUND_ITEMS = 40;

/** Most items in flight per room. A throw over the cap is refused (the item stays in hand). */
export const MAX_PROJECTILES = 16;

/** Pavés dropped by a broken prop land this far beyond its edge, on the street side. */
export const DROP_GAP = 0.6;
