/**
 * Tear gas (#7): canisters in flight, gas clouds on the ground, and what a
 * cloud does to a protester standing in it. Pure logic over plain data, timed
 * with room time (never the wall clock); the server owns the only copy that
 * matters and mirrors a few fields into Schema.
 *
 * 1. A CRS picks a spot where protesters bunch up (`pickGasAim`, see the CRS
 *    brain for who throws when) and the field launches a canister there,
 *    under the cap (`GasField.launch`).
 * 2. The canister lobs for CANISTER_FLIGHT_TIME along a straight ground path,
 *    swept against walls, obstacles and props (`stepCanister`): it stops at
 *    the first one and lands there.
 * 3. Where it lands, a round cloud of GAS_RADIUS sits for GAS_DURATION, then
 *    goes (`GasField.step`).
 * 4. A protester the cloud reaches (inside it and in line of sight of its
 *    centre, so never through a wall) is gassed: damage every
 *    GAS_DAMAGE_INTERVAL and GAS_SLOW speed, lasting GAS_LINGER after leaving
 *    (`stepExposure`). Two overlapping clouds count as one.
 */
import { PlayerStatus } from "../health/index.js";
import { hasLineOfSight, type Obstacles } from "../melee/index.js";
import { resolveCircle, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { wallEntry } from "../throwable/index.js";
import {
  CANISTER_FLIGHT_TIME,
  CANISTER_RADIUS,
  GAS_DAMAGE,
  GAS_DAMAGE_INTERVAL,
  GAS_DURATION,
  GAS_LINGER,
  GAS_MAX_RANGE,
  GAS_MIN_GROUP,
  GAS_MIN_RANGE,
  GAS_RADIUS,
  GAS_SCATTER,
  GAS_SLOW,
  GAS_SQUAD_INTERVAL,
  MAX_GAS_CLOUDS,
} from "./constants.js";

/** Timer slack, so a tick landing on a boundary counts (room time adds up 1/TICK_RATE steps). */
const EPS = 1e-9;

/** A gas cloud on the ground. */
export interface GasCloud extends Vec2 {
  radius: number;
  /** Room time when it goes. */
  endsAt: number;
}

/** Whether `p` is inside the cloud's circle (the edge counts). Walls are not checked: see `cloudReaches`. */
export function inGasCloud(p: Vec2, cloud: GasCloud): boolean {
  return (p.x - cloud.x) ** 2 + (p.z - cloud.z) ** 2 <= cloud.radius * cloud.radius + EPS;
}

/** Whether the cloud reaches `p`: inside its circle, and nothing solid between its centre and `p` (no gas through walls). */
export function cloudReaches(cloud: GasCloud, p: Vec2, obstacles: Obstacles): boolean {
  return inGasCloud(p, cloud) && hasLineOfSight(obstacles, cloud, p);
}

/**
 * Whether any live cloud (not yet ended at `now`) reaches `p`. A yes or a no:
 * standing where two clouds overlap is the same as standing in one, so the
 * damage never stacks.
 */
export function inAnyCloud(p: Vec2, clouds: Iterable<GasCloud>, obstacles: Obstacles, now: number): boolean {
  for (const c of clouds) {
    if (now < c.endsAt && cloudReaches(c, p, obstacles)) return true;
  }
  return false;
}

/** One protester's gas state: how long the cough lasts and when the next damage tick is due. */
export interface GasExposure {
  /** Room time when the effect stops (GAS_LINGER after leaving the cloud). */
  until: number;
  nextDamageAt: number;
}

export function createExposure(): GasExposure {
  return { until: -Infinity, nextDamageAt: Infinity };
}

/** Gassed right now: coughing, slowed and losing HP. */
export function isGassed(e: GasExposure, now: number): boolean {
  return now < e.until;
}

/** Walking speed multiplier: GAS_SLOW while gassed, else 1. */
export function gasSpeedFactor(e: GasExposure, now: number): number {
  return isGassed(e, now) ? GAS_SLOW : 1;
}

/**
 * One tick of exposure (mutates `e`). `inside` says whether a cloud reaches
 * the protester this tick. Entering starts the effect: the first damage comes
 * GAS_DAMAGE_INTERVAL later, then one every interval while the effect lasts,
 * which is GAS_LINGER past the last tick inside. Returns the HP to take off
 * this tick (0 or GAS_DAMAGE).
 *
 * KO and arrested protesters are out of it: no damage, and their exposure is
 * cleared (their health timers are not touched; the room never calls damage).
 */
export function stepExposure(e: GasExposure, inside: boolean, status: number, now: number): number {
  if (status === PlayerStatus.Ko || status === PlayerStatus.Arrested) {
    e.until = -Infinity;
    e.nextDamageAt = Infinity;
    return 0;
  }
  if (inside) {
    if (!isGassed(e, now)) e.nextDamageAt = now + GAS_DAMAGE_INTERVAL;
    e.until = now + GAS_LINGER;
  }
  if (!isGassed(e, now) || now + EPS < e.nextDamageAt) return 0;
  e.nextDamageAt += GAS_DAMAGE_INTERVAL;
  return GAS_DAMAGE;
}

/** What a thrower sees of a protester. `ProtesterView` from the CRS fits it. */
export interface GasTargetView extends Vec2 {
  status: number;
}

/**
 * Where a bot at `from` should throw: the middle of the biggest bunch of free
 * protesters, anchored on one of them between `minRange` and `maxRange` away.
 * A bunch is everyone free within `radius` of that anchor (so the cloud would
 * cover them). Ties go to the nearest anchor. Null when no bunch has at least
 * `minGroup` people. No scatter: see `scatterAim`.
 */
export function pickGasAim(
  from: Vec2,
  protesters: Iterable<GasTargetView>,
  minRange = GAS_MIN_RANGE,
  maxRange = GAS_MAX_RANGE,
  radius = GAS_RADIUS,
  minGroup = GAS_MIN_GROUP,
): Vec2 | null {
  const free: Vec2[] = [];
  for (const p of protesters) if (p.status === PlayerStatus.Free) free.push(p);
  let best: Vec2 | null = null;
  let bestCount = 0;
  let bestD = Infinity;
  const r2 = radius * radius + EPS;
  for (const anchor of free) {
    const d = Math.hypot(anchor.x - from.x, anchor.z - from.z);
    if (d < minRange || d > maxRange) continue;
    let count = 0;
    let sx = 0;
    let sz = 0;
    for (const p of free) {
      if ((p.x - anchor.x) ** 2 + (p.z - anchor.z) ** 2 > r2) continue;
      count++;
      sx += p.x;
      sz += p.z;
    }
    if (count > bestCount || (count === bestCount && d < bestD)) {
      bestCount = count;
      bestD = d;
      best = { x: sx / count, z: sz / count };
    }
  }
  return bestCount >= Math.max(1, minGroup) ? best : null;
}

/**
 * Throw a little off: `aim` moved by up to `amount` in a random direction,
 * then kept within `maxRange` of `from`. `rng` returns [0, 1) (Math.random by
 * default; tests pass their own).
 */
export function scatterAim(from: Vec2, aim: Vec2, amount = GAS_SCATTER, maxRange = GAS_MAX_RANGE, rng: () => number = Math.random): Vec2 {
  const angle = rng() * Math.PI * 2;
  const dist = amount * Math.sqrt(rng());
  let x = aim.x + Math.sin(angle) * dist;
  let z = aim.z + Math.cos(angle) * dist;
  const dx = x - from.x;
  const dz = z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > maxRange) {
    x = from.x + (dx / d) * maxRange;
    z = from.z + (dz / d) * maxRange;
  }
  return { x, z };
}

/** A canister in flight. Server-only; the start and end points are synced once, at launch. */
export interface Canister extends Vec2 {
  id: string;
  /** CRS id of the thrower. */
  by: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** Seconds since the throw. */
  age: number;
}

export function createCanister(id: string, by: string, from: Vec2, to: Vec2): Canister {
  return { id, by, x: from.x, z: from.z, fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, age: 0 };
}

export type CanisterStep = { type: "flying" } | { type: "landed"; x: number; z: number; blocked: boolean };

/** How far short of a wall a blocked canister stops. */
const CANISTER_BACKOFF = 0.05;

/**
 * Move a canister one tick (mutates `c`): it covers the ground from its start
 * to its target in CANISTER_FLIGHT_TIME, at an even pace (the arc is drawn by
 * the client). The move is swept against `world`, so it stops at the first
 * wall, obstacle, prop or street edge on the way and lands there; otherwise it
 * lands on its target. The landing spot is pushed clear of anything solid, so
 * a cloud's centre is never inside a wall.
 */
export function stepCanister(c: Canister, dt: number, world: CollisionWorld): CanisterStep {
  c.age += dt;
  // Summed ticks drift a hair short of the flight time: the last one still lands.
  const t = c.age + 1e-6 >= CANISTER_FLIGHT_TIME ? 1 : c.age / CANISTER_FLIGHT_TIME;
  const a: Vec2 = { x: c.x, z: c.z };
  const b: Vec2 = { x: c.fromX + (c.toX - c.fromX) * t, z: c.fromZ + (c.toZ - c.fromZ) * t };
  const hit = wallEntry(a, b, world, CANISTER_RADIUS);
  const land = (blocked: boolean): CanisterStep => {
    const res = resolveCircle(world, c.x, c.z, CANISTER_RADIUS);
    c.x = res.x;
    c.z = res.z;
    return { type: "landed", x: c.x, z: c.z, blocked };
  };
  if (hit <= 1) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = len > 0 ? Math.max(0, hit - CANISTER_BACKOFF / len) : 0;
    c.x = a.x + (b.x - a.x) * k;
    c.z = a.z + (b.z - a.z) * k;
    return land(true);
  }
  c.x = b.x;
  c.z = b.z;
  return t >= 1 ? land(false) : { type: "flying" };
}

/** Told about every change, so the server can mirror canisters and clouds into Schema. */
export interface GasFieldHooks {
  canisterAdded(c: Canister): void;
  canisterRemoved(id: string): void;
  cloudAdded(id: string, cloud: GasCloud): void;
  cloudRemoved(id: string): void;
}

/**
 * Every canister in flight and every cloud of one room. At most `cap` of them
 * together (a canister counts from the throw, so the cap still holds when it
 * lands), and at most one throw every `interval` seconds for the whole room.
 */
export class GasField {
  private readonly clouds = new Map<string, GasCloud>();
  private readonly flying: Canister[] = [];
  private counter = 0;
  private nextThrowAt = 0;

  constructor(
    private readonly hooks?: GasFieldHooks,
    private readonly cap = MAX_GAS_CLOUDS,
    private readonly interval = GAS_SQUAD_INTERVAL,
  ) {}

  /** Clouds plus canisters in flight: never more than the cap. */
  get liveCount(): number {
    return this.clouds.size + this.flying.length;
  }

  get cloudCount(): number {
    return this.clouds.size;
  }

  cloudEntries(): IterableIterator<[string, GasCloud]> {
    return this.clouds.entries();
  }

  cloudValues(): IterableIterator<GasCloud> {
    return this.clouds.values();
  }

  /** Whether a throw at `now` would be accepted (under the cap, the room's interval passed). */
  canLaunch(now: number): boolean {
    return this.liveCount < this.cap && now + EPS >= this.nextThrowAt;
  }

  /** Throw a canister from `from` to `to`. Null if refused (see `canLaunch`). */
  launch(by: string, from: Vec2, to: Vec2, now: number): Canister | null {
    if (!this.canLaunch(now)) return null;
    const c = createCanister(`gas-${++this.counter}`, by, from, to);
    this.flying.push(c);
    this.nextThrowAt = now + this.interval;
    this.hooks?.canisterAdded(c);
    return c;
  }

  /**
   * One tick at room time `now`: clouds that have run their GAS_DURATION go,
   * then canisters fly and the ones that land turn into clouds (ending at
   * `now + duration`). Returns the clouds that appeared this tick.
   */
  step(dt: number, now: number, world: CollisionWorld, duration = GAS_DURATION, radius = GAS_RADIUS): GasCloud[] {
    for (const [id, cloud] of this.clouds) {
      if (now + EPS >= cloud.endsAt) {
        this.clouds.delete(id);
        this.hooks?.cloudRemoved(id);
      }
    }
    const landed: GasCloud[] = [];
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i]!;
      const res = stepCanister(c, dt, world);
      if (res.type === "flying") continue;
      this.flying.splice(i, 1);
      this.hooks?.canisterRemoved(c.id);
      const cloud: GasCloud = { x: res.x, z: res.z, radius, endsAt: now + duration };
      // Same id as its canister: the client sees one become the other.
      this.clouds.set(c.id, cloud);
      this.hooks?.cloudAdded(c.id, cloud);
      landed.push(cloud);
    }
    return landed;
  }

  /** Remove everything (a new march). */
  clear(): void {
    for (const c of this.flying) this.hooks?.canisterRemoved(c.id);
    this.flying.length = 0;
    for (const id of this.clouds.keys()) this.hooks?.cloudRemoved(id);
    this.clouds.clear();
    this.nextThrowAt = 0;
  }
}
