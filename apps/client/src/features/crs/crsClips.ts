/*
 * Which of Jordan's clips a police bot plays (#28), as plain functions of
 * its synced state, so the choice is testable without three.js. The model
 * components (policeModels.tsx) call these every frame and hand the answer
 * to their Animator.
 *
 * Clip sources: the CRS file (guard-idle, formation-walk, shield-raise,
 * shield-shove, baton-swing), the splatted CRS (visor-wipe), the grenadier
 * (canister-throw), the pompier (hose-*), the protester libraries (walk,
 * panic-run, knockdown, get-up, ko-collapse, on-fire-run, melee-swing,
 * tomato-stumble), the collar grab (seize, hold-loop). One rig, so any clip
 * drives any of these bodies. Two clips are cut out of others here:
 * `windup` (the first frames of seize) and `shield-lowered` (the first frame
 * of shield-raise).
 */

/** How a body moves: a CRS with its shield, an LBD or BRAV-M on foot (no shield), the pompier, a revealed BAC (a protester's moves). */
export type PoliceRole = "crs" | "noShield" | "pompier" | "bac";

/** What the loop choice reads, from the synced state and the measured movement. */
export interface LoopInput {
  role: PoliceRole;
  /** Measured ground speed, m/s (no velocity is synced). */
  speed: number;
  /** Measured turn rate, rad/s (absolute). */
  turnRate: number;
  grabbing: boolean;
  onFire: boolean;
  splatted: boolean;
  /** In a shield line (#6). Only a shield CRS shows it. */
  formation: boolean;
  /** Pompier's hose on (#17). */
  spraying: boolean;
}

export interface LoopChoice {
  name: string;
  timeScale: number;
}

/** Below this speed a body stands (m/s): the interpolation drifts a little. */
export const STAND_SPEED = 0.35;
/** A protester body (revealed BAC) runs above this, like the players. */
export const RUN_SPEED = 3.2;
/** Speeds the walk and run clips look right at, at time scale 1 (m/s). */
const MARCH_REF = 1.6;
const WALK_REF = 1.8;
const RUN_REF = 5;
/** The step rate never goes past these, so a charge stays a march and not a blur. */
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.6;
/** A spraying pompier turning faster than this sweeps the hose (rad/s). */
const SWEEP_TURN = 0.8;

/** A walk clip's time scale for `speed`, against the speed it was authored at. */
export function stepScale(speed: number, ref: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, speed / ref));
}

/** The looping clip for this frame. One-shots (swings, falls, the wind-up) are on top of this. */
export function chooseLoop(i: LoopInput): LoopChoice {
  const moving = i.speed > STAND_SPEED;
  if (i.grabbing) return { name: "hold-loop", timeScale: 1 };
  if (i.onFire) return { name: "on-fire-run", timeScale: 1 };
  switch (i.role) {
    case "pompier":
      if (i.spraying) return { name: i.turnRate > SWEEP_TURN ? "hose-sweep" : moving ? "hose-walk" : "hose-spray", timeScale: 1 };
      return moving ? { name: "hose-walk", timeScale: stepScale(i.speed, MARCH_REF) } : { name: "hose-ready", timeScale: 1 };
    case "bac":
      if (i.splatted) return { name: "tomato-stumble", timeScale: 1 };
      if (!moving) return { name: "idle", timeScale: 1 };
      return i.speed > RUN_SPEED ? { name: "panic-run", timeScale: stepScale(i.speed, RUN_REF) } : { name: "walk", timeScale: stepScale(i.speed, WALK_REF) };
    default:
      if (moving) return { name: "formation-walk", timeScale: stepScale(i.speed, MARCH_REF) };
      // Splatted: wipes the visor (the CRS file swaps to the splatted body for it).
      if (i.splatted) return { name: i.role === "crs" ? "visor-wipe" : "tomato-stumble", timeScale: 1 };
      // A shield CRS holds its shield low until it forms a line; the others stand on guard.
      return { name: i.role === "crs" && !i.formation ? "shield-lowered" : "guard-idle", timeScale: 1 };
  }
}

/** The clip a baton swing plays: a BAC swings like a protester. */
export function swingClip(role: PoliceRole): string | null {
  if (role === "pompier") return null;
  return role === "bac" ? "melee-swing" : "baton-swing";
}

/** The clip held while lying: knocked down, or out cold. */
export function lyingClip(out: boolean): string {
  return out ? "ko-collapse" : "knockdown";
}

/**
 * Who threw a canister (#7): the bot nearest its start point, within
 * `reach`. The server throws from the bot's own position, so the nearest
 * one is the thrower. Null when none is close.
 */
export function nearestThrower(
  fromX: number,
  fromZ: number,
  bots: Iterable<readonly [string, { x: number; z: number }]>,
  reach = 1.5,
): string | null {
  let best: string | null = null;
  let bestD = reach;
  for (const [id, b] of bots) {
    const d = Math.hypot(b.x - fromX, b.z - fromZ);
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
