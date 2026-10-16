import { describe, expect, test } from "bun:test";
import { parseDebugRound, taintsRound } from "./debug.js";

describe("taintsRound (#41)", () => {
  test("every debug action keeps the round out of the totals", () => {
    expect(taintsRound({ action: "teleport", progress: 1 }, 100)).toBe(true);
    expect(taintsRound({ action: "hold" }, 100)).toBe(true);
    expect(taintsRound({ action: "calm" }, 100)).toBe(true);
    expect(taintsRound({ action: "hot" }, 100)).toBe(true);
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

describe("parseDebugRound: hot (#98)", () => {
  test("its own action, not the opposite of calm", () => {
    expect(parseDebugRound({ action: "hot" })).toEqual({ action: "hot" });
    expect(parseDebugRound({ action: "calm" })).toEqual({ action: "calm" });
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

describe("parseDebugRound: douane (#120)", () => {
  test("optional distance and seconds, clamped", () => {
    expect(parseDebugRound({ action: "douane" })).toEqual({ action: "douane" });
    expect(parseDebugRound({ action: "douane", distance: 4, seconds: 20 })).toEqual({ action: "douane", distance: 4, seconds: 20 });
    expect(parseDebugRound({ action: "douane", distance: 99, seconds: 0 })).toEqual({ action: "douane", distance: 20, seconds: 1 });
    expect(taintsRound({ action: "douane" }, 100)).toBe(true);
  });
});

describe("parseDebugRound: benanas (#123)", () => {
  test("optional distance and seconds, clamped; unmask only when true", () => {
    expect(parseDebugRound({ action: "benanas" })).toEqual({ action: "benanas" });
    expect(parseDebugRound({ action: "benanas", distance: 4, seconds: 20, unmask: true })).toEqual({ action: "benanas", distance: 4, seconds: 20, unmask: true });
    expect(parseDebugRound({ action: "benanas", distance: 99, seconds: 0, unmask: "yes" })).toEqual({ action: "benanas", distance: 20, seconds: 1 });
    expect(taintsRound({ action: "benanas" }, 100)).toBe(true);
  });
});
