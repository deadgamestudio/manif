/**
 * Props on fire (#16). Pure logic over plain data, stepped by the fixed tick
 * (seconds of `dt`, never the wall clock); the server owns the only copy and
 * mirrors a few fields into Schema.
 *
 * 1. A flammable prop (`PROP_TYPES[kind].flammable`) with HP left, not burning
 *    and not charred, can be lit (`FireField.ignite`), under the MAX_FIRES cap.
 * 2. It burns its HP down at maxHp / FIRE_DURATION per second. At 0 the fire
 *    is out and the prop is charred: it keeps its intact shape (still an
 *    obstacle) and can never burn again.
 * 3. After FIRE_SPREAD_DELAY, then every FIRE_SPREAD_COOLDOWN, a fire lights
 *    the nearest prop that could be lit within FIRE_SPREAD_RADIUS (edge to
 *    edge), if the cap allows.
 * 4. Anyone within FIRE_REACH of a burning prop's edge catches fire (see
 *    `burn.ts`).
 * 5. A fire can be put out early (`extinguish`, `extinguishNear`: the hook for
 *    the pompiers #17 and the water cannon #13). The prop keeps the HP it had
 *    left, is not charred, and can be lit again.
 */
import type { BoxShape, CircleShape, CollisionWorld, Rect } from "../physics/index.js";
import type { PropSlot } from "../level/index.js";
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

/** Whether a body of radius `r` at (x, z) is in the fire zone around `shape`: its edge within `reach` of the prop's edge. */
export function inFireZone(shape: PropShape, x: number, z: number, r: number, reach = FIRE_REACH): boolean {
  return distanceToShape(shape, x, z) <= r + reach + EPS;
}

/** One burning prop. Server-only; position, zone radius, intensity and time left are synced. */
export interface PropFire {
  readonly id: string;
  readonly slot: PropSlot;
  /** The prop's intact shape (a burning prop cannot be smashed, so it keeps it). */
  readonly shape: PropShape;
  /** HP left, fractional; the synced prop HP is this rounded up. */
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

  /** Whether prop `id`, with `hp` left, could be lit now: flammable, some HP, not burning, not charred, under the cap. */
  canIgnite(id: string, hp: number): boolean {
    const slot = this.slots.get(id);
    if (!slot || !PROP_TYPES[slot.kind].flammable) return false;
    if (!(hp > 0) || this.fires.has(id) || this.charred.has(id)) return false;
    return this.fires.size < this.cap;
  }

  /** Set prop `id` on fire with `hp` left. Null when it can't be (see `canIgnite`). */
  ignite(id: string, hp: number): PropFire | null {
    const slot = this.slots.get(id);
    if (!slot || !this.canIgnite(id, hp)) return null;
    const shape = propShape(slot, false);
    if (!shape) return null;
    const fire: PropFire = {
      id,
      slot,
      shape,
      fuel: hp,
      rate: PROP_TYPES[slot.kind].maxHp / FIRE_DURATION,
      age: 0,
      nextSpreadAt: FIRE_SPREAD_DELAY,
    };
    this.fires.set(id, fire);
    this.hooks?.fireAdded(fire);
    return fire;
  }

  /** Put out prop `id`'s fire. Returns the HP it has left (rounded up), or null if it was not burning. */
  extinguish(id: string): number | null {
    const fire = this.fires.get(id);
    if (!fire) return null;
    this.fires.delete(id);
    this.hooks?.fireRemoved(fire, false);
    return Math.ceil(fire.fuel - EPS);
  }

  /** Every fire whose prop's edge is within `radius` of (x, z). The hook for a hose (#17) or the water cannon (#13). */
  near(x: number, z: number, radius: number): PropFire[] {
    const out: PropFire[] = [];
    for (const f of this.fires.values()) if (distanceToShape(f.shape, x, z) <= radius + EPS) out.push(f);
    return out;
  }

  /** Whether a body of radius `r` at (x, z) is in any fire's zone. */
  touches(x: number, z: number, r: number, reach = FIRE_REACH): boolean {
    for (const f of this.fires.values()) if (inFireZone(f.shape, x, z, r, reach)) return true;
    return false;
  }

  /**
   * The prop fire `from` would light: the nearest one that could be lit
   * (`hpOf` gives each prop's HP) within `radius`, edge to edge. Ties go to
   * the smaller id. Null if none.
   */
  spreadTarget(from: PropFire, hpOf: (id: string) => number, radius = FIRE_SPREAD_RADIUS): string | null {
    let best: string | null = null;
    let bestGap = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.id === from.id || !this.canIgnite(slot.id, hpOf(slot.id))) continue;
      const shape = propShape(slot, false);
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
   * burning on the next tick.
   */
  step(dt: number, hpOf: (id: string) => number): FireEvent[] {
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
      const to = this.spreadTarget(f, hpOf);
      if (to !== null && this.ignite(to, hpOf(to))) events.push({ type: "spread", from: f.id, to });
    }
    return events;
  }

  /** No fire anywhere and nothing charred (a new round). */
  clear(): void {
    for (const f of this.fires.values()) this.hooks?.fireRemoved(f, false);
    this.fires.clear();
    this.charred.clear();
  }

  /**
   * The fire zones as obstacles for the bots (#5): each burning prop grown by
   * `reach`, inside `bounds`. Bots path around them and shield lines (#6)
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
