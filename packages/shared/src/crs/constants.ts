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

// Shield lines (#6): a row of CRS across the street that advances slowly,
// blocks the cortège and shoves whoever leans on it. Tuned for slapstick.

/** Members in a line the room spawns. MAX_CRS still applies. */
export const LINE_SIZE = 8;

/**
 * Centre-to-centre distance between two neighbours in a line. With a CRS body
 * (0.45) the gap is 0.6, narrower than a protester (0.8), so nobody slips
 * between two members (checked by the tests).
 */
export const LINE_SPACING = 1.5;

/**
 * How far a member's shield reaches from its centre, for collision with
 * protesters. Wider than the body, so neighbouring shields nearly touch (0.3
 * apart) and even a dodge or a flying body cannot squeeze between them.
 */
export const LINE_SHIELD_RADIUS = 0.6;

/** How fast a line advances towards the cortège, m/s (protesters walk at 6). */
export const LINE_SPEED = 1.2;

/** A line advances only while a free protester is this close to its centre; otherwise it holds. */
export const LINE_ENGAGE_RANGE = 30;

/** A line advances at most this far from where it formed, then holds there. */
export const LINE_MAX_ADVANCE = 20;

/**
 * A line never advances closer than this to the start zone, so the first
 * stretch of street (bollards, the first bin, the first pavés) stays free for
 * the cortège to gather, pick up pavés and smash props.
 */
export const LINE_START_CLEARANCE = 22;

/** A member this close to its slot counts as in place. The line advances only when its members are in place. */
export const LINE_SLOT_TOLERANCE = 0.35;

/** A member out of place this long (stuck on a prop, pinned against a protester) no longer holds the line back. */
export const LINE_STRAGGLER_TIME = 2;

/** Slots are recomputed against the level this often, seconds (they glide with the line in between). */
export const LINE_SLOT_REFRESH = 0.25;

/** Rear-rank members (more members than the street has room for) stand this far behind the front rank. */
export const LINE_REAR_OFFSET = 1.6;

/** Time between two shoves of a line, seconds. */
export const LINE_SHOVE_INTERVAL = 2;

/** A protester whose edge is this close to a shield's edge (or touching it) gets shoved. */
export const LINE_SHOVE_REACH = 0.25;

/** Knockback of a shove, m/s, away from the line. Below KNOCKDOWN_THRESHOLD: it only pushes. */
export const LINE_SHOVE_IMPULSE = 7;

/** This many shoves in a row on one protester (no rest longer than 1.5 intervals) and the last one floors them. */
export const LINE_SHOVES_TO_FLOOR = 3;

/** Damage that lands on a line's members within this window (seconds) adds up towards breaking it. */
export const LINE_BREAK_WINDOW = 3;

/** HP taken off members within LINE_BREAK_WINDOW that breaks the line (a melee hit is 1, a pavé 2). */
export const LINE_BREAK_DAMAGE = 8;

/** This many members stunned or knocked down at the same time breaks the line. */
export const LINE_BREAK_DOWNED = 2;

/** This many free protesters behind the line (fewer if fewer are free) for LINE_FLANK_TIME breaks it. */
export const LINE_FLANK_COUNT = 2;

/** How long protesters must stay behind the line to break it, seconds. */
export const LINE_FLANK_TIME = 2;

/** "Behind" means past the line's centre, along its facing, by more than this... */
export const LINE_FLANK_DEPTH = 1;

/** ...and by less than this (someone far down the street does not count). */
export const LINE_FLANK_REACH = 20;
