import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL } from "../level/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import {
  circleOverlaps,
  createBody,
  isAirborne,
  isDown,
  isFlying,
  launchBody,
  stepBody,
  type CollisionWorld,
} from "../physics/index.js";
import { propCollisionWorld } from "../prop/index.js";
import { ThrowableKind } from "../throwable/index.js";
import {
  CARRY_DURATION,
  CARRY_RANGE,
  TEAMMATE_FLIGHT_TIME,
  TEAMMATE_HIT_MARGIN,
  TEAMMATE_LAND_DOWN,
  TEAMMATE_THROW_SPEED,
} from "./constants.js";
import {
  canCarry,
  canPickUpTeammate,
  carryDropReason,
  dropDirection,
  flightContacts,
  pickCarryTarget,
  pickInteract,
  teammateLaunch,
  type CarrySubject,
  type InteractCandidates,
} from "./carry.js";

const DT = 1 / 30;
const R = PLAYER_RADIUS;
const STILL = { x: 0, z: 0 };
const OPEN: CollisionWorld = { bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, boxes: [], circles: [] };

const subject = (id: string, x: number, z = 0, over: Partial<CarrySubject> = {}): CarrySubject => ({
  id,
  x,
  z,
  status: PlayerStatus.Free,
  down: false,
  onFire: false,
  item: ThrowableKind.None,
  carried: false,
  carrying: false,
  ...over,
});

describe("pick-up rules", () => {
  const me = subject("me", 0);

  test("a free teammate in range is picked up, the nearest first", () => {
    expect(pickCarryTarget(me, [subject("far", 1.2), subject("near", 0.9)])).toBe("near");
    expect(pickCarryTarget(me, [subject("edge", CARRY_RANGE)])).toBe("edge");
    expect(pickCarryTarget(me, [subject("out", CARRY_RANGE + 0.01)])).toBeNull();
    // Ties go to the smaller id.
    expect(pickCarryTarget(me, [subject("b", 1), subject("a", -1)])).toBe("a");
  });

  test("never yourself, never a grabbed, KO, down, burning or already carried teammate", () => {
    expect(pickCarryTarget(me, [me])).toBeNull();
    for (const over of [
      { status: PlayerStatus.Grabbed },
      { status: PlayerStatus.Ko },
      { status: PlayerStatus.Arrested },
      { down: true },
      { onFire: true },
      { carried: true },
      { carrying: true },
    ]) {
      expect(canPickUpTeammate(me, subject("mate", 1, 0, over))).toBe(false);
    }
  });

  test("the carrier must be free, standing, empty-handed and in no carry", () => {
    const mate = subject("mate", 1);
    expect(canCarry(me)).toBe(true);
    for (const over of [{ item: ThrowableKind.Pave }, { down: true }, { carried: true }, { carrying: true }, { status: PlayerStatus.Grabbed }]) {
      const self = subject("me", 0, 0, over);
      expect(canCarry(self)).toBe(false);
      expect(canPickUpTeammate(self, mate)).toBe(false);
    }
  });

  test("simultaneous pick-ups: the first message wins, the second gets nothing (no A carries B carries A)", () => {
    // A and B press interact on the same tick; the server handles A's message first.
    const a = subject("A", 0);
    const b = subject("B", 1);
    expect(pickCarryTarget(a, [a, b])).toBe("B");
    // Now B is carried by A: B's own press finds nothing (B can't carry, A is carrying).
    const a2 = { ...a, carrying: true };
    const b2 = { ...b, carried: true };
    expect(pickCarryTarget(b2, [a2, b2])).toBeNull();
    // A third player can't pick up either of them.
    expect(pickCarryTarget(subject("C", 0.5), [a2, b2])).toBeNull();
  });
});

describe("pickInteract (interact priority)", () => {
  const none: InteractCandidates = { carryingTeammate: false, rescue: null, fire: null, teammate: null, item: null };

  test("rescue, then pat out, then pick up an item, then a teammate, then light", () => {
    const all: InteractCandidates = {
      carryingTeammate: false,
      rescue: "grabbed",
      fire: { kind: "putOut", target: "burning" },
      teammate: "mate",
      item: "item-1",
    };
    expect(pickInteract(all)).toEqual({ kind: "rescue", target: "grabbed" });
    expect(pickInteract({ ...all, rescue: null })).toEqual({ kind: "putOut", target: "burning" });
    expect(pickInteract({ ...all, rescue: null, fire: { kind: "light", target: "bin-1" } })).toEqual({ kind: "pickUp", target: "item-1" });
    // Reaching for a pavé next to a friend picks up the pavé; off the pavé, the friend.
    expect(pickInteract({ ...all, rescue: null, fire: null })).toEqual({ kind: "pickUp", target: "item-1" });
    expect(pickInteract({ ...all, rescue: null, fire: { kind: "light", target: "bin-1" }, item: null })).toEqual({ kind: "carry", target: "mate" });
    expect(pickInteract({ ...none, fire: { kind: "light", target: "bin-1" } })).toEqual({ kind: "light", target: "bin-1" });
    expect(pickInteract({ ...none, item: "item-1", fire: { kind: "light", target: "bin-1" } })?.kind).toBe("pickUp");
    expect(pickInteract(none)).toBeNull();
  });

  test("a carrier only puts their teammate down", () => {
    expect(pickInteract({ carryingTeammate: true, rescue: "g", fire: { kind: "putOut", target: "b" }, teammate: "m", item: "i" })).toEqual({
      kind: "putDown",
    });
  });
});

describe("drop rules", () => {
  const free = { status: PlayerStatus.Free, down: false };

  test("carried on until the timer runs out", () => {
    expect(carryDropReason(free, free, 0)).toBeNull();
    expect(carryDropReason(free, free, CARRY_DURATION - 0.05)).toBeNull();
    expect(carryDropReason(free, free, CARRY_DURATION)).toBe("timeout");
    // Ticks of 1/30 s add up with float error: the last one still counts.
    let t = 0;
    for (let i = 0; i < CARRY_DURATION * 30; i++) t += DT;
    expect(carryDropReason(free, free, t)).toBe("timeout");
  });

  test("the carrier hit to the ground, grabbed or KO'd drops at once", () => {
    expect(carryDropReason({ ...free, down: true }, free, 0.1)).toBe("carrier");
    expect(carryDropReason({ ...free, status: PlayerStatus.Grabbed }, free, 0.1)).toBe("carrier");
    expect(carryDropReason({ ...free, status: PlayerStatus.Ko }, free, 0.1)).toBe("carrier");
  });

  test("the carried player KO'd, or either one gone, ends it", () => {
    expect(carryDropReason(free, { ...free, status: PlayerStatus.Ko }, 0.1)).toBe("carried");
    expect(carryDropReason(undefined, free, 0.1)).toBe("gone");
    expect(carryDropReason(free, undefined, 0.1)).toBe("gone");
  });

  test("the drop push goes in a unit direction, whatever the random number", () => {
    for (const r of [0, 0.25, 0.5, 0.99, Number.NaN]) {
      const d = dropDirection(r);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 9);
    }
  });
});

describe("launch", () => {
  test("along the aim, re-normalized, at the throw speed; a zero aim goes along the facing", () => {
    const l = teammateLaunch(3, 4, 0);
    expect(l.dirX).toBeCloseTo(0.6, 9);
    expect(l.dirZ).toBeCloseTo(0.8, 9);
    expect(l.speed).toBe(TEAMMATE_THROW_SPEED);
    expect(l.flight).toBe(TEAMMATE_FLIGHT_TIME);
    expect(l.down).toBe(TEAMMATE_LAND_DOWN);
    const facing = teammateLaunch(0, 0, Math.PI / 2);
    expect(facing.dirX).toBeCloseTo(1, 9);
    expect(facing.dirZ).toBeCloseTo(0, 9);
    const junk = teammateLaunch(Number.NaN, Number.POSITIVE_INFINITY, Math.PI);
    expect(Math.hypot(junk.dirX, junk.dirZ)).toBeCloseTo(1, 9);
  });

  test("the thrown body flies over the ground, down, then lands and gets up after the knock-down time", () => {
    const b = createBody(0, 0);
    // Even in get-up immunity, a throw floors.
    b.immuneTime = 0.5;
    const res = launchBody(b, 0, 2, TEAMMATE_THROW_SPEED, TEAMMATE_FLIGHT_TIME, TEAMMATE_LAND_DOWN);
    expect(res).toEqual({ dirX: 0, dirZ: 1, strength: TEAMMATE_THROW_SPEED, knockedDown: true });
    expect(isDown(b) && isAirborne(b) && isFlying(b)).toBe(true);
    let t = 0;
    let landedAt = -1;
    let upAt = -1;
    while (t < 5 && upAt < 0) {
      const step = stepBody(OPEN, b, { x: 1, z: 0 }, 6, R, DT);
      t += DT;
      if (step.landed && landedAt < 0) landedAt = t;
      if (step.gotUp) upAt = t;
      // Down for the whole flight: the held walk input does nothing.
      if (landedAt < 0) expect(b.x).toBe(0);
    }
    expect(landedAt).toBeCloseTo(TEAMMATE_FLIGHT_TIME, 1);
    expect(upAt).toBeCloseTo(TEAMMATE_FLIGHT_TIME + TEAMMATE_LAND_DOWN, 1);
    // About 7 m along the throw, in a straight line.
    expect(b.z).toBeGreaterThan(5);
    expect(b.z).toBeLessThan(10);
  });

  test("invalid input changes nothing", () => {
    const b = createBody(1, 2);
    expect(launchBody(b, 0, 0, TEAMMATE_THROW_SPEED, 0.5, 1)).toBeNull();
    expect(launchBody(b, 1, 0, Number.NaN, 0.5, 1)).toBeNull();
    expect(launchBody(b, 1, 0, 10, -1, 1)).toBeNull();
    expect(b).toEqual(createBody(1, 2));
  });

  test("on the real street, at full strength, from everywhere in every direction: never inside a wall or out of the street", () => {
    const world = propCollisionWorld(STREET_LEVEL, () => false);
    const { bounds } = STREET_LEVEL;
    let throws = 0;
    for (let z = bounds.minZ + 1; z < bounds.maxZ; z += 3) {
      for (let x = bounds.minX + 1; x < bounds.maxX; x += 1.5) {
        if (circleOverlaps(world, x, z, R)) continue;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const b = createBody(x, z);
          launchBody(b, Math.sin(a), Math.cos(a), TEAMMATE_THROW_SPEED * 1.5, TEAMMATE_FLIGHT_TIME, TEAMMATE_LAND_DOWN);
          throws++;
          for (let i = 0; i < 90; i++) {
            stepBody(world, b, STILL, 6, R, DT);
            // In the air it may pass over a bin; never into anything else, never out of the street.
            const inside = circleOverlaps(world, b.x, b.z, R, 1e-6, isAirborne(b));
            if (inside) throw new Error(`thrown from (${x}, ${z}) at ${a.toFixed(2)} rad: inside something at (${b.x}, ${b.z}), step ${i}`);
          }
          // Landed: clear of everything, bins included.
          expect(circleOverlaps(world, b.x, b.z, R)).toBe(false);
        }
      }
    }
    expect(throws).toBeGreaterThan(1000);
  });
});

describe("flightContacts", () => {
  const crs = { id: "crs-1", kind: "crs" as const, shape: { type: "circle" as const, x: 0, z: 5, r: 0.45 } };
  const car = { id: "car-1", kind: "prop" as const, shape: { type: "box" as const, x: 3, z: 0, halfX: 1, halfZ: 2 } };

  test("what the flight passed through or brushed this tick, nearest first", () => {
    expect(flightContacts({ x: 0, z: 0 }, { x: 0, z: 10 }, R, [crs, car]).map((t) => t.id)).toEqual(["crs-1"]);
    // Passing beside the CRS within the margin still hits; further out misses.
    const reach = R + 0.45 + TEAMMATE_HIT_MARGIN;
    expect(flightContacts({ x: reach - 0.01, z: 0 }, { x: reach - 0.01, z: 10 }, R, [crs])).toHaveLength(1);
    expect(flightContacts({ x: reach + 0.01, z: 0 }, { x: reach + 0.01, z: 10 }, R, [crs])).toHaveLength(0);
    // Bounced off the car's side (the step stops it at the edge): touches it.
    expect(flightContacts({ x: 0, z: 0 }, { x: 3 - 1 - R, z: 0 }, R, [car, crs]).map((t) => t.id)).toEqual(["car-1"]);
    // Both on one long move: the nearer first.
    const far = { ...crs, id: "crs-2", shape: { ...crs.shape, x: 6, z: 0 } };
    expect(flightContacts({ x: 0, z: 0 }, { x: 10, z: 0 }, R, [far, car]).map((t) => t.id)).toEqual(["car-1", "crs-2"]);
  });

  test("a body that did not move still touches what it sits against", () => {
    expect(flightContacts({ x: 0, z: 4.2 }, { x: 0, z: 4.2 }, R, [crs])).toHaveLength(1);
    expect(flightContacts({ x: 0, z: 0 }, { x: 0, z: 0 }, R, [crs])).toHaveLength(0);
  });
});
