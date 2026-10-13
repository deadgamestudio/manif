/**
 * Bodies on fire (#16), the slapstick part: walk into a fire zone and your bum
 * is on fire for ON_FIRE_DURATION. While it burns you lose HP now and then,
 * and a protester panics and runs faster (ON_FIRE_SPEED). It ends when the
 * time runs out, when a teammate pats it out (`hold.ts`) or when water hits
 * you (`putOutBurn`: the pompiers' hose #17, the water cannon #13).
 * Protesters and CRS follow the same rules, with their own damage numbers.
 *
 * Pure: one `BodyBurn` record per body, mutated in place, timed with room time.
 */
import { BURN_DAMAGE, BURN_DAMAGE_INTERVAL, ON_FIRE_DURATION, ON_FIRE_SPEED } from "./constants.js";

const EPS = 1e-9;

export interface BodyBurn {
  /** Room time when the flames go out on their own. */
  until: number;
  /** Room time of the next damage tick. */
  nextDamageAt: number;
}

export function createBurn(): BodyBurn {
  return { until: -Infinity, nextDamageAt: Infinity };
}

export function isOnFire(b: BodyBurn, now: number): boolean {
  return now < b.until;
}

/** Walking speed multiplier: ON_FIRE_SPEED while burning (panic), else 1. */
export function burnSpeedFactor(b: BodyBurn, now: number): number {
  return isOnFire(b, now) ? ON_FIRE_SPEED : 1;
}

/** Flames out at once (patted out, or water). */
export function putOutBurn(b: BodyBurn): void {
  b.until = -Infinity;
  b.nextDamageAt = Infinity;
}

/**
 * One tick of one body (mutates `b`). `inFire`: the body is in a fire zone
 * this tick, which sets it on fire for ON_FIRE_DURATION from now (catching
 * fire, or staying in it, restarts the time). The first damage comes
 * `interval` after catching fire, then one every `interval` while it burns.
 * `canBurn` false (KO, arrested, a CRS out) puts it out and never hurts.
 * Returns the HP to take off this tick (0 or `damage`).
 */
export function stepBurn(
  b: BodyBurn,
  inFire: boolean,
  canBurn: boolean,
  now: number,
  damage = BURN_DAMAGE,
  interval = BURN_DAMAGE_INTERVAL,
  duration = ON_FIRE_DURATION,
): number {
  if (!canBurn) {
    putOutBurn(b);
    return 0;
  }
  if (inFire) {
    if (!isOnFire(b, now)) b.nextDamageAt = now + interval;
    b.until = now + duration;
  }
  if (!isOnFire(b, now) || now + EPS < b.nextDamageAt) return 0;
  b.nextDamageAt += interval;
  return damage;
}
