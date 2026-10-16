// Scoring (#41): what each action is worth in a round, and the caps that keep
// a round from being farmed. Points are only ever counted on the server, from
// events it resolved itself. Tune the numbers here.
import type { RoundPlayerStats } from "../round/index.js";

/** Points per unit of a counted stat, and how many units per round score at most. */
export interface ActionPoints {
  points: number;
  /** Units past this many in one round score nothing (anti-farming). */
  cap: number;
}

/**
 * The points table, keyed by the end-of-round stat that counts the action
 * (`RoundPlayerStats`). A stat missing here scores nothing: knockdowns,
 * slips, hosed and teammates thrown are jokes, not achievements.
 *
 * Balance across archetypes (#14): props are cheap and capped, since the black
 * bloc breaks them twice as fast; rescues are capped, since the étudiant·e
 * pulls faster (and two friends could stage grab-and-rescue loops); the CGT's
 * heal aura scores per HP given back, so the slow healer has its own way to
 * score. Taking a CRS out is the big earner, open to everyone.
 */
export const ACTION_POINTS: Readonly<Partial<Record<keyof RoundPlayerStats, ActionPoints>>> = {
  /** Pull a grabbed teammate free (#10). */
  rescues: { points: 50, cap: 6 },
  /** Take a CRS out (#5), by swing or by throw. */
  crsOut: { points: 60, cap: 10 },
  /** Break a prop (#4). */
  propsBroken: { points: 10, cap: 15 },
  /** Splat a CRS with a tomato or a dog poo (#15). */
  splats: { points: 15, cap: 10 },
  /** Set a prop on fire by hand (#16). */
  firesLit: { points: 10, cap: 5 },
  /** One point per HP the CGT's aura gives back to teammates (#14). */
  hpHealed: { points: 1, cap: 150 },
  /** Help unmask Alexandre Bénanas (#123): every protester who landed a hit on his helmet. He comes once a round at most. */
  benanasUnmasked: { points: 80, cap: 1 },
  /** Help chase Le Z off (#133): every protester who landed a hit on him. He comes once a round at most. */
  lezChasedOff: { points: 80, cap: 1 },
  /** Getting arrested costs points, every time; the round score never goes below 0. */
  arrests: { points: -20, cap: Number.POSITIVE_INFINITY },
};

/** Everyone still in the room when the round is won. */
export const WIN_BONUS = 50;

/** On top of the win: standing free in the Préfecture zone when the round is won. */
export const ARRIVED_BONUS = 100;

/** The round score is synced as a uint16. */
export const SCORE_MAX = 65535;

/** How many players the lasting leaderboard lists. */
export const LEADERBOARD_SIZE = 20;
