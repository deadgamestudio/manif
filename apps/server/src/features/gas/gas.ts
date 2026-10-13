import type { MapSchema } from "@colyseus/schema";
import {
  GasField,
  createExposure,
  gasSpeedFactor,
  inAnyCloud,
  isGassed,
  stepExposure,
  type CollisionWorld,
  type GasExposure,
  type Obstacles,
  type Vec2,
} from "@manif/shared";
import { CanisterView, GasCloudView } from "./schema.js";

/** What the gas writes on a protester. `Player` fits it. */
export interface GassedView extends Vec2 {
  status: number;
  gassed: boolean;
}

/**
 * Server-side tear gas (#7): canisters in flight and clouds on the ground,
 * mirrored into `state.canisters` and `state.gas`, plus each protester's
 * exposure (server-only; only `gassed` is synced). The rules are the pure
 * `GasField` and `stepExposure` from @manif/shared; the room applies the
 * damage and the slow (it owns health and bodies).
 */
export class Gas {
  private readonly field: GasField;
  private readonly exposures = new Map<string, GasExposure>();

  constructor(
    private readonly cloudViews: MapSchema<GasCloudView>,
    canisterViews: MapSchema<CanisterView>,
  ) {
    this.field = new GasField({
      canisterAdded: (c) => {
        const view = new CanisterView();
        view.fromX = c.fromX;
        view.fromZ = c.fromZ;
        view.toX = c.toX;
        view.toZ = c.toZ;
        canisterViews.set(c.id, view);
      },
      canisterRemoved: (id) => {
        canisterViews.delete(id);
      },
      cloudAdded: (id, cloud) => {
        const view = new GasCloudView();
        view.x = cloud.x;
        view.z = cloud.z;
        view.radius = cloud.radius;
        view.left = 0;
        cloudViews.set(id, view);
      },
      cloudRemoved: (id) => {
        cloudViews.delete(id);
      },
    });
  }

  /** Clouds plus canisters in flight. */
  get liveCount(): number {
    return this.field.liveCount;
  }

  /** A new march: no gas anywhere, nobody coughing. */
  reset(): void {
    this.field.clear();
    this.exposures.clear();
  }

  /** A protester left the room. */
  remove(id: string): void {
    this.exposures.delete(id);
  }

  /** A CRS throws a canister. False at the cap or within the squad interval. */
  launch(by: string, from: Vec2, to: Vec2, now: number): boolean {
    return this.field.launch(by, from, to, now) !== null;
  }

  /** Canisters fly and land, clouds expire, and the time left is mirrored (it changes once a second). */
  step(dt: number, now: number, world: CollisionWorld): void {
    this.field.step(dt, now, world);
    for (const [id, cloud] of this.field.cloudEntries()) {
      const view = this.cloudViews.get(id);
      const left = Math.max(0, Math.min(255, Math.ceil(cloud.endsAt - now)));
      if (view && view.left !== left) view.left = left;
    }
  }

  /**
   * One protester's tick: whether a cloud reaches them (not through
   * `obstacles`), the damage due this tick (0 most ticks) and their walking
   * speed factor. Mirrors `gassed`. Cheap with no gas around: no geometry.
   */
  expose(id: string, view: GassedView, obstacles: Obstacles, now: number): { damage: number; speed: number } {
    let e = this.exposures.get(id);
    const inside = this.field.cloudCount > 0 && inAnyCloud(view, this.field.cloudValues(), obstacles, now);
    if (!e) {
      if (!inside) {
        if (view.gassed) view.gassed = false;
        return NONE;
      }
      e = createExposure();
      this.exposures.set(id, e);
    }
    const damage = stepExposure(e, inside, view.status, now);
    const gassed = isGassed(e, now);
    if (view.gassed !== gassed) view.gassed = gassed;
    const speed = gasSpeedFactor(e, now);
    if (!gassed) this.exposures.delete(id);
    return damage === 0 && speed === 1 ? NONE : { damage, speed };
  }
}

const NONE = { damage: 0, speed: 1 } as const;
