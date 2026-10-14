import { describe, expect, test } from "bun:test";
import { FIRE_REACH } from "@manif/shared";
import { flameSize } from "./flameShape.ts";

const LOOK = { growIn: 0.5, intensityScale: [0, 0.45, 0.8, 1.1] };

describe("flameSize", () => {
  test("a new fire's zone starts at the prop's edge and grows to the synced radius", () => {
    expect(flameSize(2, 2, 0, LOOK).r).toBeCloseTo(2 - FIRE_REACH);
    expect(flameSize(2, 2, 60, LOOK).r).toBeCloseTo(2);
  });
  test("flares up from nothing, then the intensity sets the height", () => {
    expect(flameSize(2, 3, 0, LOOK).height).toBe(0);
    expect(flameSize(2, 1, 10, LOOK).height).toBe(LOOK.intensityScale[1]!);
    expect(flameSize(2, 3, 10, LOOK).height).toBeGreaterThan(flameSize(2, 1, 10, LOOK).height);
  });
});
