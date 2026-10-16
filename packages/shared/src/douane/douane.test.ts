import { describe, expect, test } from "bun:test";
import { cameoRoundChance } from "../cameo/index.js";
import { ROUND_DURATION } from "../round/index.js";
import { STREET_LEVEL as L, progressAt } from "../level/index.js";
import { KNOCKDOWN_THRESHOLD } from "../physics/index.js";
import { truckBays } from "../pompier/index.js";
import { CRS_STATS, CrsKind, type HoseStats } from "../crs/index.js";
import { inJet, aimJet } from "../water/index.js";
import {
  DOUANE,
  DOUANE_JET,
  DOUANE_LINES,
  douaneEntry,
  douaneExit,
  douaneGoal,
  douaneLineText,
  freshSprayClock,
  pickDouaneLine,
  pickDouaneTarget,
  stepSprayClock,
} from "./index.js";

function at(t: number, side = 0) {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}

describe("when he comes (#132)", () => {
  test("10% a minute of march, once a round: about 57% of full rounds", () => {
    expect(DOUANE.chance).toBeCloseTo(0.1, 5);
    expect(cameoRoundChance(DOUANE.chance, ROUND_DURATION, DOUANE.duration)).toBeCloseTo(0.57, 2);
  });
});

describe("who he soaks", () => {
  const self = { x: 0, z: 0 };
  test("the closest body, whichever side", () => {
    const bodies = [
      { id: "p1", x: 5, z: 0 },
      { id: "crs-1", x: 2, z: 1 },
      { id: "p2", x: -4, z: 0 },
    ];
    expect(pickDouaneTarget(self, bodies, null)?.id).toBe("crs-1");
    expect(pickDouaneTarget(self, [{ id: "p1", x: 3, z: 0 }, { id: "crs-1", x: 6, z: 0 }], null)?.id).toBe("p1");
  });

  test("keeps his target unless another is clearly closer", () => {
    const bodies = [
      { id: "p1", x: 3, z: 0 },
      { id: "p2", x: 2.5, z: 0 },
    ];
    expect(pickDouaneTarget(self, bodies, "p1")?.id).toBe("p1");
    const closer = [
      { id: "p1", x: 4, z: 0 },
      { id: "p2", x: 2, z: 0 },
    ];
    expect(pickDouaneTarget(self, closer, "p1")?.id).toBe("p2");
    // His target gone: the closest one.
    expect(pickDouaneTarget(self, [{ id: "p2", x: 4, z: 0 }], "p1")?.id).toBe("p2");
  });

  test("nobody: no target", () => {
    expect(pickDouaneTarget(self, [], null)).toBeNull();
  });

  test("stands off short of his target, in the jet's reach", () => {
    const goal = douaneGoal({ x: 10, z: 0 }, { x: 0, z: 0 });
    expect(goal.x).toBeCloseTo(DOUANE.standOff);
    expect(goal.z).toBeCloseTo(0);
    expect(douaneGoal({ x: 1, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 });
    expect(DOUANE.standOff).toBeLessThan(DOUANE.sprayFrom);
    expect(DOUANE.sprayFrom).toBeLessThan(DOUANE_JET.range);
  });
});

describe("the water gun", () => {
  test("a burst, a pause, then the next burst once ready", () => {
    const c = freshSprayClock(0);
    expect(stepSprayClock(c, 0, true).on).toBe(true);
    expect(stepSprayClock(c, DOUANE.burst - 0.01, true).on).toBe(true);
    expect(stepSprayClock(c, DOUANE.burst, true).on).toBe(false);
    // Paused, ready or not.
    expect(stepSprayClock(c, DOUANE.burst + DOUANE.pause - 0.01, true).on).toBe(false);
    expect(stepSprayClock(c, DOUANE.burst + DOUANE.pause, true).on).toBe(true);
  });

  test("not ready (nobody in reach or in sight): no water, and a lost target ends the burst", () => {
    const c = freshSprayClock(0);
    expect(stepSprayClock(c, 1, false).on).toBe(false);
    expect(stepSprayClock(c, 2, true).on).toBe(true);
    expect(stepSprayClock(c, 2.5, false).on).toBe(false);
    expect(c.until).toBeCloseTo(2.5 + DOUANE.pause);
  });

  test("on for less than half the time, at most", () => {
    const c = freshSprayClock(0);
    let on = 0;
    const dt = 1 / 30;
    const ticks = Math.round(60 / dt);
    for (let i = 0; i < ticks; i++) if (stepSprayClock(c, i * dt, true).on) on++;
    expect(on / ticks).toBeLessThan(0.5);
    expect(on / ticks).toBeGreaterThan(0.3);
  });

  test("pushes, never floors, no damage: smaller than a pompier's hose", () => {
    const hose = CRS_STATS[CrsKind.Pompier].hose as HoseStats;
    expect(DOUANE_JET.knockback).toBeLessThan(KNOCKDOWN_THRESHOLD);
    expect(DOUANE_JET.knockback).toBeLessThan(hose.knockback);
    expect(DOUANE_JET.range).toBeLessThan(hose.range);
    expect(DOUANE_JET.pushInterval).toBeGreaterThanOrEqual(hose.pushInterval);
    expect(DOUANE_JET.soakRate).toBeGreaterThan(0);
    // Someone where he stands off is in the water.
    const jet = aimJet({ x: 0, z: 0 }, { x: DOUANE.standOff, z: 0 });
    expect(inJet(jet, DOUANE_JET, DOUANE.standOff, 0, 0.4)).toBe(true);
  });
});

describe("his way in and out", () => {
  const doors = truckBays(L, DOUANE.radius).map((b) => b.door);
  test("from a side street just behind the front, else from the rear", () => {
    const rear = at(0.05);
    for (const front of [0.2, 0.45, 0.6, 0.8]) {
      const entry = douaneEntry(L, doors, front, rear);
      expect(progressAt(L, entry.x, entry.z)).toBeLessThanOrEqual(front - DOUANE.behindFront + 1e-9);
    }
    expect(douaneEntry(L, [], 0.5, rear)).toEqual(rear);
  });

  test("leaves by the nearest side street", () => {
    const here = at(0.5);
    const exit = douaneExit(doors, here, at(0));
    const nearest = Math.min(...doors.map((d) => Math.hypot(d.x - here.x, d.z - here.z)));
    expect(Math.hypot(exit.x - here.x, exit.z - here.z)).toBeCloseTo(nearest, 9);
    expect(douaneExit([], here, at(0))).toEqual(at(0));
  });
});

describe("his lines", () => {
  test("every kind has a line, a new one avoids the last, all about the douane", () => {
    for (const kind of ["arrive", "spray", "leave"] as const) {
      const i = pickDouaneLine(kind, -1, () => 0);
      expect(DOUANE_LINES[i]?.kind).toBe(kind);
      expect(pickDouaneLine(kind, i, () => 0)).not.toBe(i);
    }
    expect(douaneLineText(0)).toBe("La douane !");
    expect(douaneLineText(999)).toBe("");
  });
});
