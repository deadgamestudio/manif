/**
 * Props on fire (#16). Pure logic over plain data, stepped by the fixed tick
 * (seconds of `dt`, never the wall clock); the server owns the only copy and
 * mirrors a few fields into Schema.
 *
 * 1. A flammable prop (`PROP_TYPES[kind].flammable`) with HP left, not burning
 *    and not charred, can be lit (`FireField.ignite`), under the MAX_FIRES cap.
 *    A broken one can be lit too if its kind leaves a wreck (`broken` shape,
 *    today the car, #91): a bin smashed to nothing has nothing left to burn.
 * 2. It burns its HP down at maxHp / FIRE_DURATION per second. At 0 the fire
 *    is out and the prop is charred: it keeps its shape (still an obstacle)
 *    and can never burn again. A wreck has no HP left, so it burns its own
 *    fuel instead, a full FIRE_DURATION, around its broken shape.
 * 3. After FIRE_SPREAD_DELAY, then every FIRE_SPREAD_COOLDOWN, a fire lights
 *    the nearest prop that could be lit within FIRE_SPREAD_RADIUS (edge to
 *    edge), if the cap allows.
 * 4. Anyone within FIRE_REACH of a burning prop's edge catches fire (see
 *    `burn.ts`). A new fire's zone grows from the prop's edge to that size
 *    over FIRE_GROW_TIME (`zoneGrowth`, #91), so whoever lit it has time to
 *    step away.
 * 5. A fire can be put out early (`extinguish`, `extinguishNear`: the hook for
 *    the pompiers #17 and the water cannon #13). The prop keeps the HP it had
 *    left (a wreck, the fuel it had left), is not charred, and can be lit again.
 */
import type { BoxShape, CircleShape, CollisionWorld, Rect } from "../physics/index.js";
import type { PropKind, PropSlot } from "../level/index.js";
import { PROP_TYPES, propShape, type PropShape } from "../prop/index.js";
import {
  FIRE_DURATION,
  FIRE_DYING_TIME,
  FIRE_GROW_TIME,
  FIRE_REACH,
  FIRE_SPREAD_COOLDOWN,
  FIRE_SPREAD_DELAY,
  FIRE_SPREAD_RADIUS,
  MAX_FIRES,
} from "./constants.js";

const NOT_BROKEN = (): boolean => false;

/** Timer slack, so a tick landing on a boundary counts (room time adds up 1/TICK_RATE steps). */
const EPS = 1e-9;

/** Distance from (x, z) to the edge of `shape`; 0 inside it. */
export function distanceToShape(shape: PropShape, x: number, z: number): number {
  if (shape.type === "circle") return Math.max(0, Math.hypot(x - shape.x, z - shape.z) - shape.r);
  const ox = Math.max(Math.abs(x - shape.x) - shape.halfX, 0);
  const oz = Math.max(Math.abs(z - shape.z) - shape.halfZ, 0);
  return Math.hypot(ox, oz);
}

/** Edge-to-edge gap between two shapes; 0 or less when they touch or overlap. */
export function shapeGap(a: PropShape, b: PropShape): number {
  if (a.type === "circle" && b.type === "circle") return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.type === "circle") return distanceToShape(b, a.x, a.z) - a.r;
  if (b.type === "circle") return distanceToShape(a, b.x, b.z) - b.r;
  const gx = Math.abs(a.x - b.x) - a.halfX - b.halfX;
  const gz = Math.abs(a.z - b.z) - a.halfZ - b.halfZ;
  return gx > 0 && gz > 0 ? Math.hypot(gx, gz) : Math.max(gx, gz);
}

/** A circle to fit the whole fire zone (the prop plus `reach`): what the client draws and what #17 aims at. */
export function boundingRadius(shape: PropShape, reach = FIRE_REACH): number {
  return (shape.type === "circle" ? shape.r : Math.hypot(shape.halfX, shape.halfZ)) + reach;
}

/**
 * How far a fire's zone has grown `age` seconds after it was lit: 0 at first,
 * 1 (full size) from FIRE_GROW_TIME on. Eased in, so it barely creeps past
 * the prop at first: someone standing against a bin they just lit has about
 * a second to step away (#91).
 */
export function zoneGrowth(age: number): number {
  const g = Math.min(1, Math.max(0, age / FIRE_GROW_TIME));
  return g * g;
}

/**
 * Whether a body of radius `r` at (x, z) is in the fire zone around `shape`:
 * at full size (`growth` 1), its edge within `reach` of the prop's edge.
 * Growing, the zone reaches `growth` of that from the prop's edge to the
 * body's centre, so at 0 only a body overlapping the prop is in it.
 */
export function inFireZone(shape: PropShape, x: number, z: number, r: number, reach = FIRE_REACH, growth = 1): boolean {
  return distanceToShape(shape, x, z) <= (r + reach) * growth + EPS;
}

/**
 * Whether a prop of `kind` has something to burn: HP left, or, broken, a
 * wreck (its kind has a broken shape, #91). Whether it burns or is charred
 * already is `FireField.canIgnite`'s business.
 */
export function hasFuel(kind: PropKind, hp: number, broken: boolean): boolean {
  const type = PROP_TYPES[kind];
  return type.flammable && (broken ? type.broken !== null : hp > 0);
}

/** A prop that can ever burn, with the shape a fire would burn around, intact and as a wreck (null: nothing left). */
export interface FlammableProp {
  readonly id: string;
  readonly kind: PropKind;
  readonly intact: { readonly id: string; readonly shape: PropShape };
  readonly wreck: { readonly id: string; readonly shape: PropShape } | null;
}

/** The flammable props among `slots`, shapes worked out once (what a held interact may light). */
export function flammableProps(slots: Iterable<PropSlot>): FlammableProp[] {
  const out: FlammableProp[] = [];
  for (const slot of slots) {
    if (!PROP_TYPES[slot.kind].flammable) continue;
    const intact = propShape(slot, false);
    if (!intact) continue;
    const broken = propShape(slot, true);
    out.push({ id: slot.id, kind: slot.kind, intact: { id: slot.id, shape: intact }, wreck: broken && { id: slot.id, shape: broken } });
  }
  return out;
}

/** One burning prop. Server-only; position, zone radius, intensity and time left are synced. */
export interface PropFire {
  readonly id: string;
  readonly slot: PropSlot;
  /** The prop's shape when it was lit, intact or broken (a burning prop cannot be smashed, so it keeps it). */
  readonly shape: PropShape;
  /** A broken prop (#91): it burns its own fuel, not HP, and its synced HP stays 0 (see `fireHp`). */
  readonly wreck: boolean;
  /** HP left, fractional; the synced prop HP is this rounded up. A wreck's fuel counts the same way but is no HP. */
  fuel: number;
  /** HP burnt per second: maxHp / FIRE_DURATION. */
  readonly rate: number;
  /** Seconds since it was lit. */
  age: number;
  /** Age at which it next tries to spread. */
  nextSpreadAt: number;
}

/** Whole seconds the fire has left before the prop is charred. */
export function fireSecondsLeft(f: PropFire): number {
  return Math.max(0, Math.ceil(f.fuel / f.rate - EPS));
}

/** The prop's HP while it burns: its fuel rounded up, or 0 for a wreck (it was already smashed). */
export function fireHp(f: PropFire): number {
  return f.wreck ? 0 : Math.ceil(f.fuel - EPS);
}

/** Flame size for the client: 2 while catching, 3 at full blaze, 1 over the last FIRE_DYING_TIME seconds. */
export function fireIntensity(f: PropFire): number {
  if (f.fuel / f.rate <= FIRE_DYING_TIME + EPS) return 1;
  return f.age < FIRE_GROW_TIME ? 2 : 3;
}

/** What `FireField.step` reports. */
export type FireEvent =
  /** The fire ate the last HP: the prop is charred. */
  | { type: "burnt"; id: string }
  /** Fire `from` lit prop `to`. */
  | { type: "spread"; from: string; to: string };

/** Told about every change, so the server can mirror fires into Schema. */
export interface FireFieldHooks {
  fireAdded(f: PropFire): void;
  /** Called every tick for each burning prop (the server sends only what changed). */
  fireUpdated(f: PropFire): void;
  /** `charred`: burnt out (true), or put out early (false). */
  fireRemoved(f: PropFire, charred: boolean): void;
}

/**
 * Every burning prop of one room, and the props already charred. Lighting,
 * spreading and the cap live here; the room supplies each prop's HP (it owns
 * the props) and applies what a fire does to bodies.
 */
export class FireField {
  private readonly slots = new Map<string, PropSlot>();
  private readonly fires = new Map<string, PropFire>();
  private readonly charred = new Set<string>();
  /** Fuel left on a wreck whose fire was put out early, for when it is lit again. */
  private readonly wreckFuel = new Map<string, number>();

  constructor(
    slots: Iterable<PropSlot>,
    private readonly hooks?: FireFieldHooks,
    private readonly cap = MAX_FIRES,
  ) {
    for (const s of slots) this.slots.set(s.id, s);
  }

  get size(): number {
    return this.fires.size;
  }

  values(): IterableIterator<PropFire> {
    return this.fires.values();
  }

  get(id: string): PropFire | undefined {
    return this.fires.get(id);
  }

  isBurning(id: string): boolean {
    return this.fires.has(id);
  }

  isCharred(id: string): boolean {
    return this.charred.has(id);
  }

  /**
   * Whether prop `id`, with `hp` left, could be lit now: flammable, not
   * burning, not charred, under the cap, and either some HP or `broken` into
   * a wreck (its kind has a broken shape).
   */
  canIgnite(id: string, hp: number, broken = false): boolean {
    const slot = this.slots.get(id);
    if (!slot || !hasFuel(slot.kind, hp, broken)) return false;
    if (this.fires.has(id) || this.charred.has(id)) return false;
    return this.fires.size < this.cap;
  }

  /** The shape a fire on prop `id` would burn around now (intact, or the wreck), or null if it can't be lit. */
  lightableShape(id: string, hp: number, broken = false): PropShape | null {
    const slot = this.slots.get(id);
    return slot && this.canIgnite(id, hp, broken) ? propShape(slot, broken) : null;
  }

  /**
   * Set prop `id` on fire with `hp` left, or as a wreck when `broken` (a full
   * FIRE_DURATION of fuel, or what it had left when last put out). Null when
   * it can't be (see `canIgnite`).
   */
  ignite(id: string, hp: number, broken = false): PropFire | null {
    const slot = this.slots.get(id);
    if (!slot || !this.canIgnite(id, hp, broken)) return null;
    const shape = propShape(slot, broken);
    if (!shape) return null;
    const maxHp = PROP_TYPES[slot.kind].maxHp;
    const fire: PropFire = {
      id,
      slot,
      shape,
      wreck: broken,
      fuel: broken ? (this.wreckFuel.get(id) ?? maxHp) : hp,
      rate: maxHp / FIRE_DURATION,
      age: 0,
      nextSpreadAt: FIRE_SPREAD_DELAY,
    };
    this.wreckFuel.delete(id);
    this.fires.set(id, fire);
    this.hooks?.fireAdded(fire);
    return fire;
  }

  /** Put out prop `id`'s fire. Returns the HP it has left (`fireHp`: 0 for a wreck), or null if it was not burning. */
  extinguish(id: string): number | null {
    const fire = this.fires.get(id);
    if (!fire) return null;
    this.fires.delete(id);
    if (fire.wreck) this.wreckFuel.set(id, fire.fuel);
    this.hooks?.fireRemoved(fire, false);
    return fireHp(fire);
  }

  /** Every fire whose prop's edge is within `radius` of (x, z). The hook for a hose (#17) or the water cannon (#13). */
  near(x: number, z: number, radius: number): PropFire[] {
    const out: PropFire[] = [];
    for (const f of this.fires.values()) if (distanceToShape(f.shape, x, z) <= radius + EPS) out.push(f);
    return out;
  }

  /** Whether a body of radius `r` at (x, z) is in any fire's zone, each grown as far as its age allows (`zoneGrowth`). */
  touches(x: number, z: number, r: number, reach = FIRE_REACH): boolean {
    for (const f of this.fires.values()) if (inFireZone(f.shape, x, z, r, reach, zoneGrowth(f.age))) return true;
    return false;
  }

  /**
   * The prop fire `from` would light: the nearest one that could be lit
   * (`hpOf` gives each prop's HP, `brokenOf` whether it is smashed) within
   * `radius`, edge to edge. Ties go to the smaller id. Null if none.
   */
  spreadTarget(from: PropFire, hpOf: (id: string) => number, radius = FIRE_SPREAD_RADIUS, brokenOf: (id: string) => boolean = NOT_BROKEN): string | null {
    let best: string | null = null;
    let bestGap = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.id === from.id) continue;
      const shape = this.lightableShape(slot.id, hpOf(slot.id), brokenOf(slot.id));
      if (!shape) continue;
      const gap = shapeGap(from.shape, shape);
      if (gap > radius + EPS) continue;
      if (gap < bestGap || (gap === bestGap && best !== null && slot.id < best)) {
        bestGap = gap;
        best = slot.id;
      }
    }
    return best;
  }

  /**
   * One tick: every fire burns `dt` worth of HP; one that runs out is removed
   * and its prop charred. Then fires due to spread light their nearest
   * neighbour (in map order, so the cap is never crossed). New fires start
   * burning on the next tick. `brokenOf` tells which props are wrecks.
   */
  step(dt: number, hpOf: (id: string) => number, brokenOf: (id: string) => boolean = NOT_BROKEN): FireEvent[] {
    const events: FireEvent[] = [];
    for (const [id, f] of this.fires) {
      f.age += dt;
      f.fuel = Math.max(0, f.fuel - f.rate * dt);
      if (f.fuel <= EPS) {
        this.fires.delete(id);
        this.charred.add(id);
        this.hooks?.fireRemoved(f, true);
        events.push({ type: "burnt", id });
        continue;
      }
      this.hooks?.fireUpdated(f);
    }
    const due: PropFire[] = [];
    for (const f of this.fires.values()) {
      if (f.age + EPS < f.nextSpreadAt) continue;
      f.nextSpreadAt = f.age + FIRE_SPREAD_COOLDOWN;
      due.push(f);
    }
    for (const f of due) {
      const to = this.spreadTarget(f, hpOf, FIRE_SPREAD_RADIUS, brokenOf);
      if (to !== null && this.ignite(to, hpOf(to), brokenOf(to))) events.push({ type: "spread", from: f.id, to });
    }
    return events;
  }

  /** No fire anywhere and nothing charred (a new round). */
  clear(): void {
    for (const f of this.fires.values()) this.hooks?.fireRemoved(f, false);
    this.fires.clear();
    this.charred.clear();
    this.wreckFuel.clear();
  }

  /**
   * The fire zones as obstacles for the bots (#5): each burning prop grown by
   * `reach`, inside `bounds`. Always the full zone, even while it grows: the
   * bots keep clear of a fire from the moment it is lit. Bots path around them and shield lines (#6)
   * lay their slots clear of them.
   */
  hazards(bounds: Rect, reach = FIRE_REACH): CollisionWorld {
    const boxes: BoxShape[] = [];
    const circles: CircleShape[] = [];
    for (const f of this.fires.values()) {
      const s = f.shape;
      if (s.type === "circle") circles.push({ x: s.x, z: s.z, r: s.r + reach });
      else boxes.push({ x: s.x, z: s.z, halfX: s.halfX + reach, halfZ: s.halfZ + reach });
    }
    return { bounds, boxes, circles };
  }
}
