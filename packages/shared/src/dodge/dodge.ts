/**
 * Dodge rules (#9) as plain functions: the direction of a burst and the
 * cooldown check. The burst itself is body kinematics (`startDodge` and
 * `stepBody` in physics/body.ts).
 */
import type { MoveInput } from "../net/index.js";
import type { Vec2 } from "../physics/collision.js";
import { DODGE_COOLDOWN } from "./constants.js";

/** Float slack so a press exactly on the cooldown boundary is accepted. */
const EPS = 1e-9;

/**
 * Where a dodge goes: the held move direction, or the facing when standing
 * still (`rotation` as synced: atan2(x, z)). Always a unit vector.
 */
export function dodgeDirection(input: MoveInput, rotation: number): Vec2 {
  const len = Math.hypot(input.x, input.z);
  if (Number.isFinite(len) && len > 1e-6) return { x: input.x / len, z: input.z / len };
  const r = Number.isFinite(rotation) ? rotation : 0;
  return { x: Math.sin(r), z: Math.cos(r) };
}

/** True if a dodge may start at `now`, the last one having started at `lastAt` (undefined: never). */
export function dodgeReady(lastAt: number | undefined, now: number, cooldown = DODGE_COOLDOWN): boolean {
  return lastAt === undefined || now - lastAt >= cooldown - EPS;
}
