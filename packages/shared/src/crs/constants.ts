// CRS riot police bots (#5). Per-unit stats live in one table so #13 can add
// unit types (BRAV-M, BAC...) as new rows without touching the AI. Distances in
// world units, speeds in m/s, durations in seconds of room time.

import { GRAB_DURATION } from "../health/index.js";
import { HEAVY_IMPULSE, LIGHT_IMPULSE } from "../physics/index.js";

/** What a bot is doing, synced as a uint8 (`CrsShape.status`). */
export const CrsStatus = {
  /** Chasing, hitting, grabbing, or standing around with nobody in sight. */
  Active: 0,
  /** Dazed (a pavé #8, a stun hit): stands still and lets go of any grab. */
  Stunned: 1,
  /** Holding a protester and dragging them towards the nearest van. */
  Grabbing: 2,
  /** At 0 HP: lies on the ground for a moment, then is removed from the street. */
  Out: 3,
} as const;
export type CrsStatus = (typeof CrsStatus)[keyof typeof CrsStatus];

/** Police unit type, synced as a uint8 (`CrsShape.kind`). Only CRS for now; #13 adds the others. */
export const CrsKind = {
  Crs: 0,
} as const;
export type CrsKind = (typeof CrsKind)[keyof typeof CrsKind];

/** Everything that makes one unit type play differently. Change a value here, not in the AI. */
export interface CrsStats {
  /** Collision radius (a protester is 0.4). */
  radius: number;
  /** Walking speed. Protesters walk at 6, so a protester who keeps running gets away. */
  speed: number;
  /** HP, counted in protester melee hits (MELEE_CRS_DAMAGE each). Keep <= 255 (uint8). */
  maxHp: number;
  /** Only protesters closer than this are noticed. */
  sight: number;
  /** A new target must be this much closer than the current one to switch (stops dithering). */
  switchMargin: number;
  /** How often the target is re-picked, in seconds. */
  retargetInterval: number;
  /** How often a path is recomputed while following one, in seconds. */
  repathInterval: number;
  /** Baton reach: the gap between the two bodies' edges. */
  batonRange: number;
  /** HP a baton hit takes off a protester (MAX_HP is 100). */
  batonDamage: number;
  /** Knockback of a baton hit, m/s. At KNOCKDOWN_THRESHOLD or more it floors the protester. */
  batonImpulse: number;
  /** Time between two baton hits. */
  batonCooldown: number;
  /** A grab needs the bodies' edges at most this far apart (touching). */
  grabReach: number;
  /** Time between the end of one grab and the next. */
  grabCooldown: number;
  /** Drag time from grab to arrest, unless rescued (#10). */
  grabDuration: number;
  /** Walking speed while dragging, as a fraction of `speed`. */
  dragSpeedFactor: number;
  /** How long a stun lasts. */
  stunDuration: number;
  /** Push from a protester's melee hit, m/s (below KNOCKDOWN_THRESHOLD: a shove). */
  hitImpulse: number;
  /** Every `staggerHits`-th hit in a row (no gap longer than `staggerWindow`) is heavy: it knocks the bot over. */
  staggerHits: number;
  staggerWindow: number;
  /** Push of that heavy hit, m/s (at least KNOCKDOWN_THRESHOLD). */
  heavyHitImpulse: number;
  /** How long a bot at 0 HP lies there before it is removed. */
  outDuration: number;
}

export const CRS_STATS: Readonly<Record<CrsKind, CrsStats>> = {
  // The plain CRS: slower than a protester, hits hard, grabs whoever it touches.
  [CrsKind.Crs]: {
    radius: 0.45,
    speed: 4.2,
    maxHp: 6,
    sight: 28,
    switchMargin: 3,
    retargetInterval: 0.5,
    repathInterval: 0.75,
    batonRange: 0.8,
    batonDamage: 20,
    batonImpulse: 12,
    batonCooldown: 1.2,
    grabReach: 0.25,
    grabCooldown: 3,
    grabDuration: GRAB_DURATION,
    dragSpeedFactor: 0.55,
    stunDuration: 2,
    hitImpulse: LIGHT_IMPULSE,
    staggerHits: 3,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
  },
};

/** CRS on the street when the host starts. #12 replaces this with waves that grow with progress. */
export const CRS_COUNT = 6;

/** Hard cap on bots per room, whatever spawns them (#12 waves included). Keeps the tick and the patches bounded. */
export const MAX_CRS = 24;

/** A CRS taken out is replaced after this long, at a spawn point (until #12 owns spawning). */
export const CRS_RESPAWN_DELAY = 10;

/** A (re)spawn point closer than this to a protester is skipped, so nobody gets a cop dropped on their head. */
export const CRS_SPAWN_CLEARANCE = 10;

/** HP one protester melee swing takes off a CRS. */
export const MELEE_CRS_DAMAGE = 1;

/** Bots closer than this (centre to centre, on top of their radii) push away from each other, so they don't stack. */
export const CRS_SEPARATION = 0.5;

/** No progress towards the goal for this long counts as stuck. */
export const CRS_STUCK_TIME = 1;

/** Progress needed in CRS_STUCK_TIME not to be stuck, in world units. */
export const CRS_STUCK_PROGRESS = 0.4;

/** After being stuck, ignore that target for this long and pick another. */
export const CRS_GIVE_UP_TIME = 3;

/** Plain steering straight at the target is tried only below this distance; beyond it bots follow a path. */
export const CRS_DIRECT_RANGE = 12;

/** Navigation grid cell size, in world units. */
export const NAV_CELL = 0.5;
