import { describe, expect, test } from "bun:test";
import { taintsRound } from "./debug.js";

describe("taintsRound (#41)", () => {
  test("every debug action keeps the round out of the totals", () => {
    expect(taintsRound({ action: "teleport", progress: 1 }, 100)).toBe(true);
    expect(taintsRound({ action: "hold" }, 100)).toBe(true);
    expect(taintsRound({ action: "calm" }, 100)).toBe(true);
    expect(taintsRound({ action: "clear" }, 100)).toBe(true);
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
