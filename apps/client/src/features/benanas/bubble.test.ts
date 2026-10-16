import { describe, expect, test } from "bun:test";
import { BENANAS_BUBBLE_MAX, BUBBLE_NEAR, benanasBubbleShift } from "./bubble.ts";
import { ARMBAND_PAINT, BENANAS_PAINT, HELMET_PAINT } from "./look.ts";

describe("Bénanas's bubble next to Moluchan's and La Douane's (#123)", () => {
  test("nobody, or both far: stays over his head", () => {
    expect(benanasBubbleShift(0, 0, [null, undefined])).toEqual({ x: 0, z: 0 });
    expect(benanasBubbleShift(0, 0, [{ x: BUBBLE_NEAR + 1, z: 0 }, { x: 0, z: BUBBLE_NEAR + 1 }])).toEqual({ x: 0, z: 0 });
  });

  test("steps away from each one close by", () => {
    const fromMoluchan = benanasBubbleShift(0, 0, [{ x: 1, z: 0 }, null]);
    expect(fromMoluchan.x).toBeLessThan(0);
    const fromDouane = benanasBubbleShift(0, 0, [null, { x: 0, z: 1 }]);
    expect(fromDouane.z).toBeLessThan(0);
    const both = benanasBubbleShift(0, 0, [{ x: 1, z: 0 }, { x: 0, z: 1 }]);
    expect(both.x).toBeLessThan(0);
    expect(both.z).toBeLessThan(0);
  });

  test("never further aside than the cap, even with both on top of him", () => {
    const s = benanasBubbleShift(0, 0, [{ x: 0.01, z: 0 }, { x: 0.01, z: 0.001 }]);
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(BENANAS_BUBBLE_MAX + 1e-9);
  });
});

describe("his look", () => {
  test("never paints the skin cell on the helmet or the armband; a grey hoodie", () => {
    expect(HELMET_PAINT[6]).toBeUndefined();
    expect(ARMBAND_PAINT[6]).toBeUndefined();
    expect(BENANAS_PAINT[8]).toBe("#8c8f96");
  });
});
