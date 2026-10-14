/**
 * Struggling free (#70): a grabbed protester mashes attack, or the touch
 * button, and each press fills a meter. Full, they break free (the room frees
 * them like a rescue, with GRAB_IMMUNITY). Stop mashing and it drains.
 *
 * - Presses count at most STRUGGLE_RATE a second, so the fastest way out takes
 *   STRUGGLE_TIME seconds, whatever sends the presses.
 * - With no press for STRUGGLE_GRACE, the meter drains at STRUGGLE_DRAIN a second.
 * - The meter belongs to one grab: the room resets it when the protester is
 *   no longer grabbed.
 *
 * Pure: a `Struggle` record mutated in place, times in seconds of room time.
 */
import { STRUGGLE_DRAIN, STRUGGLE_GRACE, STRUGGLE_RATE, STRUGGLE_TIME } from "./constants.js";

export interface Struggle {
  /** 0..1; full breaks free. */
  meter: number;
  /** Room time of the last press that counted. */
  lastPressAt: number;
}

export function createStruggle(): Struggle {
  return { meter: 0, lastPressAt: -Infinity };
}

/** The meter one counted press adds. */
export const STRUGGLE_PER_PRESS = 1 / (STRUGGLE_TIME * STRUGGLE_RATE);

/**
 * One press at `now`. Returns true when it counted (not too soon after the
 * last one). The meter never goes above 1.
 */
export function strugglePress(s: Struggle, now: number): boolean {
  // A hair of slack, so a press exactly on the beat at the fastest rate still counts despite float rounding.
  if (now - s.lastPressAt < 1 / STRUGGLE_RATE - 1e-6) return false;
  s.lastPressAt = now;
  s.meter = Math.min(1, s.meter + STRUGGLE_PER_PRESS);
  return true;
}

/** Drain an idle meter: over `dt` up to `now`, once STRUGGLE_GRACE has passed since the last press. */
export function stepStruggle(s: Struggle, now: number, dt: number): void {
  if (s.meter <= 0 || now - s.lastPressAt <= STRUGGLE_GRACE) return;
  s.meter = Math.max(0, s.meter - STRUGGLE_DRAIN * dt);
}

/** Whether the meter is full: the protester breaks free. */
export function isStruggleFree(s: Struggle): boolean {
  return s.meter >= 1 - 1e-9;
}

/** The meter as a whole percentage, 0..100, for the synced `Player.struggle`. */
export function strugglePercent(s: Struggle): number {
  return Math.max(0, Math.min(100, Math.round(s.meter * 100)));
}
