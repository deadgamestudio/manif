/**
 * Hand-written kinematics for player and CRS root bodies (#2 Part A).
 *
 * A body walks at a fixed speed from its move input (crisp, as before), and on
 * top of that carries a knockback velocity that impulses add to and drag and
 * friction bring back to zero. Position integrates from the sum of both and is
 * then collided with `moveCircle`, which sub-steps long moves, so no speed can
 * tunnel through a wall. Fast bodies bounce off walls.
 *
 * Timers count down with the fixed `dt`, so everything here is deterministic
 * and unit tested without a room or a clock.
 */
import type { MoveInput } from "../net/index.js";
import { moveCircle, type CollisionWorld, type Vec2 } from "./collision.js";
import {
  DOWN_DURATION,
  GETUP_IMMUNITY,
  KNOCKBACK_DRAG,
  KNOCKBACK_FRICTION,
  KNOCKBACK_STOP_SPEED,
  KNOCKDOWN_THRESHOLD,
  MAX_KNOCKBACK_SPEED,
  WALL_BOUNCE,
  WALL_BOUNCE_MIN_SPEED,
  WALL_BOUNCE_TANGENT_KEEP,
} from "./constants.js";
import { DODGE_BONK_DOWN, DODGE_BONK_FACTOR, DODGE_DURATION, DODGE_SPEED_FACTOR } from "../dodge/constants.js";

/** A physical root body on the ground plane. Server-side only, except `x`, `z` and "down". */
export interface Body extends Vec2 {
  /** Knockback velocity, m/s. Walking is not stored here. */
  vx: number;
  vz: number;
  /** Seconds left knocked down. > 0 means down: no control. */
  downTime: number;
  /** Seconds left of get-up immunity: pushes still apply, knock-downs do not. */
  immuneTime: number;
  /** Seconds left of a dodge burst (#9). > 0 means dodging: the walk is replaced by the burst. */
  dodgeTime: number;
  /** Unit direction of the current dodge. */
  dodgeX: number;
  dodgeZ: number;
}

export function createBody(x: number, z: number): Body {
  return { x, z, vx: 0, vz: 0, downTime: 0, immuneTime: 0, dodgeTime: 0, dodgeX: 0, dodgeZ: 0 };
}

export function isDodging(body: Body): boolean {
  return body.dodgeTime > 0;
}

/**
 * Start a dodge burst (#9): for `duration` seconds the body moves at
 * DODGE_SPEED_FACTOR times its walking speed along (dirX, dirZ), ignoring the
 * move input. Refused (false) while down, already dodging, or with no
 * direction. Cooldown and health state are the caller's rules.
 */
export function startDodge(body: Body, dirX: number, dirZ: number, duration = DODGE_DURATION): boolean {
  const len = Math.hypot(dirX, dirZ);
  if (isDown(body) || isDodging(body) || !Number.isFinite(len) || len < 1e-6 || !(duration > 0)) return false;
  body.dodgeX = dirX / len;
  body.dodgeZ = dirZ / len;
  body.dodgeTime = duration;
  return true;
}

/** Stop a dodge at once (grabbed, KO, dragged, knocked down). */
export function endDodge(body: Body): void {
  body.dodgeTime = 0;
}

export function isDown(body: Body): boolean {
  return body.downTime > 0;
}

export function isImmune(body: Body): boolean {
  return body.immuneTime > 0;
}

/** Whether the body may move and act (attack, throw, dodge...). False while down. */
export function hasControl(body: Body): boolean {
  return !isDown(body);
}

/**
 * Knock a body down for `duration` seconds. Refused (returns false) while it is
 * already down, so hits do not extend the timer, or during get-up immunity, so
 * nobody is chain-floored.
 */
export function knockDown(body: Body, duration = DOWN_DURATION): boolean {
  if (isDown(body) || isImmune(body) || duration <= 0) return false;
  body.downTime = duration;
  endDodge(body);
  return true;
}

/**
 * - `auto`: knock down when `strength >= KNOCKDOWN_THRESHOLD` (hits, pavés).
 * - `always`: knock down whatever the strength (a thrown teammate, #11).
 * - `never`: only push (a shove). A dodge (#9) is not an impulse: see `startDodge`.
 * Immunity and "already down" still apply in every mode.
 */
export type KnockdownMode = "auto" | "always" | "never";

export interface ImpulseResult {
  /** Unit direction actually applied, {0,0} if the impulse was ignored. */
  dirX: number;
  dirZ: number;
  /** Strength applied, m/s (0 if ignored). */
  strength: number;
  /** True if this impulse knocked the body down. */
  knockedDown: boolean;
}

/**
 * The one entry point for every hit: add `strength` m/s of velocity along the
 * ground direction (dirX, dirZ), which need not be normalized. The resulting
 * knockback speed is capped at MAX_KNOCKBACK_SPEED. Invalid or zero input is
 * ignored.
 */
export function applyImpulse(
  body: Body,
  dirX: number,
  dirZ: number,
  strength: number,
  mode: KnockdownMode = "auto",
): ImpulseResult {
  const len = Math.hypot(dirX, dirZ);
  if (!Number.isFinite(len) || len < 1e-6 || !Number.isFinite(strength) || strength <= 0) {
    return { dirX: 0, dirZ: 0, strength: 0, knockedDown: false };
  }
  const nx = dirX / len;
  const nz = dirZ / len;
  const s = Math.min(strength, MAX_KNOCKBACK_SPEED);
  body.vx += nx * s;
  body.vz += nz * s;
  capSpeed(body, MAX_KNOCKBACK_SPEED);

  const wantsDown = mode === "always" || (mode === "auto" && s >= KNOCKDOWN_THRESHOLD);
  const knockedDown = wantsDown && knockDown(body);
  return { dirX: nx, dirZ: nz, strength: s, knockedDown };
}

/** A dodge that ran head-on into something (#9). */
export interface DodgeBonk extends Vec2 {
  /** Bounce-back speed, m/s. */
  speed: number;
}

export interface BodyStepResult {
  /** The body got back up during this step (its get-up immunity just started). */
  gotUp: boolean;
  /**
   * Speed into the wall at impact (m/s), 0 if nothing was hit. Lets callers
   * react to hard impacts (a dodge into a lamp post knocks down, #9).
   */
  impactSpeed: number;
  /**
   * A dodge ran head-on into a wall or a prop this step (#9): the unit
   * direction it bounced back along and the bounce speed (m/s), else null. The
   * burst ended; the body was knocked down unless it was in get-up immunity.
   */
  bonk: DodgeBonk | null;
}

/**
 * One fixed step: timers, then movement, collision and bounce, then drag.
 *
 * `input` is the held move direction (unit or zero); it is ignored while down
 * or dodging, and used again as soon as the body is up, without a new key press.
 * `walkSpeed` is the walking speed in m/s; a dodge goes DODGE_SPEED_FACTOR
 * times faster, so scaling `walkSpeed` (#14) scales the dodge too.
 */
export function stepBody(
  world: CollisionWorld,
  body: Body,
  input: MoveInput,
  walkSpeed: number,
  radius: number,
  dt: number,
): BodyStepResult {
  const gotUp = tickTimers(body, dt);

  const control = hasControl(body);
  if (!control) endDodge(body);
  const dodging = isDodging(body);
  const dodgeSpeed = walkSpeed * DODGE_SPEED_FACTOR;
  // A dodge replaces the walk for its duration; knockback still adds on top.
  const wx = dodging ? body.dodgeX * dodgeSpeed : control ? input.x * walkSpeed : 0;
  const wz = dodging ? body.dodgeZ * dodgeSpeed : control ? input.z * walkSpeed : 0;
  const dx = (wx + body.vx) * dt;
  const dz = (wz + body.vz) * dt;

  let impactSpeed = 0;
  let bonk: DodgeBonk | null = null;
  if (dx !== 0 || dz !== 0) {
    // moveCircle sub-steps, so a dodge at any speed cannot tunnel through a wall.
    const res = moveCircle(world, body, dx, dz, radius);
    body.x = res.x;
    body.z = res.z;
    impactSpeed = bounce(body, res.pushX, res.pushZ);
    if (dodging) bonk = dodgeBonk(body, res.pushX, res.pushZ, wx, wz, dodgeSpeed);
  }

  if (isDodging(body)) {
    body.dodgeTime -= dt;
    if (body.dodgeTime <= 1e-9) body.dodgeTime = 0;
  }
  applyDrag(body, dt);
  return { gotUp, impactSpeed, bonk };
}

/**
 * A dodge that hit something (push along the contact normal): head-on enough,
 * it bonks (#9): the burst ends, the body bounces back along the normal and is
 * knocked down briefly. A slapstick failure rather than a silent stop.
 * Returns the bounce direction, or null for a glancing hit (it slides on).
 */
function dodgeBonk(body: Body, pushX: number, pushZ: number, wx: number, wz: number, dodgeSpeed: number): DodgeBonk | null {
  const plen = Math.hypot(pushX, pushZ);
  if (plen < 1e-9) return null;
  const nx = pushX / plen;
  const nz = pushZ / plen;
  const into = -(wx * nx + wz * nz);
  if (into < dodgeSpeed * DODGE_BONK_FACTOR) return null;
  endDodge(body);
  body.vx += nx * into * WALL_BOUNCE;
  body.vz += nz * into * WALL_BOUNCE;
  knockDown(body, DODGE_BONK_DOWN);
  return { x: nx, z: nz, speed: into * WALL_BOUNCE };
}

/** Count timers down. Returns true when the body gets up during this step. */
export function tickTimers(body: Body, dt: number): boolean {
  if (body.downTime > 0) {
    body.downTime -= dt;
    if (body.downTime > 1e-9) return false;
    body.downTime = 0;
    body.immuneTime = GETUP_IMMUNITY;
    return true;
  }
  if (body.immuneTime > 0) {
    body.immuneTime -= dt;
    if (body.immuneTime <= 1e-9) body.immuneTime = 0;
  }
  return false;
}

/** Exponential drag plus constant friction on the knockback velocity, snapping to zero when slow. */
export function applyDrag(body: Body, dt: number): void {
  const speed = Math.hypot(body.vx, body.vz);
  if (speed === 0) return;
  const next = speed * Math.exp(-KNOCKBACK_DRAG * dt) - KNOCKBACK_FRICTION * dt;
  if (next <= KNOCKBACK_STOP_SPEED) {
    body.vx = 0;
    body.vz = 0;
    return;
  }
  const k = next / speed;
  body.vx *= k;
  body.vz *= k;
}

/**
 * React to a collision push (pushX, pushZ), whose direction is the contact
 * normal. The part of the knockback velocity going into the wall is reflected
 * and damped when fast, or simply removed when slow, so bodies never stay
 * glued to walls. Returns the speed into the wall (0 if none).
 */
export function bounce(body: Body, pushX: number, pushZ: number): number {
  const plen = Math.hypot(pushX, pushZ);
  if (plen < 1e-9) return 0;
  const nx = pushX / plen;
  const nz = pushZ / plen;
  const vn = body.vx * nx + body.vz * nz;
  if (vn >= 0) return 0; // already moving away
  const into = -vn;
  // Split into normal and tangent parts.
  const tx = body.vx - vn * nx;
  const tz = body.vz - vn * nz;
  if (into < WALL_BOUNCE_MIN_SPEED) {
    body.vx = tx;
    body.vz = tz;
  } else {
    body.vx = tx * WALL_BOUNCE_TANGENT_KEEP + into * WALL_BOUNCE * nx;
    body.vz = tz * WALL_BOUNCE_TANGENT_KEEP + into * WALL_BOUNCE * nz;
  }
  return into;
}

function capSpeed(body: Body, max: number): void {
  const speed = Math.hypot(body.vx, body.vz);
  if (speed <= max) return;
  const k = max / speed;
  body.vx *= k;
  body.vz *= k;
}
