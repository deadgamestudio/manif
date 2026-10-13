import type { MapSchema } from "@colyseus/schema";
import {
  BURN_DAMAGE,
  BURN_DAMAGE_INTERVAL,
  FireField,
  boundingRadius,
  burnSpeedFactor,
  createBurn,
  createFireHold,
  fireIntensity,
  fireSecondsLeft,
  holdRatio,
  interruptHold,
  isOnFire,
  putOutBurn,
  stepBurn,
  stepFireHold,
  type BodyBurn,
  type CollisionWorld,
  type FireAction,
  type FireEvent,
  type FireHold,
  type PropFire,
  type PropSlot,
  type Rect,
} from "@manif/shared";
import { FireView } from "./schema.js";

/** What the fire writes on a body. `Player` and `Crs` fit it. */
export interface BurnView {
  x: number;
  z: number;
  onFire: boolean;
}

const NONE = { damage: 0, speed: 1 } as const;

/**
 * Server-side fire (#16): burning props mirrored into `state.fires`, every
 * body's burn (players and CRS alike, by id; only `onFire` is synced) and
 * each protester's hold on interact to light a prop or pat someone out. The
 * rules are the pure `FireField`, `stepBurn` and `stepFireHold` from
 * @manif/shared; the room owns props, health and bots and applies the effects.
 */
export class Fires {
  private readonly field: FireField;
  private readonly burns = new Map<string, BodyBurn>();
  private readonly holds = new Map<string, FireHold>();
  /** A fire started or went out since the last `takeChanged()`: the bots' hazards need rebuilding. */
  private changed = false;

  constructor(
    slots: readonly PropSlot[],
    private readonly views: MapSchema<FireView>,
  ) {
    this.field = new FireField(slots, {
      fireAdded: (f) => {
        const view = new FireView();
        view.x = f.slot.x;
        view.z = f.slot.z;
        view.radius = boundingRadius(f.shape);
        view.intensity = fireIntensity(f);
        view.left = clampByte(fireSecondsLeft(f));
        views.set(f.id, view);
        this.changed = true;
      },
      fireUpdated: (f) => {
        const view = views.get(f.id);
        if (!view) return;
        const intensity = fireIntensity(f);
        if (view.intensity !== intensity) view.intensity = intensity;
        const left = clampByte(fireSecondsLeft(f));
        if (view.left !== left) view.left = left;
      },
      fireRemoved: (f) => {
        views.delete(f.id);
        this.changed = true;
      },
    });
  }

  /** How many props burn now. */
  get size(): number {
    return this.field.size;
  }

  burning(): IterableIterator<PropFire> {
    return this.field.values();
  }

  get(id: string): PropFire | undefined {
    return this.field.get(id);
  }

  isCharred(id: string): boolean {
    return this.field.isCharred(id);
  }

  canIgnite(id: string, hp: number): boolean {
    return this.field.canIgnite(id, hp);
  }

  /** Set prop `id` (with `hp` left) on fire. False if it can't burn now. */
  ignite(id: string, hp: number): boolean {
    return this.field.ignite(id, hp) !== null;
  }

  /** Put prop `id`'s fire out. Returns the HP it has left, or null if it was not burning. */
  extinguish(id: string): number | null {
    return this.field.extinguish(id);
  }

  /** Ids of the fires whose prop edge is within `radius` of (x, z). */
  near(x: number, z: number, radius: number): string[] {
    return this.field.near(x, z, radius).map((f) => f.id);
  }

  /** One tick of every fire (burn-down, spread). `hpOf` gives a prop's HP. */
  step(dt: number, hpOf: (id: string) => number): FireEvent[] {
    if (this.field.size === 0) return [];
    return this.field.step(dt, hpOf);
  }

  /** True once after any fire started or went out (then false until the next change). */
  takeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  /** The fire zones as obstacles for the bots, inside `bounds`. */
  hazards(bounds: Rect): CollisionWorld {
    return this.field.hazards(bounds);
  }

  /**
   * One body's tick: in a fire zone it catches fire; while it burns it takes
   * `damage` every `interval` (returned this tick, 0 most ticks) and, for a
   * protester, runs at `speed` times its pace. `canBurn` false (KO, arrested,
   * a CRS out) puts it out. Mirrors `onFire`. No geometry when nothing burns.
   */
  burn(
    id: string,
    view: BurnView,
    radius: number,
    canBurn: boolean,
    now: number,
    damage = BURN_DAMAGE,
    interval = BURN_DAMAGE_INTERVAL,
  ): { damage: number; speed: number } {
    const inside = canBurn && this.field.size > 0 && this.field.touches(view.x, view.z, radius);
    let b = this.burns.get(id);
    if (!b) {
      if (!inside) {
        if (view.onFire) view.onFire = false;
        return NONE;
      }
      b = createBurn();
      this.burns.set(id, b);
    }
    const hurt = stepBurn(b, inside, canBurn, now, damage, interval);
    const onFire = isOnFire(b, now);
    if (view.onFire !== onFire) view.onFire = onFire;
    if (!onFire) {
      this.burns.delete(id);
      return NONE;
    }
    return { damage: hurt, speed: burnSpeedFactor(b, now) };
  }

  isOnFire(id: string, now: number): boolean {
    const b = this.burns.get(id);
    return b ? isOnFire(b, now) : false;
  }

  /** Flames out on body `id` (patted out, water). Returns whether it was burning. The view clears on its next `burn`. */
  putOut(id: string, view?: BurnView): boolean {
    const b = this.burns.get(id);
    if (!b) return false;
    putOutBurn(b);
    this.burns.delete(id);
    if (view?.onFire) view.onFire = false;
    return true;
  }

  /** Interact pressed (true) or released (false). */
  hold(id: string, held: boolean): void {
    let h = this.holds.get(id);
    if (!h) {
      if (!held) return;
      h = createFireHold();
      this.holds.set(id, h);
    }
    h.holding = held;
    if (!held) interruptHold(h);
  }

  /** Whether protester `id` holds interact. */
  holding(id: string): boolean {
    return this.holds.get(id)?.holding === true;
  }

  /** Hit while holding: the light or the pat-out starts again from 0. */
  interrupt(id: string): void {
    const h = this.holds.get(id);
    if (h) interruptHold(h);
  }

  /** One tick of `id`'s hold with what it does right now. Returns the action finished this tick, or null. */
  stepHold(id: string, action: FireAction | null, dt: number): FireAction | null {
    const h = this.holds.get(id);
    return h ? stepFireHold(h, action, dt) : null;
  }

  /** Ids of the protesters holding interact. */
  *holders(): Generator<string> {
    for (const [id, h] of this.holds) if (h.holding) yield id;
  }

  /** The hold shown over `id`, 0..100. */
  holdPercent(id: string): number {
    const h = this.holds.get(id);
    return h ? Math.round(holdRatio(h) * 100) : 0;
  }

  /** A body or protester left. */
  remove(id: string): void {
    this.burns.delete(id);
    this.holds.delete(id);
  }

  /** A new round: no fire, nothing charred, nobody burning or holding. */
  reset(): void {
    this.field.clear();
    this.burns.clear();
    this.holds.clear();
    this.views.clear();
    this.changed = true;
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n));
}
