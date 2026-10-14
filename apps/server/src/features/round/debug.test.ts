import { describe, expect, test } from "bun:test";
import { parseDebugRound, taintsRound } from "./debug.js";

describe("taintsRound (#41)", () => {
  test("every debug action keeps the round out of the totals", () => {
    expect(taintsRound({ action: "teleport", progress: 1 }, 100)).toBe(true);
    expect(taintsRound({ action: "hold" }, 100)).toBe(true);
    expect(taintsRound({ action: "calm" }, 100)).toBe(true);
    expect(taintsRound({ action: "clear" }, 100)).toBe(true);
    expect(taintsRound({ action: "moluchan" }, 100)).toBe(true);
    expect(taintsRound({ action: "crs", distance: 2 }, 100)).toBe(true);
    expect(taintsRound({ action: "fallen", distance: 2, seconds: 3 }, 100)).toBe(true);
    expect(taintsRound({ action: "water", radius: 3 }, 100)).toBe(true);
    expect(taintsRound({ action: "brigade", crew: 1 }, 100)).toBe(true);
  });

  test("except cutting the timer short; stretching it counts", () => {
    expect(taintsRound({ action: "time", seconds: 0.5 }, 100)).toBe(false);
    expect(taintsRound({ action: "time", seconds: 100 }, 100)).toBe(false);
    expect(taintsRound({ action: "time", seconds: 101 }, 100)).toBe(true);
  });
});

describe("parseDebugRound: moluchan (#85)", () => {
  test("optional distance and seconds, clamped", () => {
    expect(parseDebugRound({ action: "moluchan" })).toEqual({ action: "moluchan" });
    expect(parseDebugRound({ action: "moluchan", distance: 3, seconds: 10 })).toEqual({ action: "moluchan", distance: 3, seconds: 10 });
    expect(parseDebugRound({ action: "moluchan", distance: 99, seconds: 0 })).toEqual({ action: "moluchan", distance: 20, seconds: 1 });
    expect(parseDebugRound({ action: "moluchan", distance: "x" })).toEqual({ action: "moluchan" });
  });
});
