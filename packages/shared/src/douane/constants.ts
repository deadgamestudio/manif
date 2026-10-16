// La Douane (#120): a rare cameo, a cartoon kid with an oversized water gun
// who soaks whoever is closest, protester or CRS, no side. Every number of
// the event is here. Times in seconds of room time, distances in world units,
// progress as a fraction of the street (see `progressAt`), chances in [0, 1].
//
// A meme about a real kid: a cartoon only, no name but "La Douane", no
// likeness, no jokes about his body. The joke is the soaking.

import type { WaterJetStats } from "../water/index.js";

/** His key in `state.douane`. Never a player id: he is not in `state.players`, and nobody targets him. */
export const DOUANE_ID = "douane";

export const DOUANE = {
  // --- When ---
  /** Chance he shows up in a round, rolled once at the start of the march (on its own, Moluchan has his). */
  chance: 0.2,
  /** He arrives the first time the cortège's front passes a point rolled in this range... */
  earliest: 0.15,
  /** ...and never past this one. */
  latest: 0.8,
  /** How long he stays, from his arrival to his walk home. */
  duration: 35,

  // --- How he walks ---
  /** Body radius (a kid), for collisions with the street. Nobody collides with him. */
  radius: 0.3,
  /** Walking speed, under a protester's (PLAYER_SPEED is 6): the cortège can outrun him. */
  speed: 4.4,
  /** He stops this far from whoever he is soaking (well inside the jet's reach). */
  standOff: 2.4,
  /** How often he re-picks who to soak (and re-plans his walk). */
  regoalInterval: 0.8,
  /** A new target only if it is this much closer than the current one, so he doesn't flick between two. */
  switchMargin: 1,
  /** Leaving takes at most this long (he walks to a side street, then is gone even if he got stuck). */
  leaveTimeout: 12,
  /** A side street this far behind the front at most (in progress) may be his way in. */
  entryBehindMax: 0.2,
  /** He keeps at least this far behind the cortège's front when choosing his way in. */
  behindFront: 0.02,

  // --- The water gun ---
  /** He fires when his target is this close (and in sight): a bit under the jet's range. */
  sprayFrom: 3.2,
  /** A burst lasts this long... */
  burst: 1.6,
  /** ...then he pauses at least this long (pumping, shouting) before the next. */
  pause: 2.4,
  /** A new line on his speech bubble no more often than this (a new one comes with a burst). */
  lineInterval: 3.5,
} as const;

/**
 * His water gun: a small jet, smaller than a pompier's hose (range 5,
 * knockback 7). The knockback stays well under KNOCKDOWN_THRESHOLD (10): it
 * pushes, it never floors. No HP damage anywhere.
 */
export const DOUANE_JET: WaterJetStats = {
  range: 3.6,
  halfAngle: 0.2,
  knockback: 4.5,
  pushInterval: 0.6,
  soakRate: 1,
};

/** What his speech bubble says, by moment of the event. */
export type DouaneLineKind = "arrive" | "spray" | "leave";

/**
 * His lines, all made up. Synced as an index into this list (`DouaneShape.line`),
 * so the order matters: add new lines at the end.
 */
export const DOUANE_LINES: readonly { kind: DouaneLineKind; text: string }[] = [
  { kind: "arrive", text: "La douane !" },
  { kind: "arrive", text: "Contrôle douanier, personne ne bouge !" },
  { kind: "spray", text: "Vous avez quelque chose à déclarer ?" },
  { kind: "spray", text: "Contrôle douanier !" },
  { kind: "spray", text: "La douane ! La douane !" },
  { kind: "spray", text: "Rien à déclarer ? Pschhh !" },
  { kind: "spray", text: "Ouvrez la valise !" },
  { kind: "spray", text: "On passe pas sans être contrôlé !" },
  { kind: "spray", text: "Fouille complète !" },
  { kind: "leave", text: "Fin du contrôle !" },
  { kind: "leave", text: "La douane rentre goûter !" },
];

/** What the event is doing, synced as a uint8 (`DouaneShape.phase`). */
export const DouanePhase = {
  /** On the street, soaking whoever is closest. */
  Soaking: 0,
  /** Time's up: walking off to a side street. No more water. */
  Leaving: 1,
} as const;
export type DouanePhase = (typeof DouanePhase)[keyof typeof DouanePhase];

/** How many skin tones the kid may get (`DouaneShape.skin`, an index the client maps to its skin list). */
export const DOUANE_SKINS = 10;
