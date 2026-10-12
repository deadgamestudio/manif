import type { MapSchema } from "@colyseus/schema";
import {
  applyPropDamage,
  createPropState,
  propCollisionWorld,
  propShape,
  type CollisionWorld,
  type Level,
  type MeleeTarget,
  type PropSlot,
  type PropState,
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

  constructor(private readonly level: Level) {
    for (const slot of level.propSlots) {
      this.slots.set(slot.id, slot);
      this.states.set(slot.id, createPropState(slot));
    }
    this.world = { ...propCollisionWorld(level, () => false) };
  }

  /** Every prop back to intact, mirrored into the synced map (created on first call). */
  reset(views: MapSchema<Prop>): void {
    for (const slot of this.level.propSlots) {
      const state = createPropState(slot);
      this.states.set(slot.id, state);
      let view = views.get(slot.id);
      if (!view) {
        view = new Prop();
        views.set(slot.id, view);
      }
      view.hp = state.hp;
      view.broken = state.broken;
    }
    this.rebuild();
  }

  slot(id: string): PropSlot | undefined {
    return this.slots.get(id);
  }

  /** What a swing can land on: every intact prop, with its current shape. */
  *targets(): Generator<MeleeTarget> {
    for (const [id, state] of this.states) {
      if (state.broken) continue;
      const slot = this.slots.get(id);
      const shape = slot && propShape(slot, false);
      if (shape) yield { id, shape };
    }
  }

  /** Take HP off a prop and mirror it into `view`. Null for an unknown or already broken prop. */
  damage(id: string, amount: number, view: Prop | undefined): PropDamageResult | null {
    const slot = this.slots.get(id);
    const prev = this.states.get(id);
    if (!slot || !prev) return null;
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

  private rebuild(): void {
    const next = propCollisionWorld(this.level, (id) => this.states.get(id)?.broken ?? false);
    this.world.boxes = next.boxes;
    this.world.circles = next.circles;
  }
}
