import { describe, expect, test } from "bun:test";
import type { BoxShape } from "../physics/index.js";
import type { PropShape } from "../prop/index.js";
import { MELEE_COOLDOWN, MELEE_HALF_ANGLE, MELEE_RANGE } from "./constants.js";
import { cooldownReady, hasLineOfSight, inMeleeArc, meleeContact, meleeHits, segmentEntry, type Obstacles } from "./melee.js";

/** Facing +Z (rotation 0) from the origin. */
const me = { x: 0, z: 0, rotation: 0 };
const none: Obstacles = { boxes: [], circles: [] };
const box = (x: number, z: number, halfX: number, halfZ: number): PropShape => ({ type: "box", x, z, halfX, halfZ });
const circle = (x: number, z: number, r: number): PropShape => ({ type: "circle", x, z, r });

describe("inMeleeArc", () => {
  test("in front, within range", () => {
    expect(inMeleeArc(me, { x: 0, z: 1 })).toBe(true);
  });

  test("behind is not hit", () => {
    expect(inMeleeArc(me, { x: 0, z: -1 })).toBe(false);
  });

  test("at the edge of range is hit, just past it is not", () => {
    expect(inMeleeArc(me, { x: 0, z: MELEE_RANGE })).toBe(true);
    expect(inMeleeArc(me, { x: 0, z: MELEE_RANGE + 0.01 })).toBe(false);
  });

  test("at the edge of the angle is hit, just past it is not", () => {
    const at = (a: number) => ({ x: Math.sin(a), z: Math.cos(a) });
    expect(inMeleeArc(me, at(MELEE_HALF_ANGLE))).toBe(true);
    expect(inMeleeArc(me, at(-MELEE_HALF_ANGLE))).toBe(true);
    expect(inMeleeArc(me, at(MELEE_HALF_ANGLE + 0.02))).toBe(false);
  });

  test("follows the facing", () => {
    const east = { x: 0, z: 0, rotation: Math.PI / 2 };
    expect(inMeleeArc(east, { x: 1, z: 0 })).toBe(true);
    expect(inMeleeArc(east, { x: 0, z: 1 })).toBe(false);
  });

  test("garbage positions never hit", () => {
    expect(inMeleeArc(me, { x: Number.NaN, z: 1 })).toBe(false);
  });
});

describe("meleeContact", () => {
  test("reaches a bin whose near edge is in range", () => {
    // Centre 1.5 away, radius 0.5: near edge at 1.0.
    expect(meleeContact(me, circle(0, 1.5, 0.5))).not.toBeNull();
    expect(meleeContact(me, circle(0, 2, 0.5))).toBeNull();
  });

  test("reaches a long car seen at an angle along the facing line", () => {
    // Nearest point of the car is out to the side (outside the arc), but the facing line meets it.
    const car = box(1.5, 0, 1, 2.1);
    const facingNE = { x: 0, z: 0, rotation: Math.PI / 2 - 0.1 };
    expect(meleeContact(facingNE, car)).not.toBeNull();
    // Facing away from it: no.
    expect(meleeContact({ ...facingNE, rotation: -Math.PI / 2 }, car)).toBeNull();
  });

  test("a prop behind the player is not hit even when touching", () => {
    expect(meleeContact(me, box(0, -0.9, 1, 0.5))).toBeNull();
  });
});

describe("line of sight", () => {
  const wall: BoxShape = { x: 0, z: 0.6, halfX: 2, halfZ: 0.1 };
  const walled: Obstacles = { boxes: [wall], circles: [] };

  test("a wall between blocks, nothing between does not", () => {
    expect(hasLineOfSight(walled, me, { x: 0, z: 1.1 })).toBe(false);
    expect(hasLineOfSight(none, me, { x: 0, z: 1.1 })).toBe(true);
  });

  test("a target against the wall on our side is still in sight", () => {
    expect(hasLineOfSight(walled, me, { x: 0, z: 0.5 })).toBe(true);
  });

  test("round obstacles block too", () => {
    expect(hasLineOfSight({ boxes: [], circles: [{ x: 0, z: 0.6, r: 0.2 }] }, me, { x: 0, z: 1.1 })).toBe(false);
  });

  test("segmentEntry finds where a segment enters a box", () => {
    expect(segmentEntry({ x: 0, z: 0 }, { x: 0, z: 2 }, box(0, 1.5, 1, 0.5))).toBeCloseTo(0.5, 9);
    expect(segmentEntry({ x: 0, z: 0 }, { x: 0, z: 0.9 }, box(0, 1.5, 1, 0.5))).toBeNull();
  });
});

describe("meleeHits", () => {
  const targets = [
    { id: "front", shape: circle(0, 1.2, 0.5) },
    { id: "behind", shape: circle(0, -1.2, 0.5) },
    { id: "far", shape: circle(0, 5, 0.5) },
  ];

  test("hits only what is in front and in reach", () => {
    expect(meleeHits(me, targets, none).map((h) => h.id)).toEqual(["front"]);
  });

  test("nothing in range: no hit", () => {
    expect(meleeHits(me, [targets[2]!], none)).toEqual([]);
  });

  test("a prop behind a wall is not hit", () => {
    const wall: BoxShape = { x: 0, z: 0.5, halfX: 2, halfZ: 0.1 };
    expect(meleeHits(me, targets, { boxes: [wall], circles: [] })).toEqual([]);
  });
});

describe("cooldownReady", () => {
  test("the first swing is always allowed", () => {
    expect(cooldownReady(undefined, 0)).toBe(true);
  });

  test("blocks until the cooldown has passed", () => {
    expect(cooldownReady(10, 10)).toBe(false);
    expect(cooldownReady(10, 10 + MELEE_COOLDOWN / 2)).toBe(false);
    expect(cooldownReady(10, 10 + MELEE_COOLDOWN)).toBe(true);
  });

  test("clicking every tick for 2 s lands one swing per cooldown", () => {
    let last: number | undefined;
    let swings = 0;
    for (let now = 0; now < 2; now += 1 / 30) {
      if (cooldownReady(last, now)) {
        last = now;
        swings++;
      }
    }
    expect(swings).toBe(Math.ceil(2 / MELEE_COOLDOWN));
  });
});
