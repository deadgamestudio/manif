import type { MapSchema } from "@colyseus/schema";
import {
  applyPropDamage,
  createPropState,
  dealShops,
  dealtSlot,
  shopCode,
  shopSlots,
  propCollisionWorld,
  propShape,
  type CollisionWorld,
  type Level,
  type MeleeTarget,
  type PropSlot,
  type PropState,
  type ShopKind,
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
  /** Shop slots (#68), in street order, and the kinds they were dealt last reset. */
  private readonly shops: readonly PropSlot[];
  private lastDeal: ShopKind[] | undefined;

  /** `random`: the shop deal's generator (Math.random in the room, seeded in tests). */
  constructor(
    private readonly level: Level,
    private readonly random: () => number = Math.random,
  ) {
    this.shops = shopSlots(level);
    for (const slot of level.propSlots) {
      this.slots.set(slot.id, slot);
      this.states.set(slot.id, createPropState(slot));
    }
    this.world = { ...propCollisionWorld(level, () => false) };
  }

  /**
   * A fresh street for a new round: every shop slot dealt a new kind (#68),
   * every prop back to intact at its kind's HP, all mirrored into the synced
   * map (created on first call). The only place kinds change, so never
   * mid-round.
   */
  reset(views: MapSchema<Prop>): void {
    this.locked.clear();
    const deal = dealShops(this.shops.length, this.random, this.lastDeal);
    this.lastDeal = deal;
    const codes = new Map<string, number>();
    this.shops.forEach((slot, i) => {
      const kind = deal[i];
      if (kind) codes.set(slot.id, shopCode(kind));
    });
    for (const base of this.level.propSlots) {
      const code = codes.get(base.id) ?? 0;
      const slot = dealtSlot(base, code);
      this.slots.set(slot.id, slot);
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
      view.kind = code;
    }
    this.rebuild();
  }

  /** Prop `id` as it plays this round: a shop slot comes back as its dealt kind (#68). */
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
    const next = propCollisionWorld(this.level, (id) => this.states.get(id)?.broken ?? false);
    this.world.boxes = next.boxes;
    this.world.circles = next.circles;
  }
}
