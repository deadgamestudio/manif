/**
 * Struggling free (#70): a grabbed protester mashes attack, or the touch
 * button, and each press fills a meter. Full, they break free (the room frees
 * them like a rescue, with GRAB_IMMUNITY). Stop mashing and it drains.
 *
 * - Presses count at most STRUGGLE_RATE a second, so the fastest way out takes
 *   about STRUGGLE_TIME seconds, whatever sends the presses. It is a budget
 *   that refills at STRUGGLE_RATE (holding at most STRUGGLE_BURST presses),
 *   not a minimum gap: a thumb mashing a little faster than the rate, or
 *   presses bunched by the network, still get the full rate.
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
  /** Room time of the last press, counted or not (the drain waits STRUGGLE_GRACE after it). */
  lastPressAt: number;
  /** Presses that may count right now (0..STRUGGLE_BURST), as of `creditAt`. */
  credit: number;
  creditAt: number;
}

/** Presses the budget holds at most: a short burst after a pause counts, then the rate holds. */
export const STRUGGLE_BURST = 2;

export function createStruggle(): Struggle {
  return { meter: 0, lastPressAt: -Infinity, credit: STRUGGLE_BURST, creditAt: -Infinity };
}

/** The meter one counted press adds. */
export const STRUGGLE_PER_PRESS = 1 / (STRUGGLE_TIME * STRUGGLE_RATE);

/**
 * One press at `now`. Returns true when it counted (the budget had a press
 * left). The meter never goes above 1. `gain` scales what a counted press
 * fills (#85: Moluchan's ring makes it faster); the rate limit is the same.
 */
export function strugglePress(s: Struggle, now: number, gain = 1): boolean {
  const refill = Number.isFinite(s.creditAt) ? Math.max(0, now - s.creditAt) * STRUGGLE_RATE : STRUGGLE_BURST;
  s.credit = Math.min(STRUGGLE_BURST, s.credit + refill);
  s.creditAt = now;
  s.lastPressAt = now;
  // A hair of slack, so a press exactly on the beat at the fastest rate still counts despite float rounding.
  if (s.credit < 1 - 1e-6) return false;
  s.credit = Math.max(0, s.credit - 1);
  s.meter = Math.min(1, s.meter + STRUGGLE_PER_PRESS * Math.max(0, gain));
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
