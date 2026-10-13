/**
 * Status timers a thrown item leaves on a police bot (#15). Each is a room
 * time until which it lasts, on the bot itself (`CrsBot.splatUntil`...), so
 * a second hit refreshes the timer instead of stacking, and two different
 * statuses at once are fine (a splatted, stinky CRS is allowed, and funny).
 *
 * - `splat` (a tomato): the visor is red. The bot stumbles (slower, with a
 *   wobble), its baton swings miss, it can't grab, and its tear gas goes
 *   wide. See `stepCrs` / `act` / `tryThrowGas` in brain.ts.
 * - `stink` (dog poo): the other bots keep their distance from it (see
 *   `steerTo`), and it backs off from the protesters for a moment.
 *
 * Synced lean: one boolean each on the Crs view; the timers stay server-side.
 */
import { CrsStatus } from "./constants.js";

/** What a bot needs for its status timers. `CrsBot` has them all. */
export interface CrsStatusTimers {
  status: CrsStatus;
  /** Room time until which the visor is splatted (0: never was). */
  splatUntil: number;
  /** Room time until which it stinks. */
  stinkUntil: number;
  /** Room time until which it backs away from the protesters (the first moment of a stink). */
  backOffUntil: number;
}

/** A splatted bot walks this much slower. */
export const SPLAT_SPEED_FACTOR = 0.6;
/** Its walk wobbles left and right by up to this angle (radians)... */
export const SPLAT_WOBBLE_ANGLE = 0.9;
/** ...this many times a second (radians per second of room time). */
export const SPLAT_WOBBLE_SPEED = 7;
/** Its tear gas scatter is this many times wider. */
export const SPLAT_GAS_SCATTER = 3;

/** A stinky bot backs off from the protesters for this long after the hit. */
export const STINK_BACKOFF = 1.5;
/** Other bots keep this far from a stinky one (edge to edge, instead of CRS_SEPARATION). */
export const STINK_KEEP_AWAY = 2.5;
/** How hard they steer away from it, against the pull of their goal (1 = as hard as the goal pulls). */
export const STINK_PUSH = 2;

export function isSplatted(bot: CrsStatusTimers, now: number): boolean {
  return bot.status !== CrsStatus.Out && now < bot.splatUntil;
}

export function isStinky(bot: CrsStatusTimers, now: number): boolean {
  return bot.status !== CrsStatus.Out && now < bot.stinkUntil;
}

export function isBackingOff(bot: CrsStatusTimers, now: number): boolean {
  return bot.status !== CrsStatus.Out && now < bot.backOffUntil;
}

/** A tomato on the visor: splatted for `duration` from now. Refreshes, never stacks. False when out (nothing to splat). */
export function splatCrs(bot: CrsStatusTimers, now: number, duration: number): boolean {
  if (bot.status === CrsStatus.Out || !(duration > 0)) return false;
  bot.splatUntil = Math.max(bot.splatUntil, now + duration);
  return true;
}

/** Dog poo: stinky for `duration` from now, and backing off for the first STINK_BACKOFF. Refreshes, never stacks. */
export function stinkCrs(bot: CrsStatusTimers, now: number, duration: number): boolean {
  if (bot.status === CrsStatus.Out || !(duration > 0)) return false;
  bot.stinkUntil = Math.max(bot.stinkUntil, now + duration);
  bot.backOffUntil = Math.max(bot.backOffUntil, now + Math.min(STINK_BACKOFF, duration));
  return true;
}

/** The statuses a thrown item can leave (#15). A throwable row names one (`ThrowableType.effect`). */
export const CRS_EFFECTS = {
  splat: splatCrs,
  stink: stinkCrs,
} as const satisfies Record<string, (bot: CrsStatusTimers, now: number, duration: number) => boolean>;
export type CrsEffect = keyof typeof CRS_EFFECTS;
