import { describe, expect, test } from "bun:test";
import { CRS_STATS, CrsKind, NavGrid, type BrigadeStats } from "../crs/index.js";
import { FireField } from "../fire/index.js";
import { STREET_LEVEL, inRect, type PropSlot } from "../level/index.js";
import { circleOverlaps, type CollisionWorld } from "../physics/index.js";
import { propCollisionWorld, type PropShape } from "../prop/index.js";
import {
  FireClaims,
  approachPoint,
  crewGoesBack,
  downTooLong,
  pickAccidentalTarget,
  pickBay,
  pickFire,
  rollAccidentalSpray,
  shouldDispatchTruck,
  truckBays,
  truckMayLeave,
} from "./brigade.js";

const POMPIER = CRS_STATS[CrsKind.Pompier];
const BRIGADE = POMPIER.brigade as BrigadeStats;

describe("fire claims", () => {
  test("one pompier per fire, one fire per pompier", () => {
    const c = new FireClaims();
    expect(c.claim("bin-1", "p1")).toBe(true);
    expect(c.claim("bin-1", "p2")).toBe(false);
    expect(c.holder("bin-1")).toBe("p1");
    // Taking another fire drops the first.
    expect(c.claim("car-1", "p1")).toBe(true);
    expect(c.holder("bin-1")).toBeUndefined();
    expect(c.claim("bin-1", "p2")).toBe(true);
    expect(c.size).toBe(2);
  });

  test("released when the pompier lets go, or when the fire is out", () => {
    const c = new FireClaims();
    c.claim("bin-1", "p1");
    c.claim("car-1", "p2");
    expect(c.release("p1")).toBe("bin-1");
    expect(c.holder("bin-1")).toBeUndefined();
    expect(c.keep((id) => id !== "car-1")).toEqual(["p2"]);
    expect(c.claimOf("p2")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  test("two pompiers never stay on the same fire after it is out", () => {
    const c = new FireClaims();
    const fires = [{ id: "a" }, { id: "b" }];
    const cost = (f: { id: string }) => (f.id === "a" ? 1 : 2);
    // Both want the nearer fire: the second gets the other one.
    const p1 = pickFire("p1", fires, c, cost);
    c.claim(p1!.id, "p1");
    const p2 = pickFire("p2", fires, c, cost);
    c.claim(p2!.id, "p2");
    expect([p1?.id, p2?.id]).toEqual(["a", "b"]);
    // Fire "a" goes out: p1 is free, and the only fire left is p2's.
    c.keep((id) => id === "b");
    expect(c.claimOf("p1")).toBeUndefined();
    expect(pickFire("p1", [{ id: "b" }], c, cost)).toBeNull();
    expect(pickFire("p2", [{ id: "b" }], c, cost)?.id).toBe("b");
  });
});

describe("target choice", () => {
  test("the shortest walk, not the straight line; unreachable fires are skipped", () => {
    const c = new FireClaims();
    const fires = [{ id: "near" }, { id: "far" }, { id: "walled" }];
    const walk: Record<string, number | null> = { near: 30, far: 12, walled: null };
    expect(pickFire("p", fires, c, (f) => walk[f.id] ?? null)?.id).toBe("far");
  });

  test("its own claim stays a candidate; a given-up fire does not", () => {
    const c = new FireClaims();
    c.claim("a", "p");
    expect(pickFire("p", [{ id: "a" }], c, () => 5)?.id).toBe("a");
    expect(pickFire("p", [{ id: "a" }, { id: "b" }], c, () => 5, (id) => id === "a")?.id).toBe("b");
  });

  test("a pompier walks to the near side of a fire, outside its zone", () => {
    const bin: PropShape = { type: "circle", x: 0, z: 0, r: 0.5 };
    const p = approachPoint(bin, { x: 0, z: -10 });
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeLessThan(-1.1);
    expect(p.z).toBeGreaterThan(-3);
  });

  test("ties go to the smaller id", () => {
    expect(pickFire("p", [{ id: "b" }, { id: "a" }], new FireClaims(), () => 1)?.id).toBe("a");
  });

  test("two fires, one behind the other in a corridor: the near one first, then the far one", () => {
    // A corridor 4 m wide; fire A blocks it completely, fire B is behind it.
    const bounds = { minX: -2, maxX: 2, minZ: -20, maxZ: 20 };
    const slots: PropSlot[] = [
      { id: "a", kind: "bin", x: 0, z: 0, rotation: 0 },
      { id: "b", kind: "bin", x: 0, z: 6, rotation: 0 },
    ];
    const field = new FireField(slots);
    field.ignite("a", 2);
    field.ignite("b", 2);
    const grid = (hazards: CollisionWorld) => new NavGrid({ bounds, boxes: [...hazards.boxes], circles: [...hazards.circles] }, 0.6);
    const from = { x: 0, z: -10 };
    const costOn = (nav: NavGrid) => (f: { shape: PropShape }) => {
      const path = nav.findPath(from, approachPoint(f.shape, from));
      return path === null ? null : path.length;
    };
    const fires = () => Array.from(field.values());
    const both = grid(field.hazards(bounds));
    expect(costOn(both)(fires().find((f) => f.id === "b")!)).toBeNull();
    expect(pickFire("p", fires(), new FireClaims(), costOn(both))?.id).toBe("a");
    // A is out: the grid is rebuilt without it, and B can be reached.
    field.extinguish("a");
    const after = grid(field.hazards(bounds));
    expect(pickFire("p", fires(), new FireClaims(), costOn(after))?.id).toBe("b");
  });
});

describe("trucks", () => {
  const v = { burning: 1, burningFor: 0, trucks: 0, sinceLastTruck: Infinity };

  test("the first truck sets off after the delay, only while something burns", () => {
    expect(shouldDispatchTruck({ ...v, burningFor: BRIGADE.arriveDelay - 0.1 }, BRIGADE)).toBe(false);
    expect(shouldDispatchTruck({ ...v, burningFor: BRIGADE.arriveDelay }, BRIGADE)).toBe(true);
    expect(shouldDispatchTruck({ ...v, burning: 0, burningFor: 99 }, BRIGADE)).toBe(false);
  });

  test("a second truck only for long fires, never over the cap", () => {
    const one = { ...v, trucks: 1, sinceLastTruck: BRIGADE.extraTruckAfter };
    expect(shouldDispatchTruck({ ...one, burningFor: BRIGADE.extraTruckAfter - 1 }, BRIGADE)).toBe(false);
    expect(shouldDispatchTruck({ ...one, burningFor: BRIGADE.extraTruckAfter }, BRIGADE)).toBe(true);
    expect(shouldDispatchTruck({ ...one, burningFor: 999, sinceLastTruck: 1 }, BRIGADE)).toBe(false);
    for (let n = BRIGADE.maxTrucks; n < BRIGADE.maxTrucks + 3; n++) {
      expect(shouldDispatchTruck({ ...v, trucks: n, burningFor: 999, sinceLastTruck: 999 }, BRIGADE)).toBe(false);
    }
  });

  test("the unit table: one truck of two pompiers, a second one only for long fires", () => {
    expect(BRIGADE.crew).toBe(2);
    expect(BRIGADE.maxTrucks).toBe(2);
    expect(BRIGADE.extraTruckAfter).toBeGreaterThan(BRIGADE.arriveDelay);
  });

  test("leave condition: crews go back only once nothing burns; the truck leaves once its crew is aboard", () => {
    expect(crewGoesBack(1)).toBe(false);
    expect(crewGoesBack(0)).toBe(true);
    expect(truckMayLeave(2)).toBe(false);
    expect(truckMayLeave(1)).toBe(false);
    expect(truckMayLeave(0)).toBe(true);
  });

  test("down too long gives the fire up", () => {
    expect(downTooLong(BRIGADE.downTooLong - 0.1, BRIGADE)).toBe(false);
    expect(downTooLong(BRIGADE.downTooLong + 0.1, BRIGADE)).toBe(true);
  });

  test("one bay per side street: parked outside the street, the crew get off inside it, clear of everything", () => {
    const bays = truckBays(STREET_LEVEL, POMPIER.radius);
    const barriers = STREET_LEVEL.boxes.filter((b) => b.kind === "barrier");
    expect(bays.length).toBe(barriers.length);
    expect(bays.length).toBeGreaterThan(0);
    const world = propCollisionWorld(STREET_LEVEL, () => false);
    const b = STREET_LEVEL.bounds;
    for (const bay of bays) {
      // The truck never enters the street: its whole body is beyond its side street's barrier.
      const barrier = barriers.find((x) => x.id === bay.id)!;
      expect(Math.abs(bay.park.x) - 2.6).toBeGreaterThan(Math.abs(barrier.x) + barrier.halfX);
      expect(inRect(b, bay.door.x, bay.door.z)).toBe(true);
      expect(circleOverlaps(world, bay.door.x, bay.door.z, POMPIER.radius)).toBe(false);
      // Facing the street.
      expect(Math.sign(Math.sin(bay.rotation))).toBe(-Math.sign(bay.park.x));
    }
  });

  test("the bay nearest the fire, another one when it is taken", () => {
    const bays = truckBays(STREET_LEVEL, POMPIER.radius);
    const at = { x: 8.5, z: -10 };
    const first = pickBay(bays, at);
    expect(first).not.toBeNull();
    const second = pickBay(bays, at, (id) => id === first!.id);
    expect(second?.id).not.toBe(first?.id);
    // All taken: share the nearest.
    expect(pickBay(bays, at, () => true)?.id).toBe(first!.id);
  });
});

describe("accidental spray", () => {
  test("knob at 0: never, whatever the dice", () => {
    for (let i = 0; i < 1000; i++) expect(rollAccidentalSpray(0, 1 / 30, () => 0)).toBe(false);
    expect(rollAccidentalSpray(0, 100, () => 0)).toBe(false);
  });

  test("knob above 0: now and then, about `chance` times a second", () => {
    expect(rollAccidentalSpray(0.1, 1 / 30, () => 0)).toBe(true);
    expect(rollAccidentalSpray(0.1, 1 / 30, () => 0.999)).toBe(false);
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let n = 0;
    const seconds = 2000;
    for (let t = 0; t < seconds * 30; t++) if (rollAccidentalSpray(0.08, 1 / 30, rng)) n++;
    expect(n / seconds).toBeGreaterThan(0.05);
    expect(n / seconds).toBeLessThan(0.11);
  });

  test("the default knob is on, and low", () => {
    const chance = POMPIER.hose?.accidentalSprayChance ?? 0;
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThanOrEqual(0.2);
  });

  test("only a CRS by the pompier's own fire, within the hose's reach", () => {
    const bin: PropShape = { type: "circle", x: 0, z: 0, r: 0.5 };
    const pompier = { x: 0, z: -3 };
    const police = [
      { id: "far-from-fire", x: 0, z: -9 },
      { id: "by-fire", x: 2, z: 0 },
      { id: "closer", x: 1, z: 0 },
    ];
    expect(pickAccidentalTarget(bin, pompier, police, 3, 5)?.id).toBe("closer");
    expect(pickAccidentalTarget(bin, pompier, [police[0]!], 3, 5)).toBeNull();
    // By the fire but out of the hose's reach.
    expect(pickAccidentalTarget(bin, { x: 0, z: -9 }, [police[1]!], 3, 5)).toBeNull();
  });
});
