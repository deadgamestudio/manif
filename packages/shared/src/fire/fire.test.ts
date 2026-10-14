import { describe, expect, test } from "bun:test";
import { NavGrid } from "../crs/index.js";
import { STREET_LEVEL as L, type PropSlot } from "../level/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { PROP_TYPES, propShape, type PropShape } from "../prop/index.js";
import {
  FIRE_DURATION,
  FIRE_DYING_TIME,
  FIRE_REACH,
  FIRE_SPREAD_COOLDOWN,
  FIRE_SPREAD_DELAY,
  FIRE_SPREAD_RADIUS,
  MAX_FIRES,
} from "./constants.js";
import { FireField, distanceToShape, fireIntensity, fireSecondsLeft, inFireZone, shapeGap, type PropFire } from "./fire.js";

const DT = 1 / 30;
const slot = (id: string, kind: PropSlot["kind"], x: number, z: number): PropSlot => ({ id, kind, x, z, rotation: 0 });
const fullHp = (slots: readonly PropSlot[]) => {
  const hp = new Map(slots.map((s) => [s.id, PROP_TYPES[s.kind].maxHp]));
  return (id: string) => hp.get(id) ?? 0;
};

/** Run the field for `seconds` of fixed ticks; returns every event. */
function run(field: FireField, seconds: number, hpOf: (id: string) => number) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...field.step(DT, hpOf));
  return events;
}

describe("shapes", () => {
  const bin: PropShape = { type: "circle", x: 0, z: 0, r: 0.5 };
  const car: PropShape = { type: "box", x: 0, z: 0, halfX: 1, halfZ: 2 };

  test("distance to a shape's edge, 0 inside", () => {
    expect(distanceToShape(bin, 2, 0)).toBeCloseTo(1.5);
    expect(distanceToShape(bin, 0.1, 0)).toBe(0);
    expect(distanceToShape(car, 3, 0)).toBeCloseTo(2);
    expect(distanceToShape(car, 4, 6)).toBeCloseTo(5);
  });

  test("gap between two shapes, edge to edge", () => {
    expect(shapeGap(bin, { type: "circle", x: 3, z: 0, r: 0.5 })).toBeCloseTo(2);
    expect(shapeGap(bin, { ...car, x: 1.5 })).toBeCloseTo(0);
    expect(shapeGap(bin, { ...car, x: 3.5 })).toBeCloseTo(2);
    expect(shapeGap(car, { ...car, x: 5 })).toBeCloseTo(3);
  });

  test("the zone edge: a body just within FIRE_REACH of the prop catches fire, just beyond does not", () => {
    const touch = 0.5 + FIRE_REACH + PLAYER_RADIUS;
    expect(inFireZone(bin, touch - 0.01, 0, PLAYER_RADIUS)).toBe(true);
    expect(inFireZone(bin, touch, 0, PLAYER_RADIUS)).toBe(true);
    expect(inFireZone(bin, touch + 0.01, 0, PLAYER_RADIUS)).toBe(false);
  });
});

describe("lighting", () => {
  const slots = [slot("bin", "bin", 0, 0), slot("car", "car", 10, 0), slot("shelter", "bus_shelter", 20, 0), slot("window", "boulangerie", 30, 0)];

  test("bins and cars light; shop windows and bus shelters never", () => {
    const field = new FireField(slots);
    expect(field.ignite("bin", 2)).not.toBeNull();
    expect(field.ignite("car", 6)).not.toBeNull();
    expect(field.ignite("shelter", 4)).toBeNull();
    expect(field.ignite("window", 3)).toBeNull();
    expect(field.size).toBe(2);
  });

  test("not twice, not with no HP left, not an unknown prop", () => {
    const field = new FireField(slots);
    expect(field.ignite("bin", 0)).toBeNull();
    expect(field.ignite("nope", 2)).toBeNull();
    expect(field.ignite("bin", 2)).not.toBeNull();
    expect(field.ignite("bin", 2)).toBeNull();
  });

  test("a charred prop can't be lit again", () => {
    const field = new FireField(slots);
    field.ignite("bin", 2);
    run(field, FIRE_DURATION + 1, () => 2);
    expect(field.isCharred("bin")).toBe(true);
    expect(field.canIgnite("bin", 2)).toBe(false);
    expect(field.ignite("bin", 2)).toBeNull();
  });

  test("never more than the cap", () => {
    const many = Array.from({ length: MAX_FIRES + 4 }, (_, i) => slot(`b${i}`, "bin", i * 10, 0));
    const field = new FireField(many);
    for (const s of many) field.ignite(s.id, 2);
    expect(field.size).toBe(MAX_FIRES);
  });
});

describe("burning down (fake clock)", () => {
  test("a full prop burns FIRE_DURATION, losing HP as it goes, then is charred", () => {
    const removed: [string, boolean][] = [];
    const field = new FireField([slot("car", "car", 0, 0)], {
      fireAdded: () => {},
      fireUpdated: () => {},
      fireRemoved: (f, charred) => removed.push([f.id, charred]),
    });
    const fire = field.ignite("car", PROP_TYPES.car.maxHp)!;
    expect(fireSecondsLeft(fire)).toBe(FIRE_DURATION);
    run(field, FIRE_DURATION / 2, () => 6);
    expect(fire.fuel).toBeCloseTo(PROP_TYPES.car.maxHp / 2, 3);
    expect(field.isBurning("car")).toBe(true);
    const events = run(field, FIRE_DURATION / 2 + DT, () => 6);
    expect(events).toContainEqual({ type: "burnt", id: "car" });
    expect(field.isBurning("car")).toBe(false);
    expect(field.isCharred("car")).toBe(true);
    expect(removed).toEqual([["car", true]]);
  });

  test("a damaged prop burns for less", () => {
    const field = new FireField([slot("car", "car", 0, 0)]);
    const fire = field.ignite("car", 3)!;
    expect(fireSecondsLeft(fire)).toBe(FIRE_DURATION / 2);
    run(field, FIRE_DURATION / 2 + DT, () => 3);
    expect(field.isCharred("car")).toBe(true);
  });

  test("intensity grows, roars, then dies down", () => {
    const field = new FireField([slot("bin", "bin", 0, 0)]);
    const fire = field.ignite("bin", 2)!;
    run(field, 0.5, () => 2);
    expect(fireIntensity(fire)).toBe(2);
    run(field, 5, () => 2);
    expect(fireIntensity(fire)).toBe(3);
    run(field, FIRE_DURATION - 5.5 - FIRE_DYING_TIME + 0.5, () => 2);
    expect(fireIntensity(fire)).toBe(1);
  });
});

describe("spreading", () => {
  // A bin 2 units from a car (edge to edge), another 2 further, and one far away.
  const slots = [
    slot("car", "car", 0, 0),
    slot("near", "bin", 3.5, 0),
    slot("next", "bin", 6.5, 0),
    slot("far", "bin", 0, 3 + 2.1 + FIRE_SPREAD_RADIUS + 0.6),
  ];
  const hp = fullHp(slots);

  test("not before FIRE_SPREAD_DELAY, then to the nearest prop in the radius", () => {
    const field = new FireField(slots);
    field.ignite("car", 6);
    expect(run(field, FIRE_SPREAD_DELAY - 0.1, hp)).toEqual([]);
    const events = run(field, 0.2, hp);
    expect(events).toEqual([{ type: "spread", from: "car", to: "near" }]);
    expect(field.isBurning("near")).toBe(true);
  });

  test("then waits out the cooldown before trying again; never beyond the radius", () => {
    const field = new FireField(slots);
    const car = field.ignite("car", 6)!;
    run(field, FIRE_SPREAD_DELAY + 0.1, hp);
    expect(car.nextSpreadAt).toBeCloseTo(FIRE_SPREAD_DELAY + FIRE_SPREAD_COOLDOWN, 1);
    // "near" spreads on after its own delay, to "next" (2 away); "far" is out of everyone's radius.
    const events = run(field, FIRE_SPREAD_DELAY + 0.1, hp);
    expect(events).toEqual([{ type: "spread", from: "near", to: "next" }]);
    run(field, FIRE_DURATION, hp);
    expect(field.isBurning("far")).toBe(false);
    expect(field.isCharred("far")).toBe(false);
  });

  test("a fire at the cap keeps burning without spreading", () => {
    const field = new FireField(slots, undefined, 1);
    field.ignite("car", 6);
    expect(run(field, FIRE_SPREAD_DELAY * 2, hp)).toEqual([]);
    expect(field.size).toBe(1);
  });

  test("a street packed with bins never burns more than the cap", () => {
    const packed = Array.from({ length: 30 }, (_, i) => slot(`b${i}`, "bin", (i % 6) * 2, Math.floor(i / 6) * 2));
    const field = new FireField(packed);
    field.ignite("b0", 2);
    let most = 0;
    const hpOf = fullHp(packed);
    for (let t = 0; t < 120; t += DT) {
      field.step(DT, hpOf);
      most = Math.max(most, field.size);
    }
    expect(most).toBe(MAX_FIRES);
  });
});

describe("extinguish hook (#17 pompiers, #13 water cannon)", () => {
  const slots = [slot("bin", "bin", 0, 0), slot("car", "car", 10, 0)];

  test("putting a fire out keeps the HP left, does not char it, and it can burn again", () => {
    const field = new FireField(slots);
    field.ignite("car", 6);
    run(field, FIRE_DURATION / 2, () => 6);
    expect(field.extinguish("car")).toBe(3);
    expect(field.isBurning("car")).toBe(false);
    expect(field.isCharred("car")).toBe(false);
    expect(field.canIgnite("car", 3)).toBe(true);
    expect(field.extinguish("car")).toBeNull();
  });

  test("near(x, z, r): the fires whose prop edge is within r of the point", () => {
    const field = new FireField(slots);
    field.ignite("bin", 2);
    field.ignite("car", 6);
    expect(field.near(0, 2, 1.5).map((f) => f.id)).toEqual(["bin"]);
    expect(field.near(5, 0, 4.5).map((f) => f.id).sort()).toEqual(["bin", "car"]);
    expect(field.near(5, 20, 1)).toEqual([]);
  });

  test("touches: a body in any fire zone", () => {
    const field = new FireField(slots);
    field.ignite("bin", 2);
    expect(field.touches(1.2, 0, PLAYER_RADIUS)).toBe(true);
    expect(field.touches(3, 0, PLAYER_RADIUS)).toBe(false);
  });
});

describe("reset", () => {
  test("clear: no fire and nothing charred, and the views are told", () => {
    const removed: string[] = [];
    const field = new FireField([slot("bin", "bin", 0, 0), slot("car", "car", 10, 0)], {
      fireAdded: () => {},
      fireUpdated: () => {},
      fireRemoved: (f: PropFire) => removed.push(f.id),
    });
    field.ignite("bin", 2);
    run(field, FIRE_DURATION + 1, () => 2);
    field.ignite("car", 6);
    field.clear();
    expect(field.size).toBe(0);
    expect(field.isCharred("bin")).toBe(false);
    expect(field.canIgnite("bin", 2)).toBe(true);
    expect(removed).toEqual(["bin", "car"]);
  });
});

describe("bots and fire zones", () => {
  test("the street's flammable props: bins and cars, some near enough to spread", () => {
    const flammable = L.propSlots.filter((s) => PROP_TYPES[s.kind].flammable);
    expect(flammable.every((s) => s.kind === "bin" || s.kind === "car")).toBe(true);
    const field = new FireField(L.propSlots);
    const car = L.propSlots.find((s) => s.id === "car-2")!;
    field.ignite(car.id, 6);
    expect(field.spreadTarget(field.get(car.id)!, fullHp(L.propSlots))).toBe("bin-6");
  });

  test("a fire zone is blocked on the navigation grid; the path goes around it", () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const field = new FireField([slot("bin", "bin", 0, 0)]);
    const open = new NavGrid(field.hazards(bounds), 0.45);
    field.ignite("bin", 2);
    const zones = field.hazards(bounds);
    const nav = new NavGrid(zones, 0.45);
    expect(open.isWalkable(open.cellAt(0, 1.2))).toBe(true);
    expect(nav.isWalkable(nav.cellAt(0, 1.2))).toBe(false);
    const path = nav.findPath({ x: 0, z: -5 }, { x: 0, z: 5 })!;
    expect(path).not.toBeNull();
    const pt = { x: 0, z: 0 };
    for (const cell of path) {
      nav.centre(cell, pt);
      expect(inFireZone(propShape(slot("bin", "bin", 0, 0), false)!, pt.x, pt.z, 0.45)).toBe(false);
    }
  });
});
