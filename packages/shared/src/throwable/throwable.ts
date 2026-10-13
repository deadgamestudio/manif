/**
 * Throwables (#8): items on the ground, picking one up, aiming, and the flight
 * of a thrown one. Pure logic over plain data; the server owns the only copy
 * that matters and mirrors a few fields into Schema.
 *
 * The pipeline, the same for every kind (#15 adds kinds as rows in
 * THROWABLE_TYPES):
 * 1. An item lies on the ground (`GroundItems`): from the level data, from a
 *    broken prop, or where a thrown one stopped.
 * 2. Interact picks up the nearest one within PICKUP_RANGE, empty hands only.
 * 3. A throw spawns a `Projectile` at the thrower, along the aim.
 * 4. `stepProjectile` moves it each tick with a swept test (no tunnelling):
 *    it stops on the first wall, prop or CRS, or falls at max range.
 * 5. Wherever it stops, it lies on the ground again, unless its row says it
 *    is used up (`afterCrs` / `afterMiss`: a tomato splats, #15).
 *
 * #15 adds, still table-driven: per-kind ground caps, items that go through
 * several CRS (`pierce`, each CRS hit once per throw), status effects on the
 * CRS hit (`effect`, applied by the room), and slippery items on the ground
 * (`SlipGuards`).
 *
 * Protesters are never targets (no friendly fire, no self-hits, v1).
 */
import { PlayerStatus } from "../health/index.js";
import { normalizeMove, resolveCircle, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { facingDir, segmentEntry } from "../melee/index.js";
import type { PropShape } from "../prop/index.js";
import {
  DROP_GAP,
  MAX_GROUND_ITEMS,
  PICKUP_RANGE,
  SLIP_CLEAR,
  SLIP_RANGE,
  THROWABLE_TYPES,
  ThrowableKind,
  type ItemKind,
} from "./constants.js";

/** Whether a synced uint8 names a real item (not `None`, not garbage). */
export function isItemKind(kind: number): kind is ItemKind {
  return kind !== ThrowableKind.None && (THROWABLE_TYPES as Record<number, unknown>)[kind] !== undefined;
}

/** An item lying on the ground. */
export interface GroundItem extends Vec2 {
  kind: ItemKind;
}

/** Told about every change, so the server can mirror the items into Schema. */
export interface GroundItemsHooks {
  added(id: string, item: GroundItem): void;
  removed(id: string): void;
}

/**
 * Items lying on the ground, oldest first. At most `cap` of them, and at most
 * `groundCap` of each kind (#15, e.g. 20 tomatoes): dropping one more removes
 * the oldest of that kind, then the oldest overall, so broken props can't
 * fill the street and a pavé that leaves a hand never just vanishes.
 */
export class GroundItems {
  private readonly items = new Map<string, GroundItem>();
  private readonly counts = new Map<ItemKind, number>();
  private counter = 0;

  constructor(
    private readonly hooks?: GroundItemsHooks,
    private readonly cap = MAX_GROUND_ITEMS,
  ) {}

  get size(): number {
    return this.items.size;
  }

  get(id: string): GroundItem | undefined {
    return this.items.get(id);
  }

  entries(): IterableIterator<[string, GroundItem]> {
    return this.items.entries();
  }

  /** How many of `kind` lie on the ground. */
  count(kind: ItemKind): number {
    return this.counts.get(kind) ?? 0;
  }

  /** The slippery ones (#15 dog poo), for `SlipGuards.check`. */
  *slippery(): Generator<[string, GroundItem]> {
    for (const entry of this.items) if (THROWABLE_TYPES[entry[1].kind].slippery) yield entry;
  }

  clear(): void {
    for (const id of this.items.keys()) this.hooks?.removed(id);
    this.items.clear();
    this.counts.clear();
  }

  /** Put an item on the ground at (x, z). Returns its id. */
  drop(kind: ItemKind, x: number, z: number): string {
    const kindCap = Math.max(1, THROWABLE_TYPES[kind].groundCap);
    while (this.count(kind) >= kindCap) {
      const oldest = this.oldest(kind);
      if (oldest === null) break;
      this.remove(oldest);
    }
    while (this.items.size >= this.cap) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    const id = `item-${++this.counter}`;
    const item: GroundItem = { kind, x, z };
    this.items.set(id, item);
    this.counts.set(kind, this.count(kind) + 1);
    this.hooks?.added(id, item);
    return id;
  }

  private oldest(kind: ItemKind): string | null {
    for (const [id, item] of this.items) if (item.kind === kind) return id;
    return null;
  }

  /**
   * A protester at `holder` presses interact. Empty-handed (`carrying` is
   * ThrowableKind.None) and with an item within `range`, the nearest one is
   * taken off the ground and its kind returned; otherwise None and nothing
   * changes. Messages are handled one at a time, so two protesters reaching
   * for the same item on the same tick: the first takes it, the second gets
   * another one in range or nothing. Never two copies.
   */
  pickUp(holder: Vec2, carrying: number, range = PICKUP_RANGE): ThrowableKind {
    if (carrying !== ThrowableKind.None) return ThrowableKind.None;
    const id = nearestItem(holder, this.items, range);
    if (id === null) return ThrowableKind.None;
    const item = this.items.get(id)!;
    this.remove(id);
    return item.kind;
  }

  private remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    this.items.delete(id);
    this.counts.set(item.kind, this.count(item.kind) - 1);
    this.hooks?.removed(id);
  }
}

/** The id of the item nearest `holder` within `range` (centre to centre, edge included), or null. Ties go to the oldest. */
export function nearestItem(holder: Vec2, items: Iterable<[string, Vec2]>, range = PICKUP_RANGE): string | null {
  let best: string | null = null;
  let bestD = range * range + 1e-9;
  for (const [id, item] of items) {
    const d = (item.x - holder.x) ** 2 + (item.z - holder.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** What `releaseCarried` needs of a protester: the synced Player fits it. */
export interface Carrier extends Vec2 {
  status: number;
  carrying: number;
}

/**
 * A protester who is no longer free (grabbed, KO, arrested) lets go of what
 * they carry: it drops on the ground where they stand, it does not vanish.
 * Mutates `carrier.carrying`. Returns true if something was dropped.
 */
export function releaseCarried(carrier: Carrier, items: GroundItems): boolean {
  if (carrier.status === PlayerStatus.Free || !isItemKind(carrier.carrying)) return false;
  items.drop(carrier.carrying, carrier.x, carrier.z);
  carrier.carrying = ThrowableKind.None;
  return true;
}

/**
 * The throw direction from a client's aim: re-normalized; a zero or invalid
 * aim (mouse right on the player) throws along the facing instead.
 */
export function aimDirection(x: number, z: number, rotation: number): Vec2 {
  const dir = normalizeMove(x, z);
  if (dir.x !== 0 || dir.z !== 0) return dir;
  return facingDir(rotation);
}

/** A thrown item in flight. Server-only; `x`, `z` and `kind` are synced. */
export interface Projectile extends Vec2 {
  id: string;
  kind: ItemKind;
  /** Session id of the thrower. */
  by: string;
  /** Unit ground direction of flight. */
  dirX: number;
  dirZ: number;
  /** Distance left before it falls. */
  left: number;
  /** Targets already hit this throw (#15): a piercing item hits each one once, never once per tick. */
  hits: Set<string>;
  /** Piercing targets (CRS) hit so far; at the row's `pierce` it stops. */
  struck: number;
}

/** Spawn a projectile at (x, z) flying along the unit direction (dirX, dirZ). */
export function createProjectile(id: string, kind: ItemKind, by: string, x: number, z: number, dirX: number, dirZ: number, rangeFactor = 1): Projectile {
  // An archetype's throw range (#14) scales how far it flies, not how fast.
  const factor = Number.isFinite(rangeFactor) && rangeFactor > 0 ? rangeFactor : 1;
  return { id, kind, by, x, z, dirX, dirZ, left: THROWABLE_TYPES[kind].range * factor, hits: new Set(), struck: 0 };
}

/** Something a projectile can hit and affect: an intact prop or a CRS (as in melee). */
export interface ProjectileTarget<K extends string = string> {
  id: string;
  /** What it is, for the caller ("prop", "crs"...). */
  kind: K;
  shape: PropShape;
  /**
   * A piercing item (#15, `pierce` > 1) may go through it (a CRS). Not
   * pierceable (a prop), it always stops the item.
   */
  pierceable?: boolean;
}

/** Targets a piercing item went through this tick (#15), in order; the caller applies each hit like a stop. Only present when not empty. */
type Passed<K extends string> = { passed?: ProjectileTarget<K>[] };

export type ProjectileStep<K extends string = string> =
  | ({ type: "flying" } & Passed<K>)
  /** Hit a target: the caller applies damage, stun and knockback. */
  | ({ type: "hit"; target: ProjectileTarget<K>; x: number; z: number } & Passed<K>)
  /** Stopped by a wall, an obstacle, a broken prop's remains or the street edge. */
  | ({ type: "blocked"; x: number; z: number } & Passed<K>)
  /** Reached max range and fell. */
  | ({ type: "landed"; x: number; z: number } & Passed<K>);

/**
 * Whether a projectile that stopped lies on the ground again (true) or is
 * used up (#15: a tomato splats; a dog poo that hit a CRS is gone, one that
 * missed lies there as a trap). `hitCrs`: it hit at least one CRS this throw.
 */
export function landsAfterStop(kind: ItemKind, hitCrs: boolean): boolean {
  const t = THROWABLE_TYPES[kind];
  return (hitCrs ? t.afterCrs : t.afterMiss) === "ground";
}

/** How far short of a contact the item stops, so it lies just outside what it hit. */
const CONTACT_BACKOFF = 0.02;

/** Where a segment from `a` to `b` leaves the rectangle `bounds` shrunk by `r`, as a fraction in [0, 1], or null if it stays in. */
function boundsExit(a: Vec2, b: Vec2, bounds: CollisionWorld["bounds"], r: number): number | null {
  let t: number | null = null;
  const axes = [
    [a.x, b.x, bounds.minX + r, bounds.maxX - r],
    [a.z, b.z, bounds.minZ + r, bounds.maxZ - r],
  ] as const;
  for (const [from, to, min, max] of axes) {
    const d = to - from;
    let edge: number | null = null;
    if (to > max && d > 0) edge = (max - from) / d;
    else if (to < min && d < 0) edge = (min - from) / d;
    if (edge !== null) {
      const e = Math.max(0, edge);
      if (t === null || e < t) t = e;
    }
  }
  return t;
}

/**
 * Where a circle of radius `r` swept from `a` to `b` first touches anything in
 * `world` (a wall, an obstacle, a prop, the street edge), as a fraction of the
 * way in [0, 1], or Infinity if the way is clear. Also flies tear gas
 * canisters (#7).
 */
export function wallEntry(a: Vec2, b: Vec2, world: CollisionWorld, r: number): number {
  let wallT = boundsExit(a, b, world.bounds, r) ?? Infinity;
  for (const box of world.boxes) {
    const t = segmentEntry(a, b, { type: "box", x: box.x, z: box.z, halfX: box.halfX + r, halfZ: box.halfZ + r });
    if (t !== null && t < wallT) wallT = t;
  }
  for (const c of world.circles) {
    const t = segmentEntry(a, b, { type: "circle", x: c.x, z: c.z, r: c.r + r });
    if (t !== null && t < wallT) wallT = t;
  }
  return wallT;
}

/**
 * Move a projectile one tick (mutates `p`). The whole move is a swept circle
 * of the item's radius, tested as a segment against every shape grown by that
 * radius, so nothing is skipped whatever the speed. The first contact along
 * the way wins; a target and an obstacle touched at the same point (an intact
 * prop is both) count as the target. The item stops just short of it.
 *
 * Piercing (#15): a target already hit this throw is ignored. A pierceable
 * target hit before the row's `pierce` count is reached is passed through
 * (listed in `passed`, in order); the one that reaches the count stops it.
 *
 * `world` is everything that blocks (static level, props in their current
 * shape, street bounds); `targets` are what a hit affects (intact props, CRS).
 */
export function stepProjectile<K extends string>(
  p: Projectile,
  dt: number,
  world: CollisionWorld,
  targets: Iterable<ProjectileTarget<K>>,
): ProjectileStep<K> {
  const type = THROWABLE_TYPES[p.kind];
  const r = type.radius;
  const dist = Math.max(0, Math.min(type.speed * dt, p.left));
  const a: Vec2 = { x: p.x, z: p.z };
  const b: Vec2 = { x: p.x + p.dirX * dist, z: p.z + p.dirZ * dist };

  const wallT = wallEntry(a, b, world, r);

  // Every target touched before the first wall, nearest first (ties: the order given).
  const touched: { t: number; target: ProjectileTarget<K> }[] = [];
  for (const target of targets) {
    if (p.hits.has(target.id)) continue;
    const s = target.shape;
    const grown: PropShape =
      s.type === "box"
        ? { type: "box", x: s.x, z: s.z, halfX: s.halfX + r, halfZ: s.halfZ + r }
        : { type: "circle", x: s.x, z: s.z, r: s.r + r };
    const t = segmentEntry(a, b, grown);
    if (t !== null && t <= wallT) touched.push({ t, target });
  }
  touched.sort((u, v) => u.t - v.t);

  const stopAt = (t: number) => {
    const travelled = Math.max(0, dist * t - CONTACT_BACKOFF);
    p.x = a.x + p.dirX * travelled;
    p.z = a.z + p.dirZ * travelled;
    p.left = 0;
  };

  const passed: ProjectileTarget<K>[] = [];
  const out = <S extends ProjectileStep<K>>(step: S): S => (passed.length > 0 ? { ...step, passed } : step);
  for (const { t, target } of touched) {
    p.hits.add(target.id);
    if (target.pierceable === true) p.struck++;
    if (target.pierceable === true && p.struck < type.pierce) {
      passed.push(target);
      continue;
    }
    stopAt(t);
    return out({ type: "hit", target, x: p.x, z: p.z });
  }
  if (wallT <= 1) {
    stopAt(wallT);
    return out({ type: "blocked", x: p.x, z: p.z });
  }
  p.x = b.x;
  p.z = b.z;
  p.left -= dist;
  if (p.left <= 1e-9) {
    p.left = 0;
    return out({ type: "landed", x: p.x, z: p.z });
  }
  return out({ type: "flying" });
}

/**
 * Where `count` items dropped by a broken prop land: on the street side of
 * the prop (towards x = 0, where the cortège walks), spread along it, a little
 * beyond its edge, then pushed clear of anything solid in `world`.
 */
export function dropSpots(shape: PropShape, count: number, world: CollisionWorld, r = 0.2): Vec2[] {
  const out: Vec2[] = [];
  if (count <= 0) return out;
  const ux = shape.x > 0 ? -1 : 1;
  const half = shape.type === "box" ? shape.halfX : shape.r;
  const spread = shape.type === "box" ? Math.min(shape.halfZ, 1.2) : shape.r;
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1);
    const res = resolveCircle(world, shape.x + ux * (half + DROP_GAP), shape.z + along, r);
    out.push({ x: res.x, z: res.z });
  }
  return out;
}

/**
 * Slipping on what lies on the ground (#15 dog poo): who steps on what. Each
 * body remembers the item it last slipped on and cannot slip on that one
 * again until it has got SLIP_CLEAR away from it, so a body getting up on a poo (or
 * pushed back onto it) does not go down again at once. Bodies in the air
 * (#45 hop, #11 thrown), already down, or in their get-up immunity (#2)
 * never slip.
 */
export interface SlipBody extends Vec2 {
  airborne: boolean;
  down: boolean;
  /** Get-up immunity (#2): could not be knocked down anyway. */
  immune: boolean;
}

export class SlipGuards {
  /** Per body id: the item it last slipped on, until it steps off it. */
  private readonly lastSlip = new Map<string, string>();

  /**
   * Body `id` at `body`: the id of the slippery item it slips on now, or
   * null. A slip is recorded at once (the caller knocks the body down).
   * `items` are the slippery items lying on the ground.
   */
  check(id: string, body: SlipBody, items: Iterable<[string, Vec2]>, range = SLIP_RANGE, clear = SLIP_CLEAR): string | null {
    const last = this.lastSlip.get(id);
    let lastStillUnder = false;
    let hit: string | null = null;
    let hitD = range * range + 1e-9;
    for (const [itemId, item] of items) {
      const d = (item.x - body.x) ** 2 + (item.z - body.z) ** 2;
      if (itemId === last) {
        // Wider to step off than to step on: getting up beside it, or shuffling about, doesn't count.
        if (d <= clear * clear) lastStillUnder = true;
        continue;
      }
      if (d < hitD) {
        hitD = d;
        hit = itemId;
      }
    }
    // Stepped off it (or it was picked up): that one can trip them again.
    if (last !== undefined && !lastStillUnder) this.lastSlip.delete(id);
    if (body.airborne || body.down || body.immune || hit === null) return null;
    this.lastSlip.set(id, hit);
    return hit;
  }

  remove(id: string): void {
    this.lastSlip.delete(id);
  }

  clear(): void {
    this.lastSlip.clear();
  }
}
