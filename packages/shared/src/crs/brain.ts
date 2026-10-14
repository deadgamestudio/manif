/**
 * The base police bot (#5): what one bot does each fixed tick.
 *
 *   active ──touches a weakened protester──> wind-up ──time, still in reach──> grabbing ──at the van──> active
 *     │  └─(in reach) baton hit                │ dodge, hop, hit, out of reach:     │ stunned or knocked down: lets go
 *     │                                        └─ cancelled (grab cooldown)         │ rescued or struggled free (#10, #70)
 *     └──stun──> stunned ──time──> active
 *   any ──0 HP──> out ──time──> removed by the room
 *
 * Grabs (#70): only a weakened protester (down, or at or below
 * GRAB_HP_THRESHOLD HP) is grabbed, after a wind-up the clients see
 * (`windupId`); then the bot drags them to the nearest reachable police van
 * and they are arrested on arrival, after at least DRAG_MIN_TIME (the
 * room's fallback timer ends a drag that never gets there).
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
import { DRAG_MIN_TIME, PlayerStatus } from "../health/index.js";
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
  GRAB_HP_THRESHOLD,
  GRAB_WINDUP_SLACK,
  CrsMount,
  CrsStatus,
  type CrsKind,
  type CrsStats,
} from "./constants.js";
import type { NavGrid } from "./nav.js";
import {
  SPLAT_GAS_SCATTER,
  SPLAT_SPEED_FACTOR,
  SPLAT_WOBBLE_ANGLE,
  SPLAT_WOBBLE_SPEED,
  STINK_KEEP_AWAY,
  STINK_PUSH,
  isBackingOff,
  isSplatted,
  isStinky,
} from "./status.js";
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
  /** A grab winding up (#70): the protester it will grab, or null. Synced as `Crs.windup` for the tell. */
  windupId: string | null;
  /** Room time the wind-up ends and the grab lands. */
  windupUntil: number;
  /**
   * While grabbing (#70): when the grab landed, the van it drags to (an index
   * into `CrsContext.vans`, -1 for none), and how much slower this protester
   * drags (`CrsHost.dragFactor`, 1 otherwise).
   */
  grabbedAt: number;
  dragVan: number;
  dragFactor: number;
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
  /** Status timers from thrown items (#15), see crs/status.ts: room times until which each lasts. */
  splatUntil: number;
  stinkUntil: number;
  backOffUntil: number;
  /** What it rides (#13, BRAV-M); `Foot` for every other unit. */
  mount: CrsMount;
  /** The bike's own state while ridden (#13, see bravm.ts); null on foot. */
  ride: BikeRide | null;
  /** A BRAV-M passenger on foot (#13): the bike it hopped off, which waits for it. Null otherwise. */
  bikeId: string | null;
  /** Passenger: room time when its job is over (or it landed a hit), then it walks back to the bike. */
  missionUntil: number;
  /** Disguised units (#13, BAC): false while it still looks like a protester. Always true for the others. */
  revealed: boolean;
  /** BAC: room time when it stops blending in and sidles up to someone. */
  stalkAt: number;
  /** Set when the bot leaves the street on its own (a BRAV-M riding off, #13): the squad removes it, no "out". */
  gone: boolean;
}

/** A ridden bike's plan (#13): charge a protester, wait while the passenger works, ride off. */
export interface BikeRide {
  phase: "charge" | "wait" | "leave";
  /** Room time the current phase started. */
  phaseAt: number;
  /** The passenger on foot while waiting, by bot id. */
  passengerId: string | null;
  /** Where it rides off to (its spawn point). */
  readonly exit: Vec2;
  /** Next room time a ram may floor someone. */
  ramReadyAt: number;
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
    windupId: null,
    windupUntil: 0,
    grabbedAt: 0,
    dragVan: -1,
    dragFactor: 1,
    anchor: { x, z },
    anchorAt: 0,
    stuckCount: 0,
    staggerCount: 0,
    lastHitAt: -Infinity,
    input: { x: 0, z: 0 },
    gasReadyAt: now + stats.gasCooldown / 2,
    splatUntil: 0,
    stinkUntil: 0,
    backOffUntil: 0,
    mount: CrsMount.Foot,
    ride: null,
    bikeId: null,
    missionUntil: 0,
    revealed: stats.disguise === undefined,
    stalkAt: now + (stats.disguise?.blendMin ?? 0),
    gone: false,
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
  /** Bot `by` swings its baton and misses (#15: splatted, it can't see). Only shown. Optional. */
  batonMiss?(by: string): void;
  /**
   * Start a grab, arrested after `duration` (the fallback, #70) unless the van
   * is reached first. False if the protester is not free (already grabbed,
   * KO...), immune or gone.
   */
  grab(id: string, duration: number): boolean;
  /**
   * Whether a grab would take right now (free, not immune, not carried...),
   * checked before a wind-up starts (#70). Optional: absent, the free status
   * alone decides, and `grab` may still refuse at the end.
   */
  canGrab?(id: string): boolean;
  /** The drag reached the van (#70): the protester goes in (arrested) on the room's next tick. */
  arrest(id: string): void;
  /**
   * How much slower protester `id` is to drag (#14: a gilet jaune, a retraité,
   * a bobo filming), at least 1: the drag speed is divided by it and the
   * minimum drag time multiplied. Optional: 1 when absent.
   */
  dragFactor?(id: string): number;
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

/**
 * Whatever walks with `steerTo` (#59: protester bots too): a body, a cached
 * path and a walking direction. A `CrsBot` is one.
 */
export interface NavAgent {
  readonly id: string;
  readonly body: Vec2;
  readonly stats: { readonly radius: number; readonly repathInterval: number };
  path: number[] | null;
  pathIndex: number;
  readonly pathGoal: Vec2;
  repathAt: number;
  readonly input: Vec2;
}

/** What `steerTo` needs of the world: the grid, the time, and the police bots to keep apart from (none for a protester bot). */
export interface NavContext {
  nav: NavGrid;
  now: number;
  bots: readonly CrsBot[];
}

/** Whatever `detectStuck` watches (#59: protester bots too). A `CrsBot` is one. */
export interface StuckAgent {
  readonly body: Readonly<Body>;
  readonly input: Vec2;
  readonly anchor: Vec2;
  anchorAt: number;
  path: number[] | null;
  repathAt: number;
  stuckCount: number;
  targetId: string | null;
  ignoreId: string | null;
  ignoreUntil: number;
  retargetAt: number;
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
  /** While grabbing: set `bot.input` towards the van, and hand the protester over (`host.arrest`) on arrival. */
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
/** A dragging bot stops this close to the van's door, and hands the protester over (#70). */
const VAN_REACHED = 0.6;
/** Vans compared by walking distance when picking where to drag (#70): the nearest few as the crow flies. */
const VAN_CANDIDATES = 3;

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
 * Whether `target` counts as weakened (#70): at or below GRAB_HP_THRESHOLD HP,
 * or knocked over by anything but a baton (every baton hit floors, so that
 * alone would make any contact a grab again).
 */
export function isWeakened(target: ProtesterView): boolean {
  return (target.down && target.batonDown !== true) || (target.hp !== undefined && target.hp <= GRAB_HP_THRESHOLD);
}

/**
 * Whether bot `bot` may start grabbing `target` (#70): a free protester who is
 * weakened (`isWeakened`), unless the unit grabs anyone (`grabAnyHp`, the
 * BAC), and whom the room would let it grab.
 */
export function canStartGrab(bot: CrsBot, target: ProtesterView, host: CrsHost): boolean {
  if (target.status !== PlayerStatus.Free) return false;
  const weakened = bot.stats.grabAnyHp === true || isWeakened(target);
  return weakened && (host.canGrab?.(target.id) ?? true);
}

/**
 * Start a grab's wind-up on `target` (#70): the bot stands, arms out, for
 * `stats.grabWindup`, then grabs if nothing foiled it (see `stepWindup`).
 */
export function startWindup(bot: CrsBot, target: ProtesterView, now: number): void {
  bot.windupId = target.id;
  bot.windupUntil = now + bot.stats.grabWindup;
  bot.path = null;
  const dx = target.x - bot.body.x;
  const dz = target.z - bot.body.z;
  if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
}

/**
 * Drop a wind-up (#70). `cooldown`: it was foiled (a dodge, a hop, a hit, out
 * of reach), so the bot waits its grab cooldown before the next try; without
 * it (the protester just stopped being free) it may try again at once.
 */
export function cancelWindup(bot: CrsBot, now: number, cooldown = true): void {
  if (bot.windupId === null) return;
  bot.windupId = null;
  if (cooldown) bot.grabReadyAt = Math.max(bot.grabReadyAt, now + bot.stats.grabCooldown);
}

/**
 * One tick of a wind-up (#70): stands facing the protester. Foiled (with the
 * grab cooldown) when they dodge, hop or get out of reach, or the bot is
 * splatted or backing off; dropped quietly if they are no longer free. When
 * the time is up and they are still there, the grab lands and the drag starts
 * towards the van picked now (`pickVan`).
 */
export function stepWindup(bot: CrsBot, ctx: CrsContext, host: CrsHost): void {
  const now = ctx.now;
  setInput(bot, NO_MOVE);
  const id = bot.windupId;
  if (id === null) return;
  const target = host.protester(id);
  if (!target || target.status !== PlayerStatus.Free) {
    cancelWindup(bot, now, false);
    return;
  }
  if (
    target.dodging === true ||
    target.airborne === true ||
    gapTo(bot, target) > bot.stats.grabReach + GRAB_WINDUP_SLACK ||
    isSplatted(bot, now) ||
    isBackingOff(bot, now)
  ) {
    cancelWindup(bot, now);
    return;
  }
  const dx = target.x - bot.body.x;
  const dz = target.z - bot.body.z;
  if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
  if (now < bot.windupUntil) return;
  bot.windupId = null;
  if (!host.grab(id, bot.stats.grabDuration)) {
    // Refused at the last moment (immune, lifted by a teammate...): a short pause, then back to work.
    bot.grabReadyAt = Math.max(bot.grabReadyAt, now + bot.stats.retargetInterval);
    return;
  }
  bot.status = CrsStatus.Grabbing;
  bot.grabbedId = id;
  bot.grabbedAt = now;
  bot.dragFactor = Math.max(1, host.dragFactor?.(id) ?? 1);
  bot.dragVan = pickVan(bot.body, ctx.vans, ctx.nav);
  bot.targetId = null;
  bot.path = null;
}

/**
 * Touching a protester it may grab (`canStartGrab`) with the grab ready: the
 * wind-up starts (#70). Else swing the baton when in reach. Only one grab per
 * protester: `host.grab` refuses anyone not free, so a second bot winding up
 * on the same protester gets nothing.
 */
export function act(bot: CrsBot, target: ProtesterView, ctx: CrsContext, host: CrsHost): boolean {
  const s = bot.stats;
  const now = ctx.now;
  const gap = gapTo(bot, target);
  const dx = target.x - bot.body.x;
  const dz = target.z - bot.body.z;
  // Splatted (#15): tomato on the visor. It swings at where it thinks you are and misses; no grab.
  if (isSplatted(bot, now)) {
    if (gap <= s.batonRange && now >= bot.batonReadyAt) {
      bot.batonReadyAt = now + s.batonCooldown;
      if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
      host.batonMiss?.(bot.id);
    }
    return gap <= s.grabReach;
  }
  if (gap <= s.grabReach && now >= bot.grabReadyAt && canStartGrab(bot, target, host)) {
    startWindup(bot, target, now);
    return true;
  }
  if (gap <= s.batonRange && now >= bot.batonReadyAt && host.canBeHurt(target.id)) {
    bot.batonReadyAt = now + s.batonCooldown;
    if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
    host.batonHit(bot.id, target.id, dx, dz, s.batonDamage, s.batonImpulse);
  }
  // Touching: stand there rather than walk through them.
  return gap <= s.grabReach;
}

/**
 * Walk to the van picked at the grab (#70), slowly; the room moves the
 * protester behind us after the body step. At the van door, the protester is
 * handed over (`host.arrest`) once the drag has lasted DRAG_MIN_TIME (times
 * the protester's drag factor); until then the bot waits there. No van at all:
 * it stands, and the room's fallback timer ends the drag.
 */
export function drag(bot: CrsBot, ctx: CrsContext, host: CrsHost): void {
  const van = ctx.vans[bot.dragVan] ?? nearest(bot.body, ctx.vans);
  if (!van) {
    setInput(bot, NO_MOVE);
    return;
  }
  if (Math.hypot(van.x - bot.body.x, van.z - bot.body.z) <= VAN_REACHED) {
    setInput(bot, NO_MOVE);
    if (bot.grabbedId !== null && ctx.now >= bot.grabbedAt + DRAG_MIN_TIME * bot.dragFactor) host.arrest(bot.grabbedId);
    return;
  }
  steerTo(bot, van.x, van.z, ctx);
}

/**
 * The van a bot at `from` drags to (#70): the one with the shortest walk on
 * `nav` among the few nearest as the crow flies; the nearest as the crow
 * flies when none can be reached (the fallback timer then ends that drag).
 * An index into `vans`, -1 when there are none.
 */
export function pickVan(from: Vec2, vans: readonly Vec2[], nav: NavGrid): number {
  const byDistance = vans.map((v, i) => ({ i, d: Math.hypot(v.x - from.x, v.z - from.z) })).sort((a, b) => a.d - b.d);
  let best = -1;
  let bestLen = Infinity;
  for (const { i } of byDistance.slice(0, VAN_CANDIDATES)) {
    const van = vans[i];
    if (!van) continue;
    const path = nav.findPath(from, van);
    if (path === null) continue;
    let len = 0;
    let x = from.x;
    let z = from.z;
    for (const cell of path) {
      nav.centre(cell, scratch);
      len += Math.hypot(scratch.x - x, scratch.z - z);
      x = scratch.x;
      z = scratch.z;
    }
    len += Math.hypot(van.x - x, van.z - z);
    if (len < bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best >= 0 ? best : (byDistance[0]?.i ?? -1);
}

export const DEFAULT_BEHAVIOUR: CrsBehaviour = {
  updateTarget,
  act,
  drag,
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
    // Out, dazed or on the floor: lets go of any grab (or the one winding up, #70) and does nothing.
    if (bot.grabbedId !== null) releaseGrab(bot, host, now);
    cancelWindup(bot, now);
    setInput(bot, NO_MOVE);
  } else if (bot.windupId !== null) {
    // Winding up a grab (#70): stands, arms out, until it grabs or something foils it.
    stepWindup(bot, ctx, host);
  } else if (bot.status === CrsStatus.Grabbing) {
    if (holdsGrab(bot, host)) {
      behaviour.drag(bot, ctx, host);
      speedFactor = s.dragSpeedFactor / bot.dragFactor;
    } else {
      // Arrested (drag over), rescued (#10) or disconnected: back to work.
      endGrab(bot, now);
      setInput(bot, NO_MOVE);
    }
  } else if (isBackingOff(bot, now)) {
    // Stinky (#15): backs away from the protesters for a moment, embarrassed. Before any orders: a line member steps out too.
    backOff(bot, ctx, host);
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
  // Splatted (#15): stumbles along, slower and wobbling left and right (the facing below keeps the intended way).
  if (isSplatted(bot, now) && (scratch.x !== 0 || scratch.z !== 0)) {
    const a = Math.sin(now * SPLAT_WOBBLE_SPEED) * SPLAT_WOBBLE_ANGLE;
    const c = Math.cos(a) * SPLAT_SPEED_FACTOR;
    const sn = Math.sin(a) * SPLAT_SPEED_FACTOR;
    const x = scratch.x;
    scratch.x = x * c + scratch.z * sn;
    scratch.z = -x * sn + scratch.z * c;
  }
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
  // Splatted (#15): it can't see where it throws.
  const scatter = isSplatted(bot, ctx.now) ? GAS_SCATTER * SPLAT_GAS_SCATTER : GAS_SCATTER;
  const to = scatterAim(bot.body, aim, scatter, GAS_MAX_RANGE, ctx.rng);
  if (!host.throwGas(bot.id, bot.body, to)) return false;
  bot.gasReadyAt = ctx.now + s.gasCooldown;
  const dx = to.x - bot.body.x;
  const dz = to.z - bot.body.z;
  if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
  return true;
}

/**
 * Stinky and embarrassed (#15): walk straight away from the target, or the
 * nearest protester in sight, or stand still with nobody around. No path:
 * it only lasts a moment, and walls stop it like anything else.
 */
export function backOff(bot: CrsBot, ctx: CrsContext, host: CrsHost): void {
  let from: Vec2 | undefined = bot.targetId === null ? undefined : host.protester(bot.targetId);
  if (!from) {
    let best = bot.stats.sight * bot.stats.sight;
    for (const p of host.protesters()) {
      const d = (p.x - bot.body.x) ** 2 + (p.z - bot.body.z) ** 2;
      if (d < best) {
        best = d;
        from = p;
      }
    }
  }
  const dx = from ? bot.body.x - from.x : 0;
  const dz = from ? bot.body.z - from.z : 0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    setInput(bot, NO_MOVE);
    return;
  }
  bot.input.x = dx / len;
  bot.input.z = dz / len;
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
  bot.dragVan = -1;
  bot.dragFactor = 1;
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
  // A pompier (#17) is never dazed: knocked over at most.
  if (bot.status === CrsStatus.Out || !(duration > 0) || bot.stats.invulnerable === true) return false;
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
  if (s.invulnerable === true) {
    // A pompier (#17): every hit floors it, none hurts it.
    const away = awayFrom(bot, fromX, fromZ);
    return { impulse: applyImpulse(bot.body, away.x, away.z, s.heavyHitImpulse, "always"), out: false };
  }
  // Any hit staggers it out of a grab's wind-up (#70).
  cancelWindup(bot, now);
  bot.staggerCount = now - bot.lastHitAt <= s.staggerWindow ? bot.staggerCount + 1 : 1;
  bot.lastHitAt = now;
  const heavy = bot.staggerCount >= s.staggerHits;
  if (heavy) bot.staggerCount = 0;
  bot.hp = Math.max(0, bot.hp - Math.max(0, damage));
  const out = bot.hp === 0;
  const away = awayFrom(bot, fromX, fromZ);
  const impulse = applyImpulse(bot.body, away.x, away.z, heavy || out ? s.heavyHitImpulse : s.hitImpulse, out ? "always" : "auto");
  if (out) knockOut(bot, now);
  return { impulse, out };
}

/** The way a hit from (fromX, fromZ) pushes the bot: away from it, or backwards when it is right on top. */
function awayFrom(bot: CrsBot, fromX: number, fromZ: number): Vec2 {
  const dx = bot.body.x - fromX;
  const dz = bot.body.z - fromZ;
  if (Math.hypot(dx, dz) < 1e-6) return { x: -Math.sin(bot.rotation), z: -Math.cos(bot.rotation) };
  return { x: dx, z: dz };
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
  // A pompier (#17): knocked over by anything that pushes it, never hurt or stunned.
  if (bot.stats.invulnerable === true) return { impulse: applyImpulse(bot.body, dirX, dirZ, impulse, impulse > 0 ? "always" : "auto"), out: false };
  // Anything thrown at it foils a grab's wind-up (#70), a tomato included.
  cancelWindup(bot, now);
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
  if (bot.status === CrsStatus.Out || !(damage > 0) || bot.stats.invulnerable === true) return false;
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
export function steerTo(bot: NavAgent, gx: number, gz: number, ctx: NavContext): void {
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
  // Keep apart from other bots (they don't collide with each other), and well away from a stinky one (#15).
  for (const other of ctx.bots) {
    if (other === bot || other.status === CrsStatus.Out) continue;
    const ox = body.x - other.body.x;
    const oz = body.z - other.body.z;
    const stinky = isStinky(other, ctx.now);
    const range = bot.stats.radius + other.stats.radius + (stinky ? STINK_KEEP_AWAY : CRS_SEPARATION);
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
    const w = ((range - d) / range) * (stinky ? STINK_PUSH : 1);
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
export function detectStuck(bot: StuckAgent, now: number): void {
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

function setInput(bot: { readonly input: Vec2 }, v: Vec2): void {
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
