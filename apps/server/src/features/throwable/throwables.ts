import type { MapSchema } from "@colyseus/schema";
import {
  GroundItems,
  MAX_PROJECTILES,
  ThrowableKind,
  createProjectile,
  releaseCarried,
  stepProjectile,
  type Carrier,
  type CollisionWorld,
  type ItemKind,
  type LevelItem,
  type Projectile,
  type ProjectileTarget,
  type Vec2,
} from "@manif/shared";
import { GroundItem, ProjectileView } from "./schema.js";

/**
 * Server-side throwables (#8): the items on the ground and the ones in
 * flight, mirrored into `state.items` and `state.projectiles`. The rules are
 * the pure `GroundItems` and `stepProjectile` from @manif/shared; the room
 * applies what a hit does (it owns props, CRS and their events).
 */
export class Throwables {
  readonly ground: GroundItems;
  private flying: Projectile[] = [];
  private counter = 0;

  constructor(
    itemViews: MapSchema<GroundItem>,
    private readonly projectileViews: MapSchema<ProjectileView>,
  ) {
    this.ground = new GroundItems({
      added: (id, item) => {
        const view = new GroundItem();
        view.kind = item.kind;
        view.x = item.x;
        view.z = item.z;
        itemViews.set(id, view);
      },
      removed: (id) => {
        itemViews.delete(id);
      },
    });
  }

  /** In flight right now. */
  get flyingCount(): number {
    return this.flying.length;
  }

  /** A fresh street: only the level's items on the ground, nothing in flight. */
  reset(items: readonly LevelItem[]): void {
    this.ground.clear();
    this.flying = [];
    this.projectileViews.clear();
    for (const item of items) this.ground.drop(item.kind, item.x, item.z);
  }

  drop(kind: ItemKind, x: number, z: number): void {
    this.ground.drop(kind, x, z);
  }

  /** Interact by a protester at `holder` carrying `carrying`: the kind picked up, or None. */
  pickUp(holder: Vec2, carrying: number): ThrowableKind {
    return this.ground.pickUp(holder, carrying);
  }

  /** A protester no longer free drops what they carry. See `releaseCarried`. */
  release(carrier: Carrier): boolean {
    return releaseCarried(carrier, this.ground);
  }

  /** Throw from (x, z) along the unit direction. False at the MAX_PROJECTILES cap (the item stays in hand). */
  launch(by: string, kind: ItemKind, x: number, z: number, dirX: number, dirZ: number): boolean {
    if (this.flying.length >= MAX_PROJECTILES) return false;
    const p = createProjectile(`proj-${++this.counter}`, kind, by, x, z, dirX, dirZ);
    this.flying.push(p);
    const view = new ProjectileView();
    view.kind = kind;
    view.x = x;
    view.z = z;
    this.projectileViews.set(p.id, view);
    return true;
  }

  /**
   * Move everything in flight one tick. `targets` is called once, only if
   * something flies. A projectile that stops (hit, wall, max range) leaves
   * the synced map and lies on the ground where it stopped; `onHit` applies
   * a hit first.
   */
  step<K extends string>(
    dt: number,
    world: CollisionWorld,
    targets: () => ProjectileTarget<K>[],
    onHit: (p: Projectile, target: ProjectileTarget<K>) => void,
  ): void {
    if (this.flying.length === 0) return;
    const list = targets();
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const p = this.flying[i]!;
      const res = stepProjectile(p, dt, world, list);
      if (res.type === "flying") {
        const view = this.projectileViews.get(p.id);
        if (view) {
          view.x = p.x;
          view.z = p.z;
        }
        continue;
      }
      this.flying.splice(i, 1);
      this.projectileViews.delete(p.id);
      if (res.type === "hit") onHit(p, res.target);
      this.ground.drop(p.kind, p.x, p.z);
    }
  }
}
