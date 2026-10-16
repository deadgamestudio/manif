import { describe, expect, test } from "bun:test";
import { BUBBLE_NEAR, BUBBLE_STEP, bubbleShift } from "./bubble.ts";
import { douanePaint } from "./look.ts";

const PEOPLE = Array.from({ length: 10 }, (_, i) => ({ skin: `#0${i}0000`, hair: "#000000" }));

describe("La Douane's bubble next to Moluchan's (#120)", () => {
  test("no Moluchan, or far: stays over his head", () => {
    expect(bubbleShift(0, 0, null, null)).toEqual({ x: 0, z: 0 });
    expect(bubbleShift(0, 0, BUBBLE_NEAR + 0.1, 0)).toEqual({ x: 0, z: 0 });
  });

  test("close: steps away from Moluchan, more the closer they are", () => {
    const near = bubbleShift(0, 0, 1, 0);
    expect(near.x).toBeLessThan(0);
    expect(near.z).toBeCloseTo(0);
    const nearer = bubbleShift(0, 0, 0.5, 0);
    expect(Math.abs(nearer.x)).toBeGreaterThan(Math.abs(near.x));
    expect(bubbleShift(0, 0, 0, 0)).toEqual({ x: BUBBLE_STEP, z: 0 });
  });
});

describe("his look", () => {
  test("shirtless: his top is his skin; the same index always gives the same kid", () => {
    for (let i = 0; i < 10; i++) {
      const p = douanePaint(i, PEOPLE);
      expect(p[9]).toBe(p[6]);
      expect(douanePaint(i, PEOPLE)).toEqual(p);
    }
    // Out of range indices are clamped, never undefined.
    expect(douanePaint(99, PEOPLE)[6]).toBeDefined();
    expect(douanePaint(-3, PEOPLE)[6]).toBeDefined();
  });
});
