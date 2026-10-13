/**
 * The BRAV-M (#13): police on motorbikes, two per bike. While ridden, one bot
 * is the whole bike (`mount` Duo or Solo, one entity per duo):
 *
 *   charge ──target's edge within dropRange──> wait (passenger hops off) ──passenger back on──> leave ──exit──> gone
 *     │                                          └──passenger grabbing, out, or too slow──────> leave (driver alone)
 *     └──no progress for blockedTime (charge or leave)──> dismount: both go on on foot, the bike stays lying there
 *   ridden ──knocked down (a heavy hit, a pavé, a slip) or 0 HP──> knocked off: both riders tumble, the bike skids away
 *
 * The passenger on foot is an ordinary BRAV-M bot (`bikeId` set): it goes for
 * the bike's target, and once it has swung its baton (or `dropTime` is over)
 * it walks back to the bike: hit and run. Only a target already on the
 * ground when it gets there is grabbed; it then drags its catch to the van
 * like any bot, and the bike leaves without it.
 *
 * Speed (the trap of #13): the bike moves with `stepBody`, which sub-steps
 * against walls and props, and its swept path is checked against every
 * protester (`sweepProtesters`): it stops at the first one it touches, which
 * is knocked over (a ram, no damage, never a grab). So at full speed it never
 * passes through a wall or a protester.
 *
 * Plain functions over a `CrsBot`; the squad spawns and removes the extra
 * bots (the passenger, the wreck) when `stepBike` or a knock-off says so.
 */
import { PlayerStatus } from "../health/index.js";
import { isDown, knockDown, resolveCircle, stepBody, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { act, DEFAULT_BEHAVIOUR, steerTo, type BikeRide, type CrsBehaviour, type CrsBot, type CrsContext, type CrsHost } from "./brain.js";
import { CrsMount, CrsStatus, type BikeStats } from "./constants.js";
import { SPLAT_SPEED_FACTOR, SPLAT_WOBBLE_ANGLE, SPLAT_WOBBLE_SPEED, isSplatted } from "./status.js";
import { pickTarget, type ProtesterView } from "./targeting.js";

/** What the squad must do after a bike's tick. */
export type BikeEvent =
  /** The bike stopped by its target: spawn the passenger beside it, going for `targetId`. */
  | { type: "drop"; targetId: string | null }
  /** Stuck for `blockedTime`: both riders get off and go on on foot. */
  | { type: "dismount" }
  /** Rode off the street: remove it (not "out", nobody took it down). */
  | { type: "gone" };

/** The bike row of a BRAV-M bot. Throws for a unit without one: a programming error. */
export function bikeOf(bot: CrsBot): BikeStats {
  const bike = bot.stats.bike;
  if (!bike) throw new Error(`${bot.id} has no bike`);
  return bike;
}

/** On its bike with both riders, about to charge; it rides back to (x, z) when done (its spawn point). */
export function mountBike(bot: CrsBot, now: number): void {
  const bike = bikeOf(bot);
  bot.mount = CrsMount.Duo;
  bot.hp = bike.hp;
  bot.ride = { phase: "charge", phaseAt: now, passengerId: null, exit: { x: bot.post.x, z: bot.post.z }, ramReadyAt: 0 };
  bot.anchor.x = bot.body.x;
  bot.anchor.z = bot.body.z;
  bot.anchorAt = now;
}

export function isRiding(bot: CrsBot): boolean {
  return bot.mount === CrsMount.Duo || bot.mount === CrsMount.Solo;
}

/**
 * The first protester the bike's swept path from `from` to its body touches
 * this tick (`t` in [0, 1] along the path), or null. Only protesters with a
 * body in the street count (free or KO); one already touching counts only if
 * the bike moves towards it.
 */
export function sweepProtesters(
  from: Vec2,
  to: Vec2,
  radius: number,
  protesters: Iterable<ProtesterView>,
): { protester: ProtesterView; t: number } | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  let best: { protester: ProtesterView; t: number } | null = null;
  for (const p of protesters) {
    if (p.status !== PlayerStatus.Free && p.status !== PlayerStatus.Ko) continue;
    const r = radius + PLAYER_RADIUS;
    const fx = from.x - p.x;
    const fz = from.z - p.z;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    let t: number;
    if (c <= 0) {
      // Already touching: a contact only if moving into them.
      if (!(b < 0)) continue;
      t = 0;
    } else {
      if (a < 1e-12) continue;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) continue;
    }
    if (!best || t < best.t) best = { protester: p, t };
  }
  return best;
}

const scratch: Vec2 = { x: 0, z: 0 };
const from: Vec2 = { x: 0, z: 0 };

/**
 * Move a ridden bike by its input for one tick: walls and props stop it
 * (`stepBody` sub-steps), then a protester in the way stops it at the contact
 * and, if the ram is ready, is knocked over along the ride.
 */
function rideBody(bot: CrsBot, ctx: CrsContext, host: CrsHost, bike: BikeStats, ride: BikeRide): void {
  const body = bot.body;
  from.x = body.x;
  from.z = body.z;
  scratch.x = bot.input.x;
  scratch.z = bot.input.z;
  // Splatted (#15): the driver can't see, the bike weaves about.
  if (isSplatted(bot, ctx.now) && (scratch.x !== 0 || scratch.z !== 0)) {
    const a = Math.sin(ctx.now * SPLAT_WOBBLE_SPEED) * SPLAT_WOBBLE_ANGLE;
    const c = Math.cos(a) * SPLAT_SPEED_FACTOR;
    const sn = Math.sin(a) * SPLAT_SPEED_FACTOR;
    const x = scratch.x;
    scratch.x = x * c + scratch.z * sn;
    scratch.z = -x * sn + scratch.z * c;
  }
  stepBody(ctx.world, body, scratch, bike.speed, bike.radius, ctx.dt);
  const hit = sweepProtesters(from, body, bike.radius, host.protesters());
  if (!hit) return;
  const mx = body.x - from.x;
  const mz = body.z - from.z;
  const len = Math.hypot(mx, mz);
  // Back off a hair from the exact contact, then make sure that spot is clear of the world.
  const t = len > 1e-9 ? Math.max(0, hit.t - 0.01 / len) : 0;
  const stop = resolveCircle(ctx.world, from.x + mx * t, from.z + mz * t, bike.radius);
  body.x = stop.x;
  body.z = stop.z;
  body.vx = 0;
  body.vz = 0;
  if (ctx.now < ride.ramReadyAt) return;
  ride.ramReadyAt = ctx.now + bike.ramCooldown;
  const p = hit.protester;
  // Along the ride, and away from the bike's centre so they fly out of its way.
  let nx = p.x - body.x;
  let nz = p.z - body.z;
  const n = Math.hypot(nx, nz) || 1;
  nx /= n;
  nz /= n;
  const ux = len > 1e-9 ? mx / len : nx;
  const uz = len > 1e-9 ? mz / len : nz;
  host.shove(bot.id, p.id, ux + nx, uz + nz, bike.ramImpulse, true);
}

function stand(bot: CrsBot): void {
  bot.input.x = 0;
  bot.input.z = 0;
}

function setPhase(ride: BikeRide, phase: BikeRide["phase"], now: number): void {
  ride.phase = phase;
  ride.phaseAt = now;
}

/** Riding the bike to (gx, gz) on the bike's grid (`ctx.nav` is the bike's, see the squad). */
function rideTo(bot: CrsBot, gx: number, gz: number, ctx: CrsContext): void {
  steerTo(bot, gx, gz, ctx);
}

/**
 * One fixed tick for a ridden bike. `ctx.nav` must be a grid cleared for the
 * bike's radius. Returns what the squad must do, or null. A bike that is
 * down or out does nothing here: the squad knocks its riders off first.
 */
export function stepBike(bot: CrsBot, ctx: CrsContext, host: CrsHost): BikeEvent | null {
  const bike = bikeOf(bot);
  const ride = bot.ride;
  if (!ride || !isRiding(bot)) return null;
  const now = ctx.now;
  if (bot.status === CrsStatus.Stunned && now >= bot.statusUntil) bot.status = CrsStatus.Active;
  let event: BikeEvent | null = null;
  let moving = false;

  if (bot.status !== CrsStatus.Active || isDown(bot.body)) stand(bot);
  else if (ride.phase === "charge") {
    if (now >= bot.retargetAt || bot.targetId === null) {
      bot.targetId = pickTarget(bot.body, host.protesters(), bike.sight, bot.targetId, bot.stats.switchMargin);
      bot.retargetAt = now + bot.stats.retargetInterval;
    }
    const target = bot.targetId === null ? undefined : host.protester(bot.targetId);
    const free = target !== undefined && target.status === PlayerStatus.Free;
    if (!free) {
      bot.targetId = null;
      stand(bot);
    } else if (Math.hypot(target.x - bot.body.x, target.z - bot.body.z) - bike.radius - PLAYER_RADIUS <= bike.dropRange) {
      // Brake by the target: the passenger hops off (or, alone, nothing to do here: leave).
      stand(bot);
      const dx = target.x - bot.body.x;
      const dz = target.z - bot.body.z;
      if (dx !== 0 || dz !== 0) bot.rotation = Math.atan2(dx, dz);
      if (bot.mount === CrsMount.Duo) {
        setPhase(ride, "wait", now);
        event = { type: "drop", targetId: target.id };
      } else setPhase(ride, "leave", now);
    } else {
      rideTo(bot, target.x, target.z, ctx);
      moving = true;
    }
  } else if (ride.phase === "wait") {
    stand(bot);
    const passenger = ride.passengerId === null ? undefined : ctx.bots.find((b) => b.id === ride.passengerId);
    const late = now >= ride.phaseAt + bike.dropTime + bike.returnTimeout;
    if (!passenger || passenger.bikeId !== bot.id || passenger.status === CrsStatus.Out || passenger.status === CrsStatus.Grabbing || late) {
      // The passenger is busy dragging someone, out, or dawdling: the driver leaves alone.
      if (passenger && passenger.bikeId === bot.id) passenger.bikeId = null;
      ride.passengerId = null;
      setPhase(ride, "leave", now);
    }
  } else {
    const gap = Math.hypot(ride.exit.x - bot.body.x, ride.exit.z - bot.body.z);
    if (gap <= bike.exitReach || now >= ride.phaseAt + bike.leaveTimeout) {
      stand(bot);
      bot.gone = true;
      return { type: "gone" };
    }
    rideTo(bot, ride.exit.x, ride.exit.z, ctx);
    moving = true;
  }

  rideBody(bot, ctx, host, bike, ride);
  if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
  if (event === null && blocked(bot, bike, moving, now)) return { type: "dismount" };
  return event;
}

/** Stuck detector for a ridden bike: true once it has tried to ride for `blockedTime` without `blockedProgress`. */
function blocked(bot: CrsBot, bike: BikeStats, moving: boolean, now: number): boolean {
  const body = bot.body;
  if (!moving || Math.hypot(body.x - bot.anchor.x, body.z - bot.anchor.z) >= bike.blockedProgress) {
    bot.anchor.x = body.x;
    bot.anchor.z = body.z;
    bot.anchorAt = now;
    return false;
  }
  return now - bot.anchorAt >= bike.blockedTime;
}

/**
 * The riders leave the bike (#13): this bot becomes the driver on foot, with
 * its full HP as a rider. `tumble`: knocked off (it stays down, sliding with
 * the hit); otherwise it simply steps off (blocked). Returns whether a
 * passenger was on board (the squad then spawns them).
 */
export function leaveBike(bot: CrsBot, now: number, tumble: boolean): boolean {
  const hadPassenger = bot.mount === CrsMount.Duo;
  bot.mount = CrsMount.Foot;
  bot.ride = null;
  bot.hp = bot.stats.maxHp;
  bot.targetId = null;
  bot.path = null;
  bot.retargetAt = 0;
  if (bot.status === CrsStatus.Out || bot.status === CrsStatus.Grabbing) bot.status = CrsStatus.Active;
  if (tumble) {
    bot.body.downTime = 0;
    bot.body.immuneTime = 0;
    knockDown(bot.body);
  }
  // Fresh post: where it fell, so with nobody around it does not wander back up the street.
  bot.post.x = bot.body.x;
  bot.post.z = bot.body.z;
  bot.anchorAt = now;
  return hadPassenger;
}

/**
 * Whether passenger `p` gets back on `bike` now: its job is done, it stands
 * near enough, and the bike still waits for it.
 */
export function canRemount(p: CrsBot, bike: CrsBot, now: number): boolean {
  const ride = bike.ride;
  if (!ride || ride.phase !== "wait" || ride.passengerId !== p.id || p.bikeId !== bike.id) return false;
  if (p.status !== CrsStatus.Active || isDown(p.body) || now < p.missionUntil) return false;
  const gap = Math.hypot(p.body.x - bike.body.x, p.body.z - bike.body.z) - p.stats.radius - bikeOf(bike).radius;
  return gap <= bikeOf(bike).remountReach;
}

/** The passenger is back on: one bot again, riding off. */
export function remount(bike: CrsBot, now: number): void {
  const ride = bike.ride;
  if (!ride) return;
  bike.mount = CrsMount.Duo;
  ride.passengerId = null;
  setPhase(ride, "leave", now);
  bike.anchor.x = bike.body.x;
  bike.anchor.z = bike.body.z;
  bike.anchorAt = now;
}

/**
 * A passenger's standing orders (BRAV-M on foot with a waiting bike): hunt
 * until `missionUntil`, then walk back to the bike. Returns false (hunt as
 * usual) while the job is on or when the bike no longer waits for it.
 */
export function passengerOrders(bot: CrsBot, ctx: CrsContext): boolean {
  if (bot.bikeId === null) return false;
  const bike = ctx.bots.find((b) => b.id === bot.bikeId);
  if (!bike || bike.ride?.phase !== "wait" || bike.ride.passengerId !== bot.id) {
    bot.bikeId = null;
    return false;
  }
  if (ctx.now < bot.missionUntil) return false;
  steerTo(bot, bike.body.x, bike.body.z, ctx);
  if (bot.input.x !== 0 || bot.input.z !== 0) bot.rotation = Math.atan2(bot.input.x, bot.input.z);
  return true;
}

/**
 * A passenger's act: the base one (so it grabs someone already on the
 * ground, e.g. rammed), but a baton swing ends its job: hit and run, it heads
 * back to the bike right after instead of grabbing the protester it just floored.
 */
const passengerAct: CrsBehaviour["act"] = (bot, target, ctx, host) => {
  const swungAt = bot.batonReadyAt;
  const stop = act(bot, target, ctx, host);
  if (bot.bikeId !== null && bot.batonReadyAt !== swungAt) {
    bot.missionUntil = Math.min(bot.missionUntil, ctx.now + PASSENGER_SWING_PAUSE);
    bot.grabReadyAt = Math.max(bot.grabReadyAt, ctx.now + PASSENGER_SWING_PAUSE + 1);
  }
  return stop;
};

/** After its swing, a passenger stands this long (the swing plays) before heading back. */
const PASSENGER_SWING_PAUSE = 0.4;

/** BRAV-M on foot: the base bot, plus the passenger's trip back to the bike. */
export const BRAVM_BEHAVIOUR: CrsBehaviour = { ...DEFAULT_BEHAVIOUR, act: passengerAct, orders: (bot, ctx) => passengerOrders(bot, ctx) };

/**
 * A wreck (an empty bike, `CrsMount.Wreck`, status out) for one tick: no
 * input, it only slides with its knockback until it stops, collided at the
 * bike's radius.
 */
export function stepWreck(world: CollisionWorld, bot: CrsBot, dt: number): void {
  const bike = bikeOf(bot);
  stand(bot);
  stepBody(world, bot.body, bot.input, bike.speed, bike.radius, dt);
}

