/**
 * The CRS LBD (#73): a CRS with a cartoon launcher instead of a shield. It
 * keeps its distance from the cortège, picks a protester who just broke, hit
 * or threw something (`pickLbdTarget`), aims at them for a moment with a
 * laser everyone sees (`aimId`, synced), then fires a big rubber ball that
 * knocks the first protester in its way on their bum.
 *
 *   positioning ──offender in range and in line, shot ready──> aiming ──aimTime──> fires ──cooldown──> positioning
 *        │                                                        └─ dodge, cover, a hit, out of range: foiled (reaimDelay)
 *        └─ a protester in baton reach: a slow, soft swing
 *
 * Counterplay: dodge during the aim (#9), step behind a wall, a prop, a car
 * or a CRS (the ball stops there), let a teammate take it, splat the shooter
 * (#15: the shot goes wide), or rush it (few HP, weak baton). A hop does not
 * help: the ball is too fast to hop over.
 *
 * The ball (`stepBall`) is a swept circle like a thrown item (`wallEntry`,
 * `segmentEntry`), so it never tunnels through a body at 30 Hz. The room
 * flies it and applies the hit. Plain functions, unit tested with a fake host.
 */
import { PlayerStatus } from "../health/index.js";
import { segmentEntry } from "../melee/index.js";
import { isDown, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { wallEntry } from "../throwable/index.js";
import { DEFAULT_BEHAVIOUR, cancelAim, gapTo, steerTo, type CrsBehaviour, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CrsStatus, OFFENDER_MEMORY, crsRadius, type LbdStats } from "./constants.js";
import { isSplatted } from "./status.js";
import { pickLbdTarget, type ProtesterView } from "./targeting.js";

/** Something round a ball can hit or be stopped by: a protester, a CRS. */
export interface BallBody extends Vec2 {
  id: string;
  r: number;
}

/**
 * The bots that stop a ball fired by `shooterId` (#73): every bot standing on
 * the street (police in uniform, pompiers), as circles of their radius. Not
 * the shooter, not a bot out or lying down (it flies over), and not a BAC
 * still in disguise (the police know their own). Appended to `out`.
 */
export function ballBlockers(bots: readonly CrsBot[], shooterId: string, out: BallBody[] = []): BallBody[] {
  for (const b of bots) {
    if (b.id === shooterId || b.status === CrsStatus.Out || !b.revealed || isDown(b.body)) continue;
    out.push({ id: b.id, x: b.body.x, z: b.body.z, r: crsRadius(b.kind, b.mount) });
  }
  return out;
}

/**
 * Whether a ball of radius `r` from `from` would reach `to` (#73): no wall,
 * obstacle, prop or street edge in `world`, and none of `blockers`, on the
 * way. Protesters do not count: one in the way takes the hit instead.
 */
export function clearShot(from: Vec2, to: Vec2, world: CollisionWorld, blockers: readonly BallBody[], r: number): boolean {
  if (wallEntry(from, to, world, r) <= 1) return false;
  for (const b of blockers) {
    if (segmentEntry(from, to, { type: "circle", x: b.x, z: b.z, r: b.r + r }) !== null) return false;
  }
  return true;
}

/** Scratch for the line checks, reused every tick. */
const blockerScratch: BallBody[] = [];

function lineOfFire(bot: CrsBot, ctx: CrsContext, s: LbdStats): (p: Vec2) => boolean {
  blockerScratch.length = 0;
  ballBlockers(ctx.bots, bot.id, blockerScratch);
  return (p) => clearShot(bot.body, p, ctx.world, blockerScratch, s.ballRadius);
}

function stand(bot: CrsBot): void {
  bot.input.x = 0;
  bot.input.z = 0;
}

function face(bot: CrsBot, p: Vec2): void {
  const dx = p.x - bot.body.x;
  const dz = p.z - bot.body.z;
  if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
}

/** The nearest free protester within `range` (centre to centre), or undefined. Ties go to the smaller id. */
function nearestFree(bot: CrsBot, host: CrsHost, range: number): ProtesterView | undefined {
  let best: ProtesterView | undefined;
  let bestD = range;
  for (const p of host.protesters()) {
    if (p.status !== PlayerStatus.Free) continue;
    const d = Math.hypot(p.x - bot.body.x, p.z - bot.body.z);
    if (d < bestD || (d === bestD && best !== undefined && p.id < best.id)) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Start aiming at `target` (#73): it stands, facing them, for `aimTime`. */
export function startAim(bot: CrsBot, target: ProtesterView, now: number, s: LbdStats): void {
  bot.aimId = target.id;
  bot.aimUntil = now + s.aimTime;
  bot.path = null;
  face(bot, target);
}

/**
 * One tick of an aim (#73): stands facing the target. Foiled (`cancelAim`,
 * then `reaimDelay`) when they dodge, go down, stop being free, get out of
 * range or behind cover. When the time is up it fires at where they stand
 * now, or off by `splatMiss` either side when splatted (#15); the next aim
 * waits the full `cooldown`.
 */
export function stepAim(bot: CrsBot, ctx: CrsContext, host: CrsHost): void {
  const s = bot.stats.lbd;
  const now = ctx.now;
  stand(bot);
  const id = bot.aimId;
  if (!s || id === null) return;
  const target = host.protester(id);
  if (
    !target ||
    target.status !== PlayerStatus.Free ||
    target.down ||
    target.dodging === true ||
    Math.hypot(target.x - bot.body.x, target.z - bot.body.z) > s.range ||
    !lineOfFire(bot, ctx, s)(target)
  ) {
    cancelAim(bot, now);
    return;
  }
  face(bot, target);
  if (now < bot.aimUntil) return;
  bot.aimId = null;
  bot.shotReadyAt = now + s.cooldown;
  let dx = target.x - bot.body.x;
  let dz = target.z - bot.body.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  dx /= len;
  dz /= len;
  if (isSplatted(bot, now)) {
    // A tomato on the visor: it fires wide, one side or the other.
    const a = s.splatMiss * ((ctx.rng ?? Math.random)() < 0.5 ? -1 : 1);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = dx;
    dx = x * c + dz * sn;
    dz = -x * sn + dz * c;
  }
  bot.rotation = Math.atan2(dx, dz);
  host.fireLbd?.(bot.id, bot.body, dx, dz);
}

/** How close the nearest protester may get while an LBD walks round cover towards an offender (#73), as a share of `standoffMin`. */
const FLANK_CLOSEST = 0.5;

/**
 * Where an LBD stands when not aiming (#73): keeps the nearest free
 * protester between `standoffMin` and `standoffMax` away, backing off when
 * they close in and walking up when the cortège is far. An offender in sight
 * but out of line (behind a bollard, a car, other CRS) or out of range
 * (`flank`): it walks towards them, round the cover, until it has a shot, and
 * lets protesters come as close as FLANK_CLOSEST of its standoff meanwhile.
 * Nobody in sight: back to its post.
 */
function keepDistance(
  bot: CrsBot,
  ctx: CrsContext,
  s: LbdStats,
  near: ProtesterView | undefined,
  target: ProtesterView | undefined,
  flank: ProtesterView | undefined,
): void {
  if (!near) {
    if (Math.hypot(bot.post.x - bot.body.x, bot.post.z - bot.body.z) > 0.5) steerTo(bot, bot.post.x, bot.post.z, ctx);
    else stand(bot);
    return;
  }
  const dx = bot.body.x - near.x;
  const dz = bot.body.z - near.z;
  const d = Math.hypot(dx, dz);
  if (flank && d >= s.standoffMin * FLANK_CLOSEST) {
    steerTo(bot, flank.x, flank.z, ctx);
    if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
    return;
  }
  if (d < s.standoffMin) {
    // Too close: walk away from them (pathing around walls), facing them over its shoulder.
    const ux = d > 1e-6 ? dx / d : -Math.sin(bot.rotation);
    const uz = d > 1e-6 ? dz / d : -Math.cos(bot.rotation);
    steerTo(bot, bot.body.x + ux * 3, bot.body.z + uz * 3, ctx);
    face(bot, near);
    return;
  }
  const goal = target ?? near;
  if (Math.hypot(goal.x - bot.body.x, goal.z - bot.body.z) > s.standoffMax) {
    steerTo(bot, goal.x, goal.z, ctx);
    if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
    return;
  }
  stand(bot);
  face(bot, goal);
}

/**
 * The LBD's tick (the `orders` step, #73): always its own orders, never the
 * base chase, so it never grabs. Aiming: `stepAim`. Otherwise: a soft baton
 * swing at whoever is in reach, else a new aim on an offender in range and in
 * line when the shot is ready, else `keepDistance` (walking round cover
 * towards an offender out of line).
 */
export function lbdOrders(bot: CrsBot, ctx: CrsContext, host: CrsHost): boolean {
  const s = bot.stats.lbd;
  if (!s) return false;
  const now = ctx.now;
  if (bot.aimId !== null) {
    stepAim(bot, ctx, host);
    return true;
  }
  const near = nearestFree(bot, host, bot.stats.sight);
  // Rushed: a slow, soft swing (a miss when splatted, #15). It does not back off mid-swing.
  if (near && gapTo(bot, near) <= bot.stats.batonRange && now >= bot.batonReadyAt) {
    const dx = near.x - bot.body.x;
    const dz = near.z - bot.body.z;
    bot.batonReadyAt = now + bot.stats.batonCooldown;
    face(bot, near);
    stand(bot);
    if (isSplatted(bot, now)) host.batonMiss?.(bot.id);
    else if (host.canBeHurt(near.id)) host.batonHit(bot.id, near.id, dx, dz, bot.stats.batonDamage, bot.stats.batonImpulse);
    return true;
  }
  // Who it would shoot: re-picked every `retargetInterval`, or at once when the current one stops qualifying.
  const current = bot.targetId === null ? undefined : host.protester(bot.targetId);
  if (now >= bot.retargetAt || !current || current.status !== PlayerStatus.Free) {
    bot.targetId = pickLbdTarget(bot.body, host.protesters(), {
      now,
      range: s.range,
      memory: OFFENDER_MEMORY,
      currentId: bot.targetId,
      switchMargin: bot.stats.switchMargin,
      inLine: lineOfFire(bot, ctx, s),
    });
    bot.retargetAt = now + bot.stats.retargetInterval;
  }
  const target = bot.targetId === null ? undefined : host.protester(bot.targetId);
  if (target && now >= bot.shotReadyAt && host.fireLbd) {
    startAim(bot, target, now, s);
    stand(bot);
    return true;
  }
  // No shot: an offender it can see but not reach (cover, range) is worth walking round to.
  let flank: ProtesterView | undefined;
  if (!target) {
    const id = pickLbdTarget(bot.body, host.protesters(), {
      now,
      range: bot.stats.sight,
      memory: OFFENDER_MEMORY,
      currentId: null,
      switchMargin: 0,
      inLine: () => true,
    });
    flank = id === null ? undefined : host.protester(id);
  }
  keepDistance(bot, ctx, s, near, target, flank);
  return true;
}

/** The LBD's steps: its own orders every tick (it never chases, grabs or drags). */
export const LBD_BEHAVIOUR: CrsBehaviour = { ...DEFAULT_BEHAVIOUR, orders: lbdOrders };

/** A rubber ball in flight (#73). Server-only; clients fly their own copy from the shot event. */
export interface LbdBall extends Vec2 {
  id: string;
  /** The bot that fired it: never hit by its own ball. */
  by: string;
  /** Unit ground direction. */
  dirX: number;
  dirZ: number;
  speed: number;
  r: number;
  /** Distance left before it drops. */
  left: number;
}

export function createBall(id: string, by: string, from: Vec2, dirX: number, dirZ: number, s: LbdStats): LbdBall {
  return { id, by, x: from.x, z: from.z, dirX, dirZ, speed: s.ballSpeed, r: s.ballRadius, left: s.ballRange };
}

export type BallStep =
  | { type: "flying" }
  /** Hit protester `id`: the room knocks them down. */
  | { type: "hit"; id: string; x: number; z: number }
  /** Stopped by a wall, a prop, a car, the street edge (`by` null) or a bot (`by` its id). */
  | { type: "blocked"; by: string | null; x: number; z: number }
  /** Flew its whole range and dropped. */
  | { type: "dropped"; x: number; z: number };

/**
 * Move a ball one tick (mutates it): a swept circle, so nothing is skipped at
 * any speed. The first contact along the way wins: a wall or prop in `world`,
 * a bot in `blockers` (the shooter skipped), or a protester in `targets`
 * (only those it can hit: standing, free, not mid-dodge; the room picks).
 * It stops at the contact.
 */
export function stepBall(ball: LbdBall, dt: number, world: CollisionWorld, blockers: Iterable<BallBody>, targets: Iterable<BallBody>): BallStep {
  const dist = Math.max(0, Math.min(ball.speed * dt, ball.left));
  const a: Vec2 = { x: ball.x, z: ball.z };
  const b: Vec2 = { x: ball.x + ball.dirX * dist, z: ball.z + ball.dirZ * dist };
  let bestT = wallEntry(a, b, world, ball.r);
  let hit: { id: string; target: boolean } | null = null;
  const consider = (bodies: Iterable<BallBody>, target: boolean) => {
    for (const body of bodies) {
      if (body.id === ball.by) continue;
      const t = segmentEntry(a, b, { type: "circle", x: body.x, z: body.z, r: body.r + ball.r });
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { id: body.id, target };
      }
    }
  };
  consider(blockers, false);
  consider(targets, true);
  if (bestT <= 1) {
    const travelled = dist * bestT;
    ball.x = a.x + ball.dirX * travelled;
    ball.z = a.z + ball.dirZ * travelled;
    ball.left = 0;
    const h = hit as { id: string; target: boolean } | null;
    if (h?.target) return { type: "hit", id: h.id, x: ball.x, z: ball.z };
    return { type: "blocked", by: h?.id ?? null, x: ball.x, z: ball.z };
  }
  ball.x = b.x;
  ball.z = b.z;
  ball.left -= dist;
  if (ball.left <= 1e-9) {
    ball.left = 0;
    return { type: "dropped", x: ball.x, z: ball.z };
  }
  return { type: "flying" };
}
