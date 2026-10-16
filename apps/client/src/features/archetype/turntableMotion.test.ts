import { describe, expect, test } from "bun:test";
import { HOP_HEIGHT, HOP_SECONDS, PICKED_TURN_SECONDS, TURN_SECONDS, hopHeight, turnSpeed } from "./turntableMotion.ts";

describe("the role picker's turntable (#128)", () => {
  test("a card turns once in TURN_SECONDS, the picked one faster", () => {
    expect(turnSpeed(false) * TURN_SECONDS).toBeCloseTo(2 * Math.PI);
    expect(turnSpeed(true) * PICKED_TURN_SECONDS).toBeCloseTo(2 * Math.PI);
    expect(turnSpeed(true)).toBeGreaterThan(turnSpeed(false));
  });

  test("the hop starts and ends on the ground, never goes below it nor above HOP_HEIGHT", () => {
    expect(hopHeight(-1)).toBe(0);
    expect(hopHeight(0)).toBe(0);
    expect(hopHeight(HOP_SECONDS)).toBe(0);
    expect(hopHeight(10)).toBe(0);
    expect(hopHeight(Number.NaN)).toBe(0);
    let top = 0;
    for (let t = 0; t <= HOP_SECONDS; t += 0.005) {
      const y = hopHeight(t);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(HOP_HEIGHT + 1e-9);
      top = Math.max(top, y);
    }
    expect(top).toBeGreaterThan(HOP_HEIGHT * 0.95);
  });

  test("it hops twice: the feet touch down between the two hops", () => {
    const heights = Array.from({ length: 200 }, (_, i) => hopHeight(((i + 0.5) / 200) * HOP_SECONDS));
    const landings = heights.filter((y, i) => i > 0 && i < heights.length - 1 && y < heights[i - 1]! && y < heights[i + 1]!);
    expect(landings.length).toBe(1);
  });
});
