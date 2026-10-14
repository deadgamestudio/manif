import { describe, expect, test } from "bun:test";
import { cloudFade, cloudGrowth } from "./cloudShape.ts";

describe("cloudGrowth", () => {
  test("starts at a quarter and reaches the full radius when grown", () => {
    expect(cloudGrowth(0, 0.6)).toBeCloseTo(0.25);
    expect(cloudGrowth(0.6, 0.6)).toBe(1);
    expect(cloudGrowth(5, 0.6)).toBe(1);
  });
  test("eases out: past half-way by a third of the time", () => {
    expect(cloudGrowth(0.2, 0.6)).toBeGreaterThan(0.6);
  });
});

describe("cloudFade", () => {
  test("full until the fade, then down to nothing", () => {
    expect(cloudFade(4, 1.5)).toBe(1);
    expect(cloudFade(0.75, 1.5)).toBeCloseTo(0.5);
    expect(cloudFade(0, 1.5)).toBe(0);
    expect(cloudFade(-1, 1.5)).toBe(0);
  });
});
