/**
 * Hop rules (#45) as plain functions: the cooldown check and the cosmetic
 * height of the arc. The hop itself is body kinematics (`startJump`,
 * `stepBody` and `landBody` in physics/body.ts).
 */
import { JUMP_COOLDOWN, JUMP_DURATION, JUMP_HEIGHT } from "./constants.js";

/** Float slack so a press exactly on the cooldown boundary is accepted. */
const EPS = 1e-9;

/** True if a hop may start at `now`, the last one having started at `lastAt` (undefined: never). */
export function jumpReady(lastAt: number | undefined, now: number, cooldown = JUMP_COOLDOWN): boolean {
  return lastAt === undefined || now - lastAt >= cooldown - EPS;
}

/**
 * Height of the hop arc `elapsed` seconds after take-off: a parabola from 0 up
 * to JUMP_HEIGHT halfway and back to 0 at JUMP_DURATION. 0 outside the hop.
 * Client-side only (the server never uses a height).
 */
export function jumpHeight(elapsed: number, duration = JUMP_DURATION, height = JUMP_HEIGHT): number {
  if (!(elapsed > 0) || !(elapsed < duration)) return 0;
  const s = elapsed / duration;
  return 4 * height * s * (1 - s);
}
