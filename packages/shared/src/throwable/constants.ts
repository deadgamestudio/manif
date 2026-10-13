// Throwables (#8): things a protester picks up from the ground and throws.
// One row per kind, so #15 (tomatoes, dog poo, trottinettes...) adds items as
// new rows without touching the pick-up / throw pipeline. Distances in world
// units, speeds in m/s, durations in seconds of room time.

import { HEAVY_IMPULSE } from "../physics/index.js";
// Type only: the status a hit puts on a CRS (#15) is named here, applied by crs/status.ts.
import type { CrsEffect } from "../crs/status.js";

/**
 * Item kind, synced as a uint8 on ground items, projectiles and the player's
 * `carrying` field. 0 is reserved for "nothing" (empty hands).
 */
export const ThrowableKind = {
  None: 0,
  Pave: 1,
  /** #15: from broken market stalls. Splats a visor. */
  Tomate: 2,
  /** #15: lying on the pavement. Makes a CRS stinky; on the ground, a trap anyone slips on. */
  Crotte: 3,
  /** #15: parked along the street. Heavy, bowls through a row of CRS. */
  Trottinette: 4,
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
  /**
   * CRS it hits before it stops (#15). 1: it stops on the first one, like a
   * pavé. More: it goes through the first ones (each hit once) and stops on
   * the last, so this is also the cap on how many it bowls over.
   */
  pierce: number;
  /** What it does to a CRS it hits besides the numbers above (#15): a status timer, see `CRS_EFFECTS`. */
  effect: CrsEffect | null;
  /** How long that status lasts. A second hit refreshes it, never stacks. */
  effectTime: number;
  /** Where it is once it stopped after hitting a CRS: on the ground again, or gone (a tomato splats). */
  afterCrs: ItemFate;
  /** Same when it stopped on anything else (a wall, a prop, max range). */
  afterMiss: ItemFate;
  /** The carrier walks at this fraction of the walking speed (1: no slower). Below 1 the carrier cannot hop either. */
  carrySpeed: number;
  /** Most of this kind lying on the ground at once; one more drop removes the oldest of the kind. */
  groundCap: number;
  /** Lying on the ground, it trips whoever steps on it (#15 dog poo; see `SlipGuards`). */
  slippery: boolean;
}

/** What becomes of an item once its flight stops. */
export type ItemFate = "ground" | "gone";

/** Most items lying on the ground per room. Dropping one more removes the oldest, so broken props can't fill the street. */
export const MAX_GROUND_ITEMS = 48;

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
    pierce: 1,
    effect: null,
    effectTime: 0,
    afterCrs: "ground",
    afterMiss: "ground",
    carrySpeed: 1,
    // Pavés are few (the level and broken props): only the room-wide cap.
    groundCap: MAX_GROUND_ITEMS,
    slippery: false,
  },
  // La tomate (#15): light, fast, far. No harm done, but the visor is red and the CRS sees nothing for a few seconds.
  [ThrowableKind.Tomate]: {
    radius: 0.12,
    speed: 22,
    range: 20,
    propDamage: 0,
    crsDamage: 0,
    knockback: 0,
    stun: 0,
    pierce: 1,
    effect: "splat",
    effectTime: 3.5,
    afterCrs: "gone",
    afterMiss: "gone",
    carrySpeed: 1,
    groundCap: 20,
    slippery: false,
  },
  // La crotte de chien (#15): short lob, no harm, a stink the other CRS steer clear of. Missed, it lies there as a trap.
  [ThrowableKind.Crotte]: {
    radius: 0.12,
    speed: 14,
    range: 8,
    propDamage: 0,
    crsDamage: 0,
    knockback: 0,
    stun: 0,
    pierce: 1,
    effect: "stink",
    effectTime: 5,
    afterCrs: "gone",
    afterMiss: "ground",
    carrySpeed: 1,
    groundCap: 12,
    slippery: true,
  },
  // La trottinette (#15): heavy and slow to carry, a bowling strike through a shield line, then lies there for the next throw.
  [ThrowableKind.Trottinette]: {
    radius: 0.35,
    speed: 12,
    range: 9,
    propDamage: 2,
    crsDamage: 1,
    knockback: HEAVY_IMPULSE + 2,
    stun: 1.5,
    pierce: 4,
    effect: null,
    effectTime: 0,
    afterCrs: "ground",
    afterMiss: "ground",
    carrySpeed: 0.65,
    groundCap: 6,
    slippery: false,
  },
};

/** The walking-speed factor for a protester carrying `kind` (1 for empty hands or an unknown kind). */
export function carrySpeedOf(kind: number): number {
  return (THROWABLE_TYPES as Record<number, ThrowableType | undefined>)[kind]?.carrySpeed ?? 1;
}

/** A ground item is picked up when its centre is this close to the protester's centre (a protester is 0.4 in radius). */
export const PICKUP_RANGE = 1.2;


/** Most items in flight per room. A throw over the cap is refused (the item stays in hand). */
export const MAX_PROJECTILES = 16;

/** A body slips on a slippery item (#15 dog poo) when its centre comes this close to it: a foot lands on it. */
export const SLIP_RANGE = 0.35;

/**
 * Having slipped on one, a body must get this far from it (centre to item)
 * before that one can trip it again: getting up on the same poo doesn't
 * floor you twice. Another poo still can.
 */
export const SLIP_CLEAR = 1;

/**
 * The slip: a small push along the way the body was going, always a fall (#2
 * knock-down, so the ragdoll plays). Small on purpose: the feet fly, the body
 * lands about where it was, usually still within SLIP_CLEAR of the poo.
 */
export const SLIP_IMPULSE = 3;

/** Items dropped by a broken prop land this far beyond its edge, on the street side. */
export const DROP_GAP = 0.6;
