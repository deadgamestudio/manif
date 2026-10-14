/**
 * The street heats up (#98). A round starts calm: the police escort the
 * cortège (`escortSpot`) and only go after protesters who broke, hit or threw
 * something lately (`calmTargets`). Every offence adds to a street-wide
 * tension (`addOffence`) that slowly cools (`stepMood`); when it reaches
 * TENSION_HOT, or the cortège's front reaches HOT_PROGRESS, the street turns
 * hot, once, never back, and every unit goes back to chasing anyone.
 *
 *   calm ──tension >= TENSION_HOT, or front >= HOT_PROGRESS──> hot (until the round resets)
 *
 * Plain functions over a plain `StreetMood`: the room owns one, marks
 * offences on it and mirrors it into the synced state; the CRS brain only
 * reads `CrsContext.calm`.
 */
import type { Level } from "../level/index.js";
import type { Vec2 } from "../physics/index.js";
import {
  CRS_OFFENDER_MEMORY,
  ESCORT_AHEAD,
  ESCORT_BEHIND,
  ESCORT_LANE,
  HOT_PROGRESS,
  TENSION_DECAY,
  TENSION_GAINS,
  TENSION_HOT,
  type TensionGains,
} from "./constants.js";
import { isOffender, type ProtesterView } from "./targeting.js";

/** One of the four offences (#73) as tension counts them (a prop hit that breaks it counts as a break). */
export type Offence = keyof TensionGains;

/** The street's mood this round (#98). */
export interface StreetMood {
  /** 0..TENSION_HOT. Stays at TENSION_HOT once hot. */
  tension: number;
  /** Turned hot: never goes back within the round. */
  hot: boolean;
}

/** A new round: calm, no tension. */
export function createMood(): StreetMood {
  return { tension: 0, hot: false };
}

/** Turn the street hot now (tension full). Returns true if it was still calm. */
export function heatUp(mood: StreetMood): boolean {
  if (mood.hot) return false;
  mood.hot = true;
  mood.tension = TENSION_HOT;
  return true;
}

/**
 * An offence was committed: its gain goes on the tension, and reaching
 * TENSION_HOT turns the street hot. Returns true on that switch. Nothing
 * changes once hot.
 */
export function addOffence(mood: StreetMood, offence: Offence, gains: Readonly<TensionGains> = TENSION_GAINS): boolean {
  if (mood.hot) return false;
  mood.tension = Math.min(TENSION_HOT, mood.tension + Math.max(0, gains[offence]));
  return mood.tension >= TENSION_HOT ? heatUp(mood) : false;
}

/**
 * One tick while marching: the tension cools by TENSION_DECAY a second, and
 * the cortège's `front` (progress, 0..1) at HOT_PROGRESS or beyond turns the
 * street hot whatever the tension. Returns true on that switch.
 */
export function stepMood(mood: StreetMood, dt: number, front: number, decay = TENSION_DECAY, hotProgress = HOT_PROGRESS): boolean {
  if (mood.hot) return false;
  if (front >= hotProgress) return heatUp(mood);
  if (dt > 0) mood.tension = Math.max(0, mood.tension - decay * dt);
  return false;
}

/** The tension as synced (`StreetState.tension`): a whole number, 0..TENSION_HOT. */
export function syncedTension(mood: StreetMood): number {
  return Math.max(0, Math.min(TENSION_HOT, Math.round(mood.tension)));
}

/**
 * Whom the police may go after while calm (#98): protesters who offended in
 * the last `memory` seconds (`isOffender`), and nobody else. Jeun-Lac
 * Moluchan (#85) never offends, so he is left alone until the street is hot.
 */
export function* calmTargets(protesters: Iterable<ProtesterView>, now: number, memory = CRS_OFFENDER_MEMORY): Generator<ProtesterView> {
  for (const p of protesters) if (isOffender(p, now, memory)) yield p;
}

/** A small stable hash of a bot id, so each escort keeps its own side and spot. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Where a police bot `id` with nobody to go after walks while calm (#98):
 * beside the cortège, ESCORT_LANE off the street's middle line on its own
 * side, at its own spot between ESCORT_BEHIND behind the `front` (progress,
 * 0..1) and ESCORT_AHEAD ahead of it. Side and spot come from the id, so a
 * squad spreads along both sides and each bot keeps to its place as the
 * march moves. Written into `out`.
 */
export function escortSpot(level: Level, front: number, id: string, out: Vec2 = { x: 0, z: 0 }): Vec2 {
  const h = hashId(id);
  const side = (h & 1) === 0 ? -1 : 1;
  const share = ((h >>> 1) % 1024) / 1023;
  const t = Math.max(0, Math.min(1, front - ESCORT_BEHIND + (ESCORT_BEHIND + ESCORT_AHEAD) * share));
  const { from, to } = level.progress;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  // Sideways: the street's left-right, perpendicular to its axis (as `marchGoal` does for bot protesters).
  const sx = -(to.z - from.z) / len;
  const sz = (to.x - from.x) / len;
  out.x = from.x + (to.x - from.x) * t + sx * side * ESCORT_LANE;
  out.z = from.z + (to.z - from.z) * t + sz * side * ESCORT_LANE;
  return out;
}
