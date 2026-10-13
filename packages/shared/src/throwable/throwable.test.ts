import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { KNOCKDOWN_THRESHOLD, circleOverlaps, type CollisionWorld } from "../physics/index.js";
import { propCollisionWorld, propShape } from "../prop/index.js";
import { MAX_GROUND_ITEMS, PICKUP_RANGE, THROWABLE_TYPES, ThrowableKind, type ItemKind } from "./constants.js";
import {
  GroundItems,
  aimDirection,
  createProjectile,
  dropSpots,
  isItemKind,
  nearestItem,
  releaseCarried,
  stepProjectile,
  type Projectile,
  type ProjectileStep,
  type ProjectileTarget,
} from "./throwable.js";

const PAVE = ThrowableKind.Pave;
const T = THROWABLE_TYPES[PAVE];
const OPEN: CollisionWorld = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, boxes: [], circles: [] };

describe("throwables table", () => {
  test("every kind has sane numbers; a pavé floors a CRS", () => {
    for (const t of Object.values(THROWABLE_TYPES)) {
      for (const v of [t.radius, t.speed, t.range, t.propDamage, t.crsDamage, t.knockback]) expect(v).toBeGreaterThan(0);
      expect(t.stun).toBeGreaterThanOrEqual(0);
    }
    // Kinds are synced as a uint8, and 0 means empty hands.
    for (const k of Object.keys(THROWABLE_TYPES).map(Number)) {
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(255);
    }
    expect(T.knockback).toBeGreaterThanOrEqual(KNOCKDOWN_THRESHOLD);
  });

  test("isItemKind: real items only", () => {
    expect(isItemKind(PAVE)).toBe(true);
    expect(isItemKind(ThrowableKind.None)).toBe(false);
    expect(isItemKind(200)).toBe(false);
  });
});

describe("picking up", () => {
  test("range edge: exactly PICKUP_RANGE away is in, a bit more is out", () => {
    expect(nearestItem({ x: 0, z: 0 }, [["a", { x: PICKUP_RANGE, z: 0 }]])).toBe("a");
    expect(nearestItem({ x: 0, z: 0 }, [["a", { x: PICKUP_RANGE + 0.01, z: 0 }]])).toBeNull();
  });

  test("takes the nearest item off the ground", () => {
    const items = new GroundItems();
    const far = items.drop(PAVE, 1, 0);
    const near = items.drop(PAVE, 0.5, 0);
    expect(items.pickUp({ x: 0, z: 0 }, ThrowableKind.None)).toBe(PAVE);
    expect(items.get(near)).toBeUndefined();
    expect(items.get(far)).toBeDefined();
  });

  test("already carrying: nothing happens", () => {
    const items = new GroundItems();
    items.drop(PAVE, 0, 0);
    expect(items.pickUp({ x: 0, z: 0 }, PAVE)).toBe(ThrowableKind.None);
    expect(items.size).toBe(1);
  });

  test("two protesters reaching for the same pavé on the same tick: one pavé, not two", () => {
    const items = new GroundItems();
    items.drop(PAVE, 0, 0);
    const first = items.pickUp({ x: -0.5, z: 0 }, ThrowableKind.None);
    const second = items.pickUp({ x: 0.5, z: 0 }, ThrowableKind.None);
    expect([first, second].filter((k) => k === PAVE).length).toBe(1);
    expect(items.size).toBe(0);
  });

  test("the ground holds at most MAX_GROUND_ITEMS: one more drop removes the oldest", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const items = new GroundItems({ added: (id) => added.push(id), removed: (id) => removed.push(id) });
    for (let i = 0; i <= MAX_GROUND_ITEMS; i++) items.drop(PAVE, i, 0);
    expect(items.size).toBe(MAX_GROUND_ITEMS);
    expect(removed).toEqual([added[0]!]);
    expect(items.get(added[0]!)).toBeUndefined();
  });
});

describe("dropping what you carry", () => {
  for (const status of [PlayerStatus.Grabbed, PlayerStatus.Ko, PlayerStatus.Arrested]) {
    test(`status ${status}: the pavé falls where the protester is`, () => {
      const items = new GroundItems();
      const p = { x: 3, z: 4, status, carrying: PAVE as number };
      expect(releaseCarried(p, items)).toBe(true);
      expect(p.carrying).toBe(ThrowableKind.None);
      const item = Array.from(items.entries())[0]?.[1];
      expect(item).toEqual({ kind: PAVE, x: 3, z: 4 });
    });
  }

  test("free, or empty-handed: nothing", () => {
    const items = new GroundItems();
    expect(releaseCarried({ x: 0, z: 0, status: PlayerStatus.Free, carrying: PAVE }, items)).toBe(false);
    expect(releaseCarried({ x: 0, z: 0, status: PlayerStatus.Ko, carrying: ThrowableKind.None }, items)).toBe(false);
    expect(items.size).toBe(0);
  });
});

describe("aim", () => {
  test("re-normalized", () => {
    const d = aimDirection(3, 4, 0);
    expect(d.x).toBeCloseTo(0.6, 6);
    expect(d.z).toBeCloseTo(0.8, 6);
  });

  test("zero or invalid aim throws along the facing", () => {
    for (const [x, z] of [
      [0, 0],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 0],
    ] as const) {
      const d = aimDirection(x, z, Math.PI / 2);
      expect(d.x).toBeCloseTo(1, 6);
      expect(d.z).toBeCloseTo(0, 6);
    }
  });
});

/** Fly a projectile tick by tick until it stops (or 10 s). `targets` may change between ticks. */
function fly<K extends string>(
  p: Projectile,
  world: CollisionWorld,
  targets: (tick: number) => ProjectileTarget<K>[] = () => [],
  dt = TICK_DT,
): ProjectileStep<K> {
  for (let i = 0; i < 10 / dt; i++) {
    const res = stepProjectile(p, dt, world, targets(i));
    if (res.type !== "flying") return res;
  }
  throw new Error("still flying");
}

describe("projectile flight", () => {
  test("in the open it flies its range, then lands", () => {
    const p = createProjectile("p1", PAVE, "me", 0, 0, 1, 0);
    const res = fly(p, OPEN);
    expect(res.type).toBe("landed");
    expect(p.x).toBeCloseTo(T.range, 6);
    expect(p.z).toBe(0);
  });

  test("a thin wall stops it at the wall, even in one huge step", () => {
    const wall = { x: 5, z: 0, halfX: 0.5, halfZ: 3 };
    const world: CollisionWorld = { ...OPEN, boxes: [wall] };
    for (const dt of [TICK_DT, 0.2, 1, 5]) {
      const p = createProjectile("p1", PAVE, "me", 0, 0, 1, 0);
      const res = fly(p, world, undefined, dt);
      expect(res.type).toBe("blocked");
      expect(p.x).toBeLessThanOrEqual(wall.x - wall.halfX - T.radius + 1e-9);
      expect(p.x).toBeGreaterThan(wall.x - wall.halfX - T.radius - 0.1);
    }
  });

  test("a lamp post grazed by the pavé's edge stops it (swept circle, not a point)", () => {
    const world: CollisionWorld = { ...OPEN, circles: [{ x: 5, z: 0.6, r: 0.5 }] };
    const p = createProjectile("p1", PAVE, "me", 0, 0, 1, 0);
    expect(fly(p, world).type).toBe("blocked");
  });

  test("the street edge stops it", () => {
    const p = createProjectile("p1", PAVE, "me", 0, 0, 0, 1);
    const world: CollisionWorld = { ...OPEN, bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } };
    expect(fly(p, world).type).toBe("blocked");
    expect(p.z).toBeLessThanOrEqual(5 - T.radius);
  });

  test("hits a CRS crossing its path between two ticks", () => {
    // A CRS walking across the line of fire at 4.2 m/s, reaching it while the pavé passes.
    const crsAt = (tick: number): ProjectileTarget<"crs">[] => [
      { id: "crs-1", kind: "crs", shape: { type: "circle", x: 8, z: -2 + tick * TICK_DT * 4.2, r: 0.45 } },
    ];
    const p = createProjectile("p1", PAVE, "me", 0, 0, 1, 0);
    const res = fly(p, OPEN, crsAt);
    expect(res.type).toBe("hit");
    if (res.type === "hit") expect(res.target.id).toBe("crs-1");
  });

  test("hits a CRS even when one step would carry it right past", () => {
    const crs: ProjectileTarget<"crs"> = { id: "crs-1", kind: "crs", shape: { type: "circle", x: 3, z: 0, r: 0.45 } };
    const p = createProjectile("p1", PAVE, "me", 0, 0, 1, 0);
    const res = stepProjectile(p, 1, OPEN, [crs]);
    expect(res.type).toBe("hit");
    expect(p.x).toBeCloseTo(3 - 0.45 - T.radius - 0.02, 6);
  });

  test("the nearest of a CRS and a wall wins", () => {
    const crs: ProjectileTarget<"crs"> = { id: "crs-1", kind: "crs", shape: { type: "circle", x: 6, z: 0, r: 0.45 } };
    const world: CollisionWorld = { ...OPEN, boxes: [{ x: 4, z: 0, halfX: 0.5, halfZ: 2 }] };
    expect(fly(createProjectile("p1", PAVE, "me", 0, 0, 1, 0), world, () => [crs]).type).toBe("blocked");
    const behind: CollisionWorld = { ...OPEN, boxes: [{ x: 8, z: 0, halfX: 0.5, halfZ: 2 }] };
    expect(fly(createProjectile("p1", PAVE, "me", 0, 0, 1, 0), behind, () => [crs]).type).toBe("hit");
  });

  test("an intact prop, which both blocks and can be hit, counts as a hit", () => {
    const slot = L.propSlots.find((s) => s.kind === "car")!;
    const world = propCollisionWorld(L, () => false);
    const shape = propShape(slot, false)!;
    const target: ProjectileTarget<"prop"> = { id: slot.id, kind: "prop", shape };
    // From the middle of the street, straight at the car's side.
    const p = createProjectile("p1", PAVE, "me", 0, slot.z, slot.x > 0 ? 1 : -1, 0);
    const res = fly(p, world, () => [target]);
    expect(res.type).toBe("hit");
  });

  test("thrown point-blank at a CRS touching the thrower: still a hit", () => {
    const crs: ProjectileTarget<"crs"> = { id: "crs-1", kind: "crs", shape: { type: "circle", x: 0.8, z: 0, r: 0.45 } };
    const res = stepProjectile(createProjectile("p1", PAVE, "me", 0, 0, 1, 0), TICK_DT, OPEN, [crs]);
    expect(res.type).toBe("hit");
  });
});

describe("pavés from a broken prop", () => {
  test("land on the street side, clear of everything solid", () => {
    const world = propCollisionWorld(L, () => true);
    for (const slot of L.propSlots) {
      const shape = propShape(slot, false)!;
      const spots = dropSpots(shape, 3, world);
      expect(spots.length).toBe(3);
      for (const s of spots) {
        expect(circleOverlaps(world, s.x, s.z, 0.2)).toBe(false);
        expect(Math.abs(s.x)).toBeLessThan(Math.abs(slot.x) + 0.01);
      }
    }
  });
});

describe("street items", () => {
  test("start clear of obstacles and intact props, inside the street", () => {
    const world = propCollisionWorld(L, () => false);
    expect(L.items.length).toBeGreaterThan(0);
    for (const item of L.items) {
      expect(isItemKind(item.kind as ItemKind)).toBe(true);
      expect(circleOverlaps(world, item.x, item.z, 0.3)).toBe(false);
    }
  });
});
