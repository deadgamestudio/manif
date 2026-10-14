import type { MapSchema } from "@colyseus/schema";
import {
  applyPropDamage,
  createPropState,
  generateShops,
  shopCode,
  shopSlot,
  propCollisionWorld,
  propShape,
  type CollisionWorld,
  type Level,
  type MeleeTarget,
  type PropSlot,
  type PropState,
  type ShopLot,
} from "@manif/shared";
import { Prop } from "./schema.js";

/** The collision world bodies step against, whose shapes the props swap when they break. */
export type MutableWorld = { -readonly [K in keyof CollisionWorld]: CollisionWorld[K] };

export interface PropDamageResult {
  slot: PropSlot;
  state: PropState;
  broke: boolean;
}

/**
 * Server-side breakable props (#4). Owns the collision world of the room:
 * the level's static obstacles plus every prop in its current state. Hand
 * `world` to the bodies once; when a prop breaks its shape list is rebuilt in
 * place, so the very next tick collides against the broken shape. Broken
 * shapes fit inside intact ones, so nobody ends up inside one.
 */
export class Props {
  readonly world: MutableWorld;
  private readonly slots = new Map<string, PropSlot>();
  private readonly states = new Map<string, PropState>();
  /** Burning or charred (#16): swings and throws pass them by, their HP is the fire's. */
  private readonly locked = new Set<string>();
  /** This round's shops (#83), in street order. */
  private lots: ShopLot[] = [];
  /** How many layouts so far: each one's shops get fresh ids, so a client sees old shops go and new ones come. */
  private layouts = 0;

  /** `random`: the shop generator's (Math.random in the room, seeded in tests). */
  constructor(
    private readonly level: Level,
    private readonly random: () => number = Math.random,
  ) {
    for (const slot of level.propSlots) {
      this.slots.set(slot.id, slot);
      this.states.set(slot.id, createPropState(slot));
    }
    this.world = { ...propCollisionWorld(level, () => false) };
  }

  /** This round's shops (#83), in street order. */
  get shops(): readonly ShopLot[] {
    return this.lots;
  }

  /**
   * A fresh street for a new round: every prop back to intact at its kind's
   * HP, mirrored into the synced map (created on first call). With `relayout`
   * (and always on the first call) the shops are built anew too (#83): new
   * places, sizes and kinds, the old ones removed from the map. The only
   * place shops change, so never mid-round.
   */
  reset(views: MapSchema<Prop>, relayout = true): void {
    this.locked.clear();
    if (relayout || this.layouts === 0) this.layOut(views);
    for (const slot of this.slots.values()) {
      const state = createPropState(slot);
      this.states.set(slot.id, state);
      let view = views.get(slot.id);
      if (!view) {
        view = new Prop();
        views.set(slot.id, view);
      }
      view.hp = state.hp;
      view.broken = state.broken;
      view.charred = false;
    }
    this.rebuild();
  }

  /** Swap last round's shops for a newly generated street, slots and synced views alike. */
  private layOut(views: MapSchema<Prop>): void {
    for (const lot of this.lots) {
      this.slots.delete(lot.id);
      this.states.delete(lot.id);
      views.delete(lot.id);
    }
    this.layouts++;
    this.lots = generateShops(this.level, this.random, { previous: this.lots, prefix: `shop${this.layouts}` });
    for (const lot of this.lots) {
      this.slots.set(lot.id, shopSlot(lot));
      // Every field before it goes in the map, so a client gets the whole shop in one patch.
      const view = new Prop();
      view.kind = shopCode(lot.kind);
      view.side = lot.side;
      view.z = lot.z;
      view.width = lot.width;
      view.face = lot.face;
      view.out = lot.out;
      view.height = lot.height;
      view.interior = lot.interior;
      view.style = lot.style;
      views.set(lot.id, view);
    }
  }

  /** Prop `id` as it plays this round: a shop comes back with its kind and its own box (#83). */
  slot(id: string): PropSlot | undefined {
    return this.slots.get(id);
  }

  /** What a swing can land on: every intact prop, with its current shape. */
  *targets(): Generator<MeleeTarget> {
    for (const [id, state] of this.states) {
      if (state.broken || this.locked.has(id)) continue;
      const slot = this.slots.get(id);
      const shape = slot && propShape(slot, false);
      if (shape) yield { id, shape };
    }
  }

  /** Take HP off a prop and mirror it into `view`. Null for an unknown or already broken prop. */
  damage(id: string, amount: number, view: Prop | undefined): PropDamageResult | null {
    const slot = this.slots.get(id);
    const prev = this.states.get(id);
    if (!slot || !prev || this.locked.has(id)) return null;
    const { state, broke } = applyPropDamage(prev, amount);
    if (state === prev) return null;
    this.states.set(id, state);
    if (view) {
      view.hp = state.hp;
      view.broken = state.broken;
    }
    if (broke) this.rebuild();
    return { slot, state, broke };
  }

  /** HP left on prop `id` (0 for an unknown one). */
  hp(id: string): number {
    return this.states.get(id)?.hp ?? 0;
  }

  /**
   * Prop `id` caught fire (#16): swings and throws no longer touch it, it
   * keeps its intact shape, and its HP is now the fire's (see `burnTo`).
   */
  lock(id: string): void {
    this.locked.add(id);
  }

  /** Its fire was put out early: it can be hit (and lit) again, with the HP the fire left. */
  unlock(id: string): void {
    this.locked.delete(id);
  }

  /** A burning prop's HP, mirrored into `view` (only when it changes). */
  burnTo(id: string, hp: number, view: Prop | undefined): void {
    const prev = this.states.get(id);
    if (!prev || prev.hp === hp) return;
    this.states.set(id, { hp, broken: prev.broken });
    if (view && view.hp !== hp) view.hp = hp;
  }

  /** Burnt out (#16): 0 HP, charred, still standing in its intact shape, locked for the rest of the round. */
  char(id: string, view: Prop | undefined): void {
    this.locked.add(id);
    this.burnTo(id, 0, view);
    if (view && !view.charred) view.charred = true;
  }

  private rebuild(): void {
    const next = propCollisionWorld(this.level, (id) => this.states.get(id)?.broken ?? false, this.slots.values());
    this.world.boxes = next.boxes;
    this.world.circles = next.circles;
  }
}
