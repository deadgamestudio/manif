// The march round (#12): waiting -> marching -> ended -> (reset) -> waiting.
// Durations in seconds, progress as a fraction of the street (0 at the start,
// 1 at the Préfecture, see `progressAt`). Change the numbers here, not in the room.

/**
 * Room phase, synced as a uint8. The reset between rounds is a server-side
 * step, not a phase: `Ended` goes straight back to `Waiting` with a clean street.
 */
export const Phase = {
  /**
   * Before a round: the lobby screen. Players gather, the host starts. #14
   * puts the archetype picker here. Nobody is in the street and nothing moves.
   */
  Waiting: 0,
  /** The march: CRS active, round timer running, progress tracked. */
  Marching: 1,
  /** Results on screen over the frozen street, inputs ignored, for ROUND_END_DURATION. */
  Ended: 2,
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** How the last round ended, synced as a uint8. Kept through `Waiting` so the lobby can show it. */
export const RoundResult = {
  /** No round finished yet, or one is running. */
  None: 0,
  /** Enough protesters reached the Préfecture. */
  Won: 1,
  /** The round timer ran out. */
  LostTime: 2,
  /** Every protester was arrested at the same moment. */
  LostArrested: 3,
} as const;
export type RoundResult = (typeof RoundResult)[keyof typeof RoundResult];

/** Length of a march, in seconds (8 minutes). */
export const ROUND_DURATION = 480;

/** How long the end screen stays up before the round resets to `Waiting`. */
export const ROUND_END_DURATION = 10;

/**
 * Share of the protesters in the room who must stand free in the Préfecture
 * zone at the same time to win, rounded up (half: 1 of 1, 1 of 2, 2 of 3, 2 of 4...).
 */
export const WIN_SHARE = 0.5;

/**
 * One reinforcement wave: fires once per round, the first tick the cortège's
 * front reaches `at` (progress, 0..1). The wave at 0 is the opening force,
 * placed when the march starts.
 */
export interface RoundWave {
  at: number;
  /** Lone CRS that chase, spawned on the level's CRS points ahead of the front. */
  chasers?: number;
  /** A shield line (#6) of this many bots, on the nearest level line point far enough ahead. */
  line?: number;
}

/**
 * The reinforcement schedule. Tuned for 1 to 4 players: the opening force is
 * already tough (4 chasers a few metres ahead of the start zone, and an
 * 8-shield line that releases 8 chasers when broken; every CRS can gas), so
 * later waves are small and spaced out. MAX_CRS caps the total on the street;
 * a wave over the cap is cut short. #13 adds other unit types here.
 */
export const ROUND_WAVES: readonly RoundWave[] = [
  { at: 0, chasers: 4, line: 8 },
  { at: 0.2, chasers: 3 },
  { at: 0.4, line: 8 },
  { at: 0.55, chasers: 4 },
  { at: 0.75, chasers: 4 },
  { at: 0.88, chasers: 3 },
];

/**
 * The "everyone arrested at once" defeat needs at least this many protesters.
 * Alone, every arrest would end the round at once; a solo player only loses
 * on time (an arrest still costs the drag plus RESPAWN_DELAY of the clock).
 */
export const WIPE_MIN_PLAYERS = 2;

/** Wave chasers appear at least this far ahead of the front (progress units, 0.03 is about 5.5 m)... */
export const WAVE_CHASER_AHEAD = 0.03;

/**
 * ...and a wave's shield line at least this far ahead (about 22 m, like
 * LINE_START_CLEARANCE), so it has time to form. With no line point that far
 * ahead, the line's bots come as chasers instead.
 */
export const WAVE_LINE_AHEAD = 0.12;
