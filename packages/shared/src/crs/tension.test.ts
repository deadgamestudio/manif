import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, progressAt } from "../level/index.js";
import { CRS_OFFENDER_MEMORY, ESCORT_AHEAD, ESCORT_BEHIND, ESCORT_LANE, HOT_PROGRESS, TENSION_DECAY, TENSION_GAINS, TENSION_HOT } from "./constants.js";
import { addOffence, calmTargets, createMood, escortSpot, heatUp, stepMood, syncedTension, type Offence } from "./tension.js";
import type { ProtesterView } from "./targeting.js";

describe("street tension (#98)", () => {
  test("a round starts calm, with no tension", () => {
    expect(createMood()).toEqual({ tension: 0, hot: false });
  });

  test("a break counts more than a CRS hit, which counts more than a throw; a prop hit counts least", () => {
    expect(TENSION_GAINS.propBreak).toBeGreaterThan(TENSION_GAINS.crsHit);
    expect(TENSION_GAINS.crsHit).toBeGreaterThan(TENSION_GAINS.throw);
    expect(TENSION_GAINS.throw).toBeGreaterThan(TENSION_GAINS.propHit);
  });

  test("one offence of any kind alone never turns the street hot", () => {
    for (const kind of Object.keys(TENSION_GAINS) as Offence[]) {
      const mood = createMood();
      expect(addOffence(mood, kind)).toBe(false);
      expect(mood.hot).toBe(false);
    }
  });

  test("a group breaking two shops in the first minute (and throwing a bit of the loot) turns it hot", () => {
    const mood = createMood();
    let turned = false;
    // Two 3-HP shops, 20 s apart: two plain hits then the breaking one; a throw of the loot after each.
    for (const wait of [10, 20]) {
      stepMood(mood, wait, 0.05);
      turned ||= addOffence(mood, "propHit") || addOffence(mood, "propHit") || addOffence(mood, "propBreak");
      turned ||= addOffence(mood, "throw");
    }
    expect(turned).toBe(true);
    expect(mood.hot).toBe(true);
  });

  test("a few stray throws a minute apart cool down and never add up", () => {
    const mood = createMood();
    for (let i = 0; i < 20; i++) {
      addOffence(mood, "throw");
      stepMood(mood, 60, 0.1);
    }
    expect(mood.hot).toBe(false);
    expect(mood.tension).toBe(0);
  });

  test("tension cools slowly while calm, never below zero", () => {
    const mood = createMood();
    addOffence(mood, "crsHit");
    stepMood(mood, 4, 0.1);
    expect(mood.tension).toBeCloseTo(TENSION_GAINS.crsHit - 4 * TENSION_DECAY);
    stepMood(mood, 1000, 0.1);
    expect(mood.tension).toBe(0);
  });

  test("the front reaching HOT_PROGRESS turns it hot with no trouble at all", () => {
    const mood = createMood();
    expect(stepMood(mood, 1 / 30, HOT_PROGRESS - 0.01)).toBe(false);
    expect(mood.hot).toBe(false);
    expect(stepMood(mood, 1 / 30, HOT_PROGRESS)).toBe(true);
    expect(mood.hot).toBe(true);
    expect(syncedTension(mood)).toBe(TENSION_HOT);
  });

  test("hot once, never back: no decay, no second switch", () => {
    const mood = createMood();
    expect(heatUp(mood)).toBe(true);
    expect(heatUp(mood)).toBe(false);
    expect(stepMood(mood, 1000, 0)).toBe(false);
    expect(addOffence(mood, "propBreak")).toBe(false);
    expect(mood).toEqual({ tension: TENSION_HOT, hot: true });
  });

  test("synced as a whole number in 0..TENSION_HOT", () => {
    const mood = createMood();
    mood.tension = 12.6;
    expect(syncedTension(mood)).toBe(13);
  });
});

describe("calmTargets (#98)", () => {
  const p = (id: string, offendedAt?: number): ProtesterView => ({ id, x: 0, z: 0, status: PlayerStatus.Free, down: false, ...(offendedAt !== undefined && { offendedAt }) });

  test("only protesters who offended in the last CRS_OFFENDER_MEMORY seconds", () => {
    const now = 100;
    const list = [p("never"), p("recent", now - 2), p("edge", now - CRS_OFFENDER_MEMORY), p("old", now - CRS_OFFENDER_MEMORY - 0.1)];
    expect([...calmTargets(list, now)].map((v) => v.id)).toEqual(["recent", "edge"]);
  });

  test("plain CRS remember longer than the LBD's 8 s", () => {
    expect([...calmTargets([p("a", 90)], 100)].map((v) => v.id)).toEqual(["a"]);
    expect(CRS_OFFENDER_MEMORY).toBeGreaterThan(8);
  });
});

describe("escortSpot (#98)", () => {
  test("beside the cortège: ESCORT_LANE off the middle line, within its range of the front", () => {
    const front = 0.3;
    for (let i = 0; i < 40; i++) {
      const s = escortSpot(L, front, `crs-${i}`);
      expect(Math.abs(s.x)).toBeCloseTo(ESCORT_LANE);
      const t = progressAt(L, s.x, s.z);
      expect(t).toBeGreaterThanOrEqual(front - ESCORT_BEHIND - 1e-9);
      expect(t).toBeLessThanOrEqual(front + ESCORT_AHEAD + 1e-9);
    }
  });

  test("a squad spreads on both sides, each bot keeping its own spot as the march moves", () => {
    const sides = new Set<number>();
    for (let i = 0; i < 12; i++) sides.add(Math.sign(escortSpot(L, 0.2, `crs-${i}`).x));
    expect(sides).toEqual(new Set([-1, 1]));
    const a = escortSpot(L, 0.2, "crs-7");
    const b = escortSpot(L, 0.25, "crs-7");
    expect(b.x).toBe(a.x);
    expect(progressAt(L, b.x, b.z) - progressAt(L, a.x, a.z)).toBeCloseTo(0.05);
  });

  test("never off the ends of the street", () => {
    expect(progressAt(L, escortSpot(L, 0, "x").x, escortSpot(L, 0, "x").z)).toBeGreaterThanOrEqual(0);
    const s = escortSpot(L, 1, "y");
    expect(progressAt(L, s.x, s.z)).toBeLessThanOrEqual(1);
  });
});
