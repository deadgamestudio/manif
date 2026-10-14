// Police bots (#5, #13). Per-unit stats live in one table (`CRS_STATS`): the
// CRS, the BAC in plain clothes and the BRAV-M on their motorbikes are rows of
// it, and their type-specific numbers (disguise, bike) sit in the same row.
// Distances in world units, speeds in m/s, durations in seconds of room time.

import { GRAB_DURATION } from "../health/index.js";
import { HEAVY_IMPULSE, LIGHT_IMPULSE } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import type { WaterJetStats } from "../water/index.js";

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

/** Police unit type (#13), synced as a uint8 (`CrsShape.kind`). */
export const CrsKind = {
  /** Shield, baton, shield lines (#6). Slow and sturdy. */
  Crs: 0,
  /** Plain clothes: walks in the cortège looking like a protester, then reveals itself and grabs someone. */
  Bac: 1,
  /** Motorbike duos: charge in, the passenger hops off to hit or grab, then they ride off. */
  BravM: 2,
  /**
   * Not police (#17): a pompier off a fire truck, who puts out fires with a
   * hose and is on nobody's side. Never hits, grabs or arrests; protesters
   * can knock one over but never hurt it; CRS never grab it.
   */
  Pompier: 3,
  /**
   * A CRS with a (cartoon) LBD launcher instead of a shield (#73): keeps its
   * distance, aims at a protester who just broke, hit or threw something, and
   * fires a big rubber ball that knocks them on their bum. Never grabs.
   */
  Lbd: 4,
} as const;
export type CrsKind = (typeof CrsKind)[keyof typeof CrsKind];

/**
 * What a BRAV-M bot is riding (#13), synced as a uint8 (`CrsShape.mount`).
 * Every other unit is always `Foot`. While riding, one bot is the whole bike
 * (one entity per duo, for the cap and the bandwidth).
 */
export const CrsMount = {
  /** On foot: a normal bot. */
  Foot: 0,
  /** The bike with the driver and the passenger. */
  Duo: 1,
  /** The bike with only the driver: the passenger got off (or stayed behind). */
  Solo: 2,
  /** The empty bike skidding away after a crash or left behind: no rider, status `Out`, removed after a moment. */
  Wreck: 3,
} as const;
export type CrsMount = (typeof CrsMount)[keyof typeof CrsMount];

/** The BAC's disguise (#13): how long it blends in and when it gives itself away. */
export interface DisguiseStats {
  /** Blends in for a random time in [blendMin, blendMax] after it appears, keeping near a protester... */
  blendMin: number;
  blendMax: number;
  /** ...about this far from them (edge to edge), so it looks like part of the crowd without bumping into anyone. */
  followGap: number;
  /** Then it sidles up to the nearest free protester and reveals itself once its edge is this close. At most `grabReach`, so it grabs on the same tick. */
  revealRange: number;
  /** Sidling up for longer than this without getting close: it gives up the act and reveals itself anyway. */
  stalkMax: number;
}

/** The BRAV-M motorbike (#13). The riders on foot use the rest of the row. */
export interface BikeStats {
  /** Collision radius of the bike while ridden (one circle for the whole bike). */
  radius: number;
  /** Riding speed. Protesters walk at 6. */
  speed: number;
  /** HP of the bike while ridden. At 0 the riders fall off (they keep their own HP on foot). */
  hp: number;
  /** Protesters closer than this are charged. */
  sight: number;
  /** The bike brakes and the passenger hops off once the target's edge is this close. */
  dropRange: number;
  /** The passenger has this long to land a hit or a grab, then walks back to the bike. */
  dropTime: number;
  /** The bike waits this long past `dropTime` for the passenger, then leaves without them. */
  returnTimeout: number;
  /** The passenger gets back on within this distance of the bike (edge to edge). */
  remountReach: number;
  /** No real progress for this long while riding: the duo gets off and goes on on foot. */
  blockedTime: number;
  /** Progress needed in `blockedTime`, world units. */
  blockedProgress: number;
  /** A protester the bike runs into is knocked over with this knockback (m/s, a heavy one), no damage and no grab. */
  ramImpulse: number;
  /** After a ram, the next one waits this long (the bike stops at the contact in between). */
  ramCooldown: number;
  /** Leaving: gone once this close to its exit point... */
  exitReach: number;
  /** ...or after this long on the way out, wherever it is. */
  leaveTimeout: number;
  /** A crashed or abandoned bike lies there this long, then is removed. */
  wreckTime: number;
  /** Speed of the empty bike skidding away when the riders are knocked off, m/s. */
  wreckSkid: number;
}

/** A pompier's hose (#17): a small water jet, and how it picks what to spray. */
export interface HoseStats extends WaterJetStats {
  /** A pompier walking to its fire stops and sprays once the fire's edge is this close (under `range`) and in sight. */
  sprayFrom: number;
  /**
   * The "accidental" spray on a CRS: the chance, per second of spraying a
   * fire, that the pompier swings the hose over a CRS standing near that
   * fire for a moment. 0 turns it off. Keep it low: a joke, not a weapon.
   */
  accidentalSprayChance: number;
  /** Only a CRS this close to the fire being sprayed (centre to the fire's edge) can be hosed "by accident"... */
  accidentalRange: number;
  /** ...and the hose stays on it this long, then goes back to the fire. */
  accidentalTime: number;
}

/** The fire brigade (#17): when trucks come, how many, and when they go. */
export interface BrigadeStats {
  /** A truck sets off this long after a prop starts burning (if something still burns then). */
  arriveDelay: number;
  /** Pompiers getting off each truck. They count towards MAX_CRS. */
  crew: number;
  /** Most fire trucks on the street at once. */
  maxTrucks: number;
  /** Fires burning without a break for this long call one more truck (up to `maxTrucks`), at most once per this long. */
  extraTruckAfter: number;
  /** The truck's speed driving in and out of its side street. */
  driveSpeed: number;
  /** A pompier down (knocked over) for longer than this in total since it last worked gives up its fire for someone else. */
  downTooLong: number;
  /** No progress towards its fire for this long: the pompier gives up on that fire for `giveUpTime`. */
  stuckTime: number;
  giveUpTime: number;
  /** A pompier walking back to its truck gets on once this close to the door. */
  boardReach: number;
  /** A pompier who has not made it back to the truck this long after the last fire went out gets on anyway. */
  boardTimeout: number;
}

/**
 * The LBD (#73): a chunky toy-like launcher firing a big rubber ball. All its
 * numbers; the unit's body, walk and (weak) baton are the rest of the row.
 */
export interface LbdStats {
  /** It keeps the nearest free protester between `standoffMin` and `standoffMax` away (centre to centre)... */
  standoffMin: number;
  standoffMax: number;
  /** ...and only aims at a protester at most this far (centre to centre), in a clear line. */
  range: number;
  /** The aim: a red laser on the target's feet for this long, then it fires. */
  aimTime: number;
  /** Between two shots (counted from the shot): it re-aims each time. */
  cooldown: number;
  /** After an aim that was foiled (a dodge, cover, a hit, the target out of range), it waits this long before the next. */
  reaimDelay: number;
  /** The first shot of a fresh unit waits this long, so a new wave does not fire on arrival. */
  firstShotDelay: number;
  /** The ball: speed (m/s), radius and how far it flies before it drops. */
  ballSpeed: number;
  ballRadius: number;
  ballRange: number;
  /** A hit: HP off the protester, and a knockback along the shot (at KNOCKDOWN_THRESHOLD or more it floors). */
  damage: number;
  impulse: number;
  /**
   * After a hit, the protester cannot be grabbed for this long (#73, decision
   * 2): a sniper plus a grabber is not an instant arrest. Longer than the
   * knockdown (DOWN_DURATION), so they are back on their feet first.
   */
  grabImmunity: number;
  /** Splatted (#15): a tomato on the visor, the shot goes off by this angle (radians, either side) and misses. */
  splatMiss: number;
}

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
  /**
   * The drag's fallback (#70): the protester is arrested on arrival at the van,
   * or after this long if the van is never reached (path blocked, bot stuck).
   */
  grabDuration: number;
  /**
   * The grab's wind-up (#70): the bot stands, arms out, for this long before it
   * grabs, and a dodge, a hop, a hit or stepping out of reach cancels it.
   */
  grabWindup: number;
  /**
   * Grabs anyone it touches, whatever their HP (#70: the BAC, whose surprise is
   * the point). Absent: only a weakened protester (down, or at or below
   * GRAB_HP_THRESHOLD HP) is grabbed; the others get the baton.
   */
  grabAnyHp?: boolean;
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
  /** Time between two tear gas canisters (#7) thrown by one bot. 0: this unit never throws gas. */
  gasCooldown: number;
  /** Plain-clothes units (BAC, #13): the disguise. Absent: always in uniform. */
  disguise?: DisguiseStats;
  /** Motorbike units (BRAV-M, #13): the bike they arrive on. Absent: on foot. */
  bike?: BikeStats;
  /** Immune to dog poo stink (#15) while riding: the wind of the ride blows it away. */
  stinkProofRiding?: boolean;
  /**
   * Cannot be hurt (#17, the pompiers): any hit knocks it over with the usual
   * fall, but takes no HP, never stuns it and never takes it out. Fireproof
   * too, and thrown items leave no status on it.
   */
  invulnerable?: boolean;
  /** Units with a hose (#17, pompiers). Absent: no water. */
  hose?: HoseStats;
  /** The trucks a pompier crew comes in (#17). */
  brigade?: BrigadeStats;
  /** Units with an LBD (#73). Absent: no launcher. */
  lbd?: LbdStats;
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
    grabWindup: 0.5,
    dragSpeedFactor: 0.55,
    stunDuration: 2,
    hitImpulse: LIGHT_IMPULSE,
    staggerHits: 3,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
    gasCooldown: 12,
  },
  // The BAC (#13): a protester's size and walk, so the disguise holds (PLAYER_RADIUS, PLAYER_SPEED).
  // Once revealed: no shield, two hits and it is out, grabs first, barely hits.
  [CrsKind.Bac]: {
    radius: PLAYER_RADIUS,
    speed: 6,
    maxHp: 2,
    sight: 20,
    switchMargin: 3,
    retargetInterval: 0.5,
    repathInterval: 0.75,
    batonRange: 0.6,
    batonDamage: 10,
    batonImpulse: 6,
    batonCooldown: 1.5,
    grabReach: 0.3,
    grabCooldown: 4,
    grabDuration: GRAB_DURATION,
    // Its surprise is the point (#70): a shorter wind-up, and any HP will do.
    grabWindup: 0.3,
    grabAnyHp: true,
    dragSpeedFactor: 0.55,
    stunDuration: 2.5,
    hitImpulse: LIGHT_IMPULSE,
    staggerHits: 2,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
    gasCooldown: 0,
    disguise: {
      blendMin: 8,
      blendMax: 20,
      followGap: 1.6,
      revealRange: 0.3,
      stalkMax: 15,
    },
  },
  // The BRAV-M (#13): the row is for a rider on foot (after the drop, or knocked off);
  // `bike` is the ride. On foot they hit hard (a baton hit floors) and go home soon.
  [CrsKind.BravM]: {
    radius: 0.45,
    speed: 4.8,
    maxHp: 3,
    sight: 24,
    switchMargin: 3,
    retargetInterval: 0.5,
    repathInterval: 0.75,
    batonRange: 0.8,
    batonDamage: 20,
    batonImpulse: 11,
    batonCooldown: 1.4,
    grabReach: 0.25,
    grabCooldown: 3,
    grabDuration: GRAB_DURATION,
    grabWindup: 0.5,
    dragSpeedFactor: 0.55,
    stunDuration: 2,
    hitImpulse: LIGHT_IMPULSE,
    staggerHits: 3,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
    gasCooldown: 0,
    stinkProofRiding: true,
    bike: {
      radius: 0.6,
      speed: 11,
      hp: 4,
      sight: 45,
      dropRange: 2.5,
      dropTime: 5,
      returnTimeout: 6,
      remountReach: 0.5,
      blockedTime: 1.2,
      blockedProgress: 0.5,
      ramImpulse: HEAVY_IMPULSE,
      ramCooldown: 0.8,
      exitReach: 1.5,
      leaveTimeout: 15,
      wreckTime: 4,
      wreckSkid: 9,
    },
  },
  // The pompier (#17): no baton, no grab, no gas (all zero; its behaviour never uses them).
  // Busy, cheerful, on nobody's side, and a hose that likes to drift towards the CRS.
  [CrsKind.Pompier]: {
    radius: 0.45,
    speed: 5,
    maxHp: 1,
    sight: 0,
    switchMargin: 0,
    retargetInterval: 0.5,
    repathInterval: 0.75,
    batonRange: 0,
    batonDamage: 0,
    batonImpulse: 0,
    batonCooldown: 1,
    grabReach: -1,
    grabCooldown: 1,
    grabDuration: GRAB_DURATION,
    grabWindup: 0,
    dragSpeedFactor: 1,
    stunDuration: 0,
    hitImpulse: HEAVY_IMPULSE,
    staggerHits: 1,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
    gasCooldown: 0,
    invulnerable: true,
    hose: {
      range: 5,
      halfAngle: 0.3,
      knockback: 7,
      pushInterval: 0.5,
      soakRate: 1,
      sprayFrom: 3.5,
      accidentalSprayChance: 0.08,
      accidentalRange: 5,
      accidentalTime: 1.2,
    },
    brigade: {
      arriveDelay: 10,
      crew: 2,
      maxTrucks: 2,
      extraTruckAfter: 45,
      driveSpeed: 10,
      downTooLong: 4,
      stuckTime: 3,
      giveUpTime: 6,
      boardReach: 0.8,
      boardTimeout: 20,
    },
  },
  // The CRS LBD (#73): no shield, few HP and a slow, soft baton, so rushing it works.
  // Never grabs (grabReach -1): it shoots, others arrest. Every number of the launcher is in `lbd`.
  [CrsKind.Lbd]: {
    radius: 0.45,
    speed: 4,
    maxHp: 3,
    sight: 24,
    switchMargin: 3,
    retargetInterval: 0.4,
    repathInterval: 0.75,
    batonRange: 0.8,
    batonDamage: 8,
    batonImpulse: LIGHT_IMPULSE,
    batonCooldown: 2.2,
    grabReach: -1,
    grabCooldown: 1,
    grabDuration: GRAB_DURATION,
    grabWindup: 0,
    dragSpeedFactor: 1,
    stunDuration: 2.5,
    hitImpulse: LIGHT_IMPULSE,
    staggerHits: 2,
    staggerWindow: 1.5,
    heavyHitImpulse: HEAVY_IMPULSE,
    outDuration: 3,
    gasCooldown: 0,
    lbd: {
      standoffMin: 10,
      standoffMax: 16,
      range: 18,
      aimTime: 0.8,
      cooldown: 7,
      reaimDelay: 1.5,
      firstShotDelay: 2,
      ballSpeed: 30,
      ballRadius: 0.18,
      ballRange: 22,
      damage: 10,
      impulse: HEAVY_IMPULSE,
      grabImmunity: 2.2,
      splatMiss: 0.45,
    },
  },
};

/**
 * At most this many CRS LBD on the street at once (#73), within MAX_CRS. A
 * wave that would bring more brings fewer.
 */
export const MAX_LBD = 2;

/**
 * How long a protester stays a target for the LBD after breaking, hitting or
 * throwing something (#73, decision 1): a prop hit, a CRS hit, an item or a
 * teammate thrown. Someone who did none of that in this long is left alone.
 */
export const OFFENDER_MEMORY = 8;

/** Whether bots of `kind` are police (#17: a pompier is not): they chase, hit, grab, count as CRS taken out. */
export function isPolice(kind: CrsKind): boolean {
  return kind !== CrsKind.Pompier;
}

/** Collision radius of a bot of `kind` riding `mount` (the bike's while ridden or wrecked). */
export function crsRadius(kind: CrsKind, mount: CrsMount = CrsMount.Foot): number {
  const s = CRS_STATS[kind];
  return mount !== CrsMount.Foot && s.bike ? s.bike.radius : s.radius;
}

/** Full HP of a bot of `kind` riding `mount` (the bike's while ridden), for HP bars. */
export function crsMaxHp(kind: CrsKind, mount: CrsMount = CrsMount.Foot): number {
  const s = CRS_STATS[kind];
  return (mount === CrsMount.Duo || mount === CrsMount.Solo) && s.bike ? s.bike.hp : s.maxHp;
}

/**
 * Hard cap on bots per room, whatever spawns them (#12 waves included), all
 * unit types together (#13): a riding duo is one, a dropped passenger or a
 * wrecked bike one more. Keeps the tick and the patches bounded.
 */
export const MAX_CRS = 24;

/**
 * A grab needs a weakened protester (#70): down, or at or below this many HP
 * (MAX_HP is 100; a tougher archetype has to lose more first). Units with
 * `grabAnyHp` (the BAC) skip it. Above it, the bot uses its baton.
 */
export const GRAB_HP_THRESHOLD = 40;

/**
 * During a grab's wind-up (#70), the protester counts as out of reach once the
 * gap between the two bodies is more than `grabReach` plus this (bodies jostle
 * a little while standing in contact).
 */
export const GRAB_WINDUP_SLACK = 0.35;

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
