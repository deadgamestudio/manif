/**
 * The base police bot (#5): what one bot does each fixed tick.
 *
 *   active ──touches a free protester──> grabbing ──protester arrested / gone──> active
 *     │  └─(in reach) baton hit             │ stunned or knocked down: lets go (protester free)
 *     └──stun──> stunned ──time──> active   │
 *   any ──0 HP──> out ──time──> removed by the room
 *
 * Active with nobody in sight: walks back to its post (spawn point) and waits.
 *
 * Plain functions over a plain `CrsBot` record. The room owns the protesters
 * and applies the effects through `CrsHost` (damage, knockback, grab, drag),
 * so this file knows nothing about Schema and is unit tested with a fake host.
 *
 * Unit types (#13) reuse it: their numbers come from `CRS_STATS`, and
 * `stepCrs` takes a `CrsBehaviour` whose steps (pick a target, act, drag) a
 * unit type can replace one at a time.
 */
import { GAS_MAX_RANGE, GAS_SCATTER, pickGasAim, scatterAim } from "../gas/index.js";
import { PlayerStatus } from "../health/index.js";
import {
  applyImpulse,
  createBody,
  isDown,
  stepBody,
  type Body,
  type CollisionWorld,
  type ImpulseResult,
  type Vec2,
} from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import {
  CRS_DIRECT_RANGE,
  CRS_GIVE_UP_TIME,
  CRS_SEPARATION,
  CRS_STATS,
  CRS_STUCK_PROGRESS,
  CRS_STUCK_TIME,
  CrsStatus,
  type CrsKind,
  type CrsStats,
} from "./constants.js";
import type { NavGrid } from "./nav.js";
import { pickTarget, type ProtesterView } from "./targeting.js";

/** Server-side state of one bot. Only x, z, rotation, hp, status, down and kind are synced. */
export interface CrsBot {
  readonly id: string;
  readonly kind: CrsKind;
  readonly stats: CrsStats;
  /** Position, knockback velocity and down timer (#2). */
  readonly body: Body;
  rotation: number;
  /** Where it stands guard: its spawn point. With nobody in sight it walks back here. */
  readonly post: Vec2;
  hp: number;
  status: CrsStatus;
  /** Room time when `stunned` or `out` ends. */
  statusUntil: number;
  /** Protester being chased, by session id. */
  targetId: string | null;
  /** Room time of the next target re-pick. */
  retargetAt: number;
  /** A target given up on (stuck), skipped until `ignoreUntil`. */
  ignoreId: string | null;
  ignoreUntil: number;
  /** Cells to walk through (see NavGrid.findPath), and the next one. */
  path: number[] | null;
  pathIndex: number;
  /** Where the current path leads, to re-path when the goal moves away from it. */
  pathGoal: Vec2;
  repathAt: number;
  batonReadyAt: number;
  grabReadyAt: number;
  /** Protester being dragged, while `grabbing`. */
  grabbedId: string | null;
  /** Stuck detector: where the bot was when the current window started, and when. */
  anchor: Vec2;
  anchorAt: number;
  /** Stuck twice in a row on the same target: give up on it. */
  stuckCount: number;
  /** Melee hits taken in a row, for the heavy hit that knocks it over. */
  staggerCount: number;
  lastHitAt: number;
  /** Walking direction this tick (unit or zero). Reused, never reallocated. */
  readonly input: Vec2;
  /** Room time of the next tear gas throw (#7), if its unit throws any (`stats.gasCooldown`). */
  gasReadyAt: number;
}

/** `now` is the room time it appears: its first tear gas (#7) is ready half a cooldown later, so a fresh wave does not gas at once. */
export function createCrsBot(id: string, kind: CrsKind, x: number, z: number, rotation = 0, now = 0): CrsBot {
  const stats = CRS_STATS[kind];
  return {
    id,
    kind,
    stats,
    body: createBody(x, z),
    rotation,
    post: { x, z },
    hp: stats.maxHp,
    status: CrsStatus.Active,
    statusUntil: 0,
    targetId: null,
    retargetAt: 0,
    ignoreId: null,
    ignoreUntil: 0,
    path: null,
    pathIndex: 0,
    pathGoal: { x, z },
    repathAt: 0,
    batonReadyAt: 0,
    grabReadyAt: 0,
    grabbedId: null,
    anchor: { x, z },
    anchorAt: 0,
    stuckCount: 0,
    staggerCount: 0,
    lastHitAt: -Infinity,
    input: { x: 0, z: 0 },
    gasReadyAt: now + stats.gasCooldown / 2,
  };
}

/** What the room does for the bots. Every method takes ids that may have just left: unknown ids are no-ops. */
export interface CrsHost {
  /** Every protester, for targeting. */
  protesters(): Iterable<ProtesterView>;
  protester(id: string): ProtesterView | undefined;
  /** Whether a baton hit would do anything (free or grabbed, not just respawned). */
  canBeHurt(id: string): boolean;
  /** A baton hit from bot `by`: damage plus a knockback along (dirX, dirZ). */
  batonHit(by: string, id: string, dirX: number, dirZ: number, damage: number, impulse: number): void;
  /** Start a grab. False if the protester is not free (already grabbed, KO...) or gone. */
  grab(id: string, duration: number): boolean;
  /** Let go of a grabbed protester, who is free again. */
  release(id: string): void;
  /** Move a grabbed protester's body to (x, z), collided. */
  drag(id: string, x: number, z: number): void;
  /**
   * A shield line member `by` shoves protester `id` (#6): a knockback of
   * `strength` along (dirX, dirZ), no damage. `floor` knocks them down too
   * (too many shoves in a row); otherwise it never does.
   */
  shove(by: string, id: string, dirX: number, dirZ: number, strength: number, floor: boolean): void;
  /**
   * Bot `by` throws a tear gas canister (#7) from `from` to `to`. False when
   * the room refuses it (too many clouds, or another bot just threw). Optional:
   * without it, bots never throw gas.
   */
  throwGas?(by: string, from: Vec2, to: Vec2): boolean;
}

/** What a bot sees of the world this tick. */
export interface CrsContext {
  /** The room's collision world (static level and props in their current shape). */
  world: CollisionWorld;
  /**
   * `world` plus what bots keep away from without it being solid: the fire
   * zones (#16). Shield lines lay their slots against it; `nav` is built from
   * it. Absent: the same as `world`.
   */
  avoid?: CollisionWorld;
  nav: NavGrid;
  /** Drag destinations: a point beside each police van (see `vanDoors`). */
  vans: readonly Vec2[];
  /** All bots, for keeping apart. */
  bots: readonly CrsBot[];
  /** Room time, seconds. */
  now: number;
  dt: number;
  /** Random numbers in [0, 1) for the tear gas scatter (#7). Math.random when absent; tests pass their own. */
  rng?: () => number;
}

/** The swappable steps of one tick (#13: a unit type replaces some). */
export interface CrsBehaviour {
  /** Keep or change `bot.targetId`. */
  updateTarget(bot: CrsBot, ctx: CrsContext, host: CrsHost): void;
  /** Hit or grab the target if possible. Returns true when the bot should stand still this tick. */
  act(bot: CrsBot, target: ProtesterView, ctx: CrsContext, host: CrsHost): boolean;
  /** While grabbing: set `bot.input` towards the van. */
  drag(bot: CrsBot, ctx: CrsContext, host: CrsHost): void;
  /**
   * Optional standing orders, checked before the chase while active: a bot
   * with a job of its own (a shield line member holding its slot, #6) sets
   * `bot.input` and `bot.rotation` and returns true, which skips target, act
   * and steering this tick. Returning false lets the bot chase as usual.
   */
  orders?(bot: CrsBot, ctx: CrsContext, host: CrsHost): boolean;
}

const scratch: Vec2 = { x: 0, z: 0 };
const NO_MOVE: Vec2 = { x: 0, z: 0 };
/** A path waypoint counts as reached within this distance. */
const WAYPOINT_REACHED = 0.35;
/** Look this many waypoints ahead for one we can walk straight to (path smoothing). */
const LOOK_AHEAD = 6;
/** Re-path when the goal is this far from where the current path leads. */
const GOAL_DRIFT = 1.5;
/** A bot back at its post stops within this distance of it. */
const POST_REACHED = 0.5;
/** A dragging bot stops this close to the van's door. */
const VAN_REACHED = 0.6;

/** Edge-to-edge gap between a bot and a protester. */
export function gapTo(bot: CrsBot, p: Vec2): number {
  return Math.hypot(p.x - bot.body.x, p.z - bot.body.z) - bot.stats.radius - PLAYER_RADIUS;
}

/** Re-pick the target every `retargetInterval`, or at once when it stops being a free protester. */
export function updateTarget(bot: CrsBot, ctx: CrsContext, host: CrsHost): void {
  const now = ctx.now;
  if (bot.ignoreId !== null && now >= bot.ignoreUntil) bot.ignoreId = null;
  const current = bot.targetId === null ? undefined : host.protester(bot.targetId);
  const valid = current !== undefined && current.status === PlayerStatus.Free && current.id !== bot.ignoreId;
  if (valid && now < bot.retargetAt) return;
  const next = pickTarget(bot.body, host.protesters(), bot.stats.sight, valid ? bot.targetId : null, bot.stats.switchMargin, bot.ignoreId);
  if (next !== bot.targetId) {
    bot.targetId = next;
    bot.path = null;
    bot.stuckCount = 0;
  }
  bot.retargetAt = now + bot.stats.retargetInterval;
}

/**
 * Grab when touching and the grab is ready, and the protester is down or the
 * baton is not ready (so a fresh target usually gets the baton first). Else
 * swing the baton when in reach. Only one grab per protester: `host.grab`
 * refuses anyone not free, so a second bot arriving the same tick gets nothing.
 */
export function act(bot: CrsBot, target: ProtesterView, ctx: CrsContext, host: CrsHost): boolean {
  const s = bot.stats;
  const now = ctx.now;
  const gap = gapTo(bot, target);
  const dx = target.x - bot.body.x;
  const dz = target.z - bot.body.z;
  if (gap <= s.grabReach && now >= bot.grabReadyAt && (target.down || now < bot.batonReadyAt)) {
    if (host.grab(target.id, s.grabDuration)) {
      bot.status = CrsStatus.Grabbing;
      bot.grabbedId = target.id;
      bot.targetId = null;
      bot.path = null;
      if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
      return true;
    }
  }
  if (gap <= s.batonRange && now >= bot.batonReadyAt && host.canBeHurt(target.id)) {
    bot.batonReadyAt = now + s.batonCooldown;
    if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
    host.batonHit(bot.id, target.id, dx, dz, s.batonDamage, s.batonImpulse);
  }
  // Touching: stand there rather than walk through them.
  return gap <= s.grabReach;
}

/** Walk to the nearest van, slowly; the room moves the protester behind us after the body step. */
export function drag(bot: CrsBot, ctx: CrsContext): void {
  const van = nearest(bot.body, ctx.vans);
  if (!van || Math.hypot(van.x - bot.body.x, van.z - bot.body.z) <= VAN_REACHED) {
    setInput(bot, NO_MOVE);
    return;
  }
  steerTo(bot, van.x, van.z, ctx);
}

export const DEFAULT_BEHAVIOUR: CrsBehaviour = {
  updateTarget,
  act,
  drag: (bot, ctx) => drag(bot, ctx),
};

/**
 * One fixed tick for one bot: timers, then think (target, act, steer), then
 * move the body (#2 kinematics, collided with the world), then drag the
 * grabbed protester along.
 */
export function stepCrs(bot: CrsBot, ctx: CrsContext, host: CrsHost, behaviour: CrsBehaviour = DEFAULT_BEHAVIOUR): void {
  const s = bot.stats;
  const now = ctx.now;
  if (bot.status === CrsStatus.Stunned && now >= bot.statusUntil) bot.status = CrsStatus.Active;

  let speedFactor = 1;
  let ordered = false;
  const down = isDown(bot.body);
  if (bot.status === CrsStatus.Out || bot.status === CrsStatus.Stunned || down) {
    // Out, dazed or on the floor: lets go of any grab and does nothing.
    if (bot.grabbedId !== null) releaseGrab(bot, host, now);
    setInput(bot, NO_MOVE);
  } else if (bot.status === CrsStatus.Grabbing) {
    if (holdsGrab(bot, host)) {
      behaviour.drag(bot, ctx, host);
      speedFactor = s.dragSpeedFactor;
    } else {
      // Arrested (drag over), rescued (#10) or disconnected: back to work.
      endGrab(bot, now);
      setInput(bot, NO_MOVE);
    }
  } else if (behaviour.orders?.(bot, ctx, host) === true) {
    // Following orders (#6): input and facing are already set.
    ordered = true;
  } else {
    behaviour.updateTarget(bot, ctx, host);
    const target = bot.targetId === null ? undefined : host.protester(bot.targetId);
    if (!target) {
      // Nobody in sight: back to its post, so a bot that dragged someone away does not idle out of sight forever.
      if (Math.hypot(bot.post.x - bot.body.x, bot.post.z - bot.body.z) > POST_REACHED) steerTo(bot, bot.post.x, bot.post.z, ctx);
      else setInput(bot, NO_MOVE);
    } else if (tryThrowGas(bot, ctx, host) || behaviour.act(bot, target, ctx, host)) {
      // Throwing a canister (#7) takes the tick, like a baton swing.
      setInput(bot, NO_MOVE);
    } else {
      steerTo(bot, target.x, target.z, ctx);
    }
  }

  // Walk (input scaled for the drag) plus any knockback slide.
  const input = bot.input;
  scratch.x = input.x * speedFactor;
  scratch.z = input.z * speedFactor;
  stepBody(ctx.world, bot.body, scratch, s.speed, s.radius, ctx.dt);
  if (!ordered && (input.x !== 0 || input.z !== 0)) bot.rotation = Math.atan2(input.x, input.z);
  detectStuck(bot, now);

  if (bot.status === CrsStatus.Grabbing && bot.grabbedId !== null) {
    // The protester trails just behind the bot.
    const back = s.radius + PLAYER_RADIUS + 0.05;
    host.drag(bot.grabbedId, bot.body.x - Math.sin(bot.rotation) * back, bot.body.z - Math.cos(bot.rotation) * back);
  }
}

/**
 * Tear gas (#7): a bot whose unit throws gas (`stats.gasCooldown` > 0) and
 * whose cooldown is over looks for a bunch of free protesters in range (see
 * `pickGasAim`) and lobs a canister at it, a little off. The room may refuse
 * (cloud cap, one throw every few seconds for the whole squad); the bot then
 * tries again a bit later. Returns true if it threw (it faces the throw).
 *
 * Called while chasing (lone bots) and by a formed shield line's thrower (#6).
 * Who it throws at is the room's protesters as the bot sees them, never a
 * point sent by a client.
 */
export function tryThrowGas(bot: CrsBot, ctx: CrsContext, host: CrsHost): boolean {
  const s = bot.stats;
  if (!host.throwGas || !(s.gasCooldown > 0) || ctx.now < bot.gasReadyAt) return false;
  // Retry soon whatever happens; a throw pushes it to the full cooldown below.
  bot.gasReadyAt = ctx.now + s.retargetInterval;
  const aim = pickGasAim(bot.body, host.protesters());
  if (!aim) return false;
  const to = scatterAim(bot.body, aim, GAS_SCATTER, GAS_MAX_RANGE, ctx.rng);
  if (!host.throwGas(bot.id, bot.body, to)) return false;
  bot.gasReadyAt = ctx.now + s.gasCooldown;
  const dx = to.x - bot.body.x;
  const dz = to.z - bot.body.z;
  if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
  return true;
}

/** Whether the grabbed protester is still there and still grabbed. */
function holdsGrab(bot: CrsBot, host: CrsHost): boolean {
  if (bot.grabbedId === null) return false;
  const p = host.protester(bot.grabbedId);
  return p !== undefined && p.status === PlayerStatus.Grabbed;
}

/** Stop holding without touching the protester (they are arrested or gone). */
function endGrab(bot: CrsBot, now: number): void {
  bot.grabbedId = null;
  if (bot.status === CrsStatus.Grabbing) bot.status = CrsStatus.Active;
  bot.grabReadyAt = now + bot.stats.grabCooldown;
  bot.path = null;
}

/** Let go: a still-grabbed protester is free again (stunned, knocked down or out). */
export function releaseGrab(bot: CrsBot, host: CrsHost, now: number): void {
  const id = bot.grabbedId;
  if (id !== null && holdsGrab(bot, host)) host.release(id);
  endGrab(bot, now);
}

/** Stun (a pavé #8, a stun hit): stands still for `duration` and lets go next tick. Ignored when out. */
export function stunCrs(bot: CrsBot, now: number, duration = bot.stats.stunDuration): boolean {
  if (bot.status === CrsStatus.Out || !(duration > 0)) return false;
  // A grabbing bot keeps `grabbedId` until stepCrs releases it.
  bot.status = CrsStatus.Stunned;
  bot.statusUntil = Math.max(bot.statusUntil, now + duration);
  return true;
}

export interface CrsHitResult {
  impulse: ImpulseResult;
  /** This hit took the bot to 0 HP. */
  out: boolean;
}

/**
 * A protester's melee lands on a bot (#4): take `damage` HP off and push it
 * away from (fromX, fromZ). Every `staggerHits`-th hit in quick succession is
 * heavy and knocks it over; the hit that empties its HP always does. A bot
 * already out ignores hits (null). A knocked-down or out bot lets go of its
 * grab on its next tick.
 */
export function hitCrs(bot: CrsBot, fromX: number, fromZ: number, damage: number, now: number): CrsHitResult | null {
  if (bot.status === CrsStatus.Out) return null;
  const s = bot.stats;
  bot.staggerCount = now - bot.lastHitAt <= s.staggerWindow ? bot.staggerCount + 1 : 1;
  bot.lastHitAt = now;
  const heavy = bot.staggerCount >= s.staggerHits;
  if (heavy) bot.staggerCount = 0;
  bot.hp = Math.max(0, bot.hp - Math.max(0, damage));
  const out = bot.hp === 0;
  let dx = bot.body.x - fromX;
  let dz = bot.body.z - fromZ;
  if (Math.hypot(dx, dz) < 1e-6) {
    dx = -Math.sin(bot.rotation);
    dz = -Math.cos(bot.rotation);
  }
  const impulse = applyImpulse(bot.body, dx, dz, heavy || out ? s.heavyHitImpulse : s.hitImpulse, out ? "always" : "auto");
  if (out) knockOut(bot, now);
  return { impulse, out };
}

/** At 0 HP: out, lying on the floor until removed, whatever the get-up timer says. */
function knockOut(bot: CrsBot, now: number): void {
  bot.status = CrsStatus.Out;
  bot.statusUntil = now + bot.stats.outDuration;
  bot.body.downTime = Math.max(bot.body.downTime, bot.stats.outDuration);
}

/**
 * A thrown item lands on a bot (#8 pavés; #15's items use the same call):
 * take `damage` HP off, push it `impulse` m/s along (dirX, dirZ), the flight
 * direction (at KNOCKDOWN_THRESHOLD or more it falls over), and stun it for
 * `stun` seconds. Stunned or floored, it lets go of any grab on its next tick
 * (with the rescue's grab immunity). The hit that empties its HP takes it out
 * instead. A bot already out ignores it (null).
 */
export function strikeCrs(
  bot: CrsBot,
  dirX: number,
  dirZ: number,
  damage: number,
  impulse: number,
  stun: number,
  now: number,
): CrsHitResult | null {
  if (bot.status === CrsStatus.Out) return null;
  bot.hp = Math.max(0, bot.hp - Math.max(0, damage));
  const out = bot.hp === 0;
  const res = applyImpulse(bot.body, dirX, dirZ, impulse, out ? "always" : "auto");
  if (out) knockOut(bot, now);
  else if (stun > 0) stunCrs(bot, now, stun);
  return { impulse: res, out };
}

/**
 * Damage with no push and no stun (#16: a bot on fire). The hit that empties
 * its HP takes it out. Returns whether it did (false too for a bot already out).
 */
export function burnCrs(bot: CrsBot, damage: number, now: number): boolean {
  if (bot.status === CrsStatus.Out || !(damage > 0)) return false;
  bot.hp = Math.max(0, bot.hp - damage);
  if (bot.hp > 0) return false;
  knockOut(bot, now);
  return true;
}

/**
 * Set `bot.input` towards (gx, gz): straight there when the way is clear and
 * close, otherwise along a cached A* path (re-pathed every `repathInterval`,
 * or when the goal drifts). Then nudged away from nearby bots.
 */
export function steerTo(bot: CrsBot, gx: number, gz: number, ctx: CrsContext): void {
  const body = bot.body;
  const dist = Math.hypot(gx - body.x, gz - body.z);
  if (dist < 1e-3) {
    setInput(bot, NO_MOVE);
    return;
  }
  scratch.x = gx;
  scratch.z = gz;
  let aimX = gx;
  let aimZ = gz;
  if (!(dist <= CRS_DIRECT_RANGE && ctx.nav.segmentWalkable(body, scratch))) {
    const drift = Math.hypot(gx - bot.pathGoal.x, gz - bot.pathGoal.z);
    if (bot.path === null || ctx.now >= bot.repathAt || drift > GOAL_DRIFT) {
      bot.path = ctx.nav.findPath(body, scratch);
      bot.pathIndex = 0;
      bot.pathGoal.x = gx;
      bot.pathGoal.z = gz;
      bot.repathAt = ctx.now + bot.stats.repathInterval;
    }
    const path = bot.path;
    if (path !== null && bot.pathIndex < path.length) {
      // Drop waypoints already reached.
      while (bot.pathIndex < path.length - 1) {
        ctx.nav.centre(path[bot.pathIndex] ?? 0, scratch);
        if (Math.hypot(scratch.x - body.x, scratch.z - body.z) > WAYPOINT_REACHED) break;
        bot.pathIndex++;
      }
      // Aim at the farthest of the next few waypoints we can walk straight to.
      ctx.nav.centre(path[bot.pathIndex] ?? 0, scratch);
      aimX = scratch.x;
      aimZ = scratch.z;
      const last = Math.min(path.length - 1, bot.pathIndex + LOOK_AHEAD);
      for (let k = last; k > bot.pathIndex; k--) {
        ctx.nav.centre(path[k] ?? 0, scratch);
        if (ctx.nav.segmentWalkable(body, scratch)) {
          aimX = scratch.x;
          aimZ = scratch.z;
          break;
        }
      }
    }
    // No path (unreachable, or the search gave up): walk straight and let the stuck detector decide.
  }

  let mx = aimX - body.x;
  let mz = aimZ - body.z;
  const len = Math.hypot(mx, mz);
  if (len < 1e-6) {
    setInput(bot, NO_MOVE);
    return;
  }
  mx /= len;
  mz /= len;
  // Keep apart from other bots (they don't collide with each other).
  for (const other of ctx.bots) {
    if (other === bot || other.status === CrsStatus.Out) continue;
    const ox = body.x - other.body.x;
    const oz = body.z - other.body.z;
    const range = bot.stats.radius + other.stats.radius + CRS_SEPARATION;
    const d = Math.hypot(ox, oz);
    if (d >= range) continue;
    if (d < 1e-6) {
      // Exactly stacked: split by id so the two go opposite ways.
      const side = bot.id < other.id ? 1 : -1;
      const px = -mz * side;
      const pz = mx * side;
      mx += px;
      mz += pz;
      continue;
    }
    const w = (range - d) / range;
    mx += (ox / d) * w;
    mz += (oz / d) * w;
  }
  const n = Math.hypot(mx, mz);
  if (n < 1e-6) setInput(bot, NO_MOVE);
  else {
    bot.input.x = mx / n;
    bot.input.z = mz / n;
  }
}

/**
 * No real progress for CRS_STUCK_TIME while trying to walk: drop the path so
 * the next tick searches again; stuck twice in a row while chasing, give up
 * on that target for CRS_GIVE_UP_TIME and look for another.
 */
export function detectStuck(bot: CrsBot, now: number): void {
  const body = bot.body;
  const moving = (bot.input.x !== 0 || bot.input.z !== 0) && !isDown(body);
  const moved = Math.hypot(body.x - bot.anchor.x, body.z - bot.anchor.z);
  if (!moving || moved >= CRS_STUCK_PROGRESS) {
    bot.anchor.x = body.x;
    bot.anchor.z = body.z;
    bot.anchorAt = now;
    if (moving) bot.stuckCount = 0;
    return;
  }
  if (now - bot.anchorAt < CRS_STUCK_TIME) return;
  bot.anchorAt = now;
  bot.path = null;
  bot.repathAt = 0;
  bot.stuckCount++;
  if (bot.stuckCount >= 2 && bot.targetId !== null) {
    bot.ignoreId = bot.targetId;
    bot.ignoreUntil = now + CRS_GIVE_UP_TIME;
    bot.targetId = null;
    bot.retargetAt = 0;
    bot.stuckCount = 0;
  }
}

function setInput(bot: CrsBot, v: Vec2): void {
  bot.input.x = v.x;
  bot.input.z = v.z;
}

function nearest(from: Vec2, points: readonly Vec2[]): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - from.x) ** 2 + (p.z - from.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
