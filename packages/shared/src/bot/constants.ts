// Bot protesters (#59): one table of everything that makes a bot a bot, and
// what keeps it a notch below a real player and clearly weaker than a CRS.
// Every weakness stacks on top of the bot's archetype (#14): a factor here
// multiplies the archetype's own, it never replaces it. Times in seconds of
// room time, distances in world units, chances in [0, 1].

import { MELEE_COOLDOWN } from "../melee/index.js";
import { MELEE_CRS_DAMAGE } from "../crs/index.js";

export const BOT = {
  // How often a bot re-decides what to do. Between two thinks it keeps walking the same way.
  thinkInterval: 0.2,

  // --- Weaknesses ---
  /** Seconds between seeing something worth doing (a CRS to hit, a teammate to free...) and starting it: a random value in this range. */
  reactionMin: 0.4,
  reactionMax: 0.8,
  /** Walking speed factor, on top of the archetype's. */
  speed: 0.9,
  /** Factor on the damage a bot's swing does to a CRS (MELEE_CRS_DAMAGE). */
  meleeDamage: 0.5,
  /** Factor on the time between two swings (MELEE_COOLDOWN). */
  meleeCooldown: 2.2,
  /** Factor on the damage a bot's thrown item does to a CRS. */
  throwDamage: 0.5,
  /** Extra wobble off the aim of a bot's throw, either side, in radians, added to the archetype's `throwSpread`. */
  throwSpread: 0.35,
  /** Factor on the time a bot needs to pull a teammate free, on top of the archetype's `rescueTime`. */
  rescueTime: 1.3,
  /** Chance a bot dodges when a CRS gets right next to it, or when it is caught in tear gas. */
  dodgeChance: 0.3,
  /** Chance a bot goes to free a grabbed teammate it sees: a human, then a fellow bot. */
  rescueChanceHuman: 0.6,
  rescueChanceBot: 0.3,
  /** Chance a bot goes for a CRS that is grabbing someone, or right on a teammate. */
  fightChance: 0.5,
  /** Chance a bot goes to pick up a pavé (or a tomato) it walks past. */
  fetchChance: 0.35,
  /** Chance a bot hops over a bin or a fallen CRS in its way (else it walks round, or bumps). */
  hopChance: 0.7,
  /** A chance once rolled for one thing (that CRS, that teammate) holds this long before it is rolled again. */
  rollMemory: 3,

  // --- What the CRS think of them ---
  /** CRS target priority (#14's `targetWeight`), times the archetype's: humans are chased first. */
  targetWeight: 0.7,

  // --- Where they go ---
  /** A grabbed teammate or a busy CRS this close (centre to centre) catches a bot's eye. */
  helpRange: 7,
  /** A CRS this close to a teammate (or the bot) is "on someone" and worth a swing. */
  brawlRange: 2.5,
  /** An item on the ground this close may be picked up. */
  fetchRange: 5,
  /** A bot with something in hand throws at a CRS this close. */
  throwRange: 10,
  /** A CRS this close to the bot may make it dodge. */
  dodgeRange: 1.6,
  /** A bin or a fallen CRS whose edge is this close ahead may be hopped. */
  hopAhead: 0.9,
  /**
   * Where a bot keeps in the cortège: its own offset from the leading human, in
   * progress (the street is about 184 m long, so 0.03 is about 5 m). Some walk
   * a little ahead, some a little behind: the front-ish middle, never far ahead.
   */
  leadMin: -0.04,
  leadMax: 0.03,
  /** How far either side of the street's middle line a bot's own lane is. */
  laneSpread: 3,
  /** Jeun-Lac Moluchan (#85) this close (centre to centre) draws a bot's spot in the cortège towards him... */
  moluchanRange: 16,
  /** ...this share of the way (0: not at all, 1: right onto him). */
  moluchanPull: 0.4,
  /** Close enough to its spot in the cortège: it stands and waits. */
  arriveRadius: 1.5,
  /** Its path is searched again this often while it walks. */
  repathInterval: 1,
} as const;

/** A bot's swing damage on a CRS. */
export const BOT_MELEE_CRS_DAMAGE = MELEE_CRS_DAMAGE * BOT.meleeDamage;
/** Time between two of a bot's swings. */
export const BOT_MELEE_COOLDOWN = MELEE_COOLDOWN * BOT.meleeCooldown;
