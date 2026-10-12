import { describe, expect, test } from "bun:test";
import { MIN_OBSTACLE_HALF_THICKNESS, circleOverlaps, moveCircle, type BoxShape, type CircleShape } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { STREET_LEVEL as L, levelWorld, type PropSlot } from "../level/index.js";
import { PROP_TYPES } from "./constants.js";
import { applyPropDamage, createPropState, propCollisionWorld, propShape, type PropShape } from "./prop.js";

const slot = (kind: PropSlot["kind"], x = 0, z = 0, rotation = 0): PropSlot => ({ id: `${kind}-t`, kind, x, z, rotation });

describe("applyPropDamage", () => {
  test("takes HP off without breaking above 0", () => {
    const { state, broke } = applyPropDamage({ hp: 3, broken: false }, 1);
    expect(state).toEqual({ hp: 2, broken: false });
    expect(broke).toBe(false);
  });

  test("breaks at 0 HP, and only once", () => {
    const first = applyPropDamage({ hp: 1, broken: false }, 1);
    expect(first.state).toEqual({ hp: 0, broken: true });
    expect(first.broke).toBe(true);
    const again = applyPropDamage(first.state, 1);
    expect(again.broke).toBe(false);
    expect(again.state).toBe(first.state);
  });

  test("overkill clamps to 0", () => {
    expect(applyPropDamage({ hp: 2, broken: false }, 10).state.hp).toBe(0);
  });

  test("ignores zero, negative and invalid amounts", () => {
    const prop = { hp: 2, broken: false };
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyPropDamage(prop, amount).state).toBe(prop);
    }
  });

  test("a fresh prop has its type's max HP", () => {
    for (const kind of Object.keys(PROP_TYPES) as PropSlot["kind"][]) {
      expect(createPropState(slot(kind))).toEqual({ hp: PROP_TYPES[kind].maxHp, broken: false });
    }
  });
});

function contains(outer: PropShape, inner: PropShape): boolean {
  const ext = (s: PropShape): [number, number] => (s.type === "box" ? [s.halfX, s.halfZ] : [s.r, s.r]);
  const [ox, oz] = ext(outer);
  const [ix, iz] = ext(inner);
  return ix <= ox && iz <= oz;
}

describe("prop types", () => {
  test("HP fits a uint8 and shapes are thick enough not to tunnel", () => {
    for (const t of Object.values(PROP_TYPES)) {
      expect(t.maxHp).toBeGreaterThan(0);
      expect(t.maxHp).toBeLessThanOrEqual(255);
      for (const def of [t.intact, t.broken]) {
        if (!def) continue;
        if (def.type === "box") {
          expect(def.halfX).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
          expect(def.halfZ).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
        } else expect(def.r).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
      }
    }
  });

  test("a broken shape fits inside the intact one, so breaking never traps a player", () => {
    for (const kind of Object.keys(PROP_TYPES) as PropSlot["kind"][]) {
      const intact = propShape(slot(kind), false);
      const broken = propShape(slot(kind), true);
      expect(intact).not.toBeNull();
      if (broken && intact) expect(contains(intact, broken)).toBe(true);
    }
  });
});

describe("propShape", () => {
  test("places the shape at the slot", () => {
    expect(propShape(slot("car", 3, -4), false)).toEqual({ type: "box", x: 3, z: -4, halfX: 1, halfZ: 2.1 });
    expect(propShape(slot("bin", 1, 2), false)).toEqual({ type: "circle", x: 1, z: 2, r: 0.5 });
  });

  test("a quarter turn swaps the half extents", () => {
    const s = propShape(slot("car", 0, 0, Math.PI / 2), false);
    expect(s).toMatchObject({ halfX: 2.1, halfZ: 1 });
  });

  test("a broken bin and shop window are walkable, a broken car is not", () => {
    expect(propShape(slot("bin"), true)).toBeNull();
    expect(propShape(slot("shop_window"), true)).toBeNull();
    expect(propShape(slot("car"), true)).not.toBeNull();
  });
});

describe("propCollisionWorld", () => {
  const windowSlot = L.propSlots.find((s) => s.kind === "shop_window")!;
  const carSlot = L.propSlots.find((s) => s.kind === "car")!;

  test("intact props block, broken shop windows stop blocking", () => {
    const intact = propCollisionWorld(L, () => false);
    const broken = propCollisionWorld(L, () => true);
    expect(circleOverlaps(intact, windowSlot.x, windowSlot.z, PLAYER_RADIUS)).toBe(true);
    expect(circleOverlaps(broken, windowSlot.x, windowSlot.z, PLAYER_RADIUS)).toBe(false);
    // The burnt car is still in the way.
    expect(circleOverlaps(broken, carSlot.x, carSlot.z, PLAYER_RADIUS)).toBe(true);
  });

  test("a player walking into an intact car stops at it", () => {
    const world = propCollisionWorld(L, () => false);
    const car = propShape(carSlot, false) as BoxShape;
    const from = { x: car.x + car.halfX + 2, z: car.z };
    const res = moveCircle(world, from, -3, 0, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(car.x + car.halfX + PLAYER_RADIUS, 6);
  });

  test("only the given props are broken", () => {
    const world = propCollisionWorld(L, (id) => id === windowSlot.id);
    const base = levelWorld(L);
    const count = world.boxes.length + world.circles.length - base.boxes.length - base.circles.length;
    expect(count).toBe(L.propSlots.length - 1);
  });
});

describe("street props", () => {
  const world = levelWorld(L);
  const shapes = L.propSlots.map((s) => propShape(s, false)!);

  test("no prop stands in the start zone", () => {
    const s = L.start;
    for (const p of shapes) {
      const [hx, hz] = p.type === "box" ? [p.halfX, p.halfZ] : [p.r, p.r];
      const apart = p.x + hx < s.minX || p.x - hx > s.maxX || p.z + hz < s.minZ || p.z - hz > s.maxZ;
      expect(apart).toBe(true);
    }
  });

  test("props touch their neighbours or leave room for a player to pass", () => {
    const minGap = PLAYER_RADIUS * 2 + 0.15;
    const gap = (p: PropShape, o: (BoxShape & { type?: undefined }) | CircleShape): number => {
      if ("r" in o) {
        if (p.type === "circle") return Math.hypot(p.x - o.x, p.z - o.z) - p.r - o.r;
        return Math.hypot(Math.max(Math.abs(p.x - o.x) - p.halfX, 0), Math.max(Math.abs(p.z - o.z) - p.halfZ, 0)) - o.r;
      }
      if (p.type === "circle") {
        return Math.hypot(Math.max(Math.abs(p.x - o.x) - o.halfX, 0), Math.max(Math.abs(p.z - o.z) - o.halfZ, 0)) - p.r;
      }
      const gx = Math.abs(p.x - o.x) - p.halfX - o.halfX;
      const gz = Math.abs(p.z - o.z) - p.halfZ - o.halfZ;
      return gx > 0 && gz > 0 ? Math.hypot(gx, gz) : Math.max(gx, gz);
    };
    const others: (BoxShape | CircleShape)[] = [...world.boxes, ...world.circles];
    for (const p of shapes) {
      for (const o of others) {
        const g = gap(p, o);
        expect(g <= 1e-9 || g >= minGap).toBe(true);
      }
    }
  });
});
