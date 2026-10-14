import { describe, expect, test } from "bun:test";
import { RESCUE_TIME, STRUGGLE_DRAIN, STRUGGLE_GRACE, STRUGGLE_RATE, STRUGGLE_TIME } from "./constants.js";
import { STRUGGLE_BURST, STRUGGLE_PER_PRESS, createStruggle, isStruggleFree, stepStruggle, strugglePercent, strugglePress } from "./struggle.js";

/** Mash at `rate` presses a second for `seconds`, ticking the drain like the room (30 Hz). Returns when it broke free, or -1. */
function mash(rate: number, seconds: number): number {
  const s = createStruggle();
  const dt = 1 / 30;
  let nextPress = 0;
  for (let now = 0; now <= seconds; now += dt) {
    while (nextPress <= now) {
      strugglePress(s, nextPress);
      nextPress += 1 / rate;
    }
    stepStruggle(s, now, dt);
    if (isStruggleFree(s)) return now;
  }
  return -1;
}

describe("struggling free (#70)", () => {
  test("mashing at the counted rate fills the meter in about STRUGGLE_TIME", () => {
    const freed = mash(STRUGGLE_RATE, 10);
    // The burst lets the first couple of presses through at once: a hair under STRUGGLE_TIME.
    expect(freed).toBeGreaterThan(STRUGGLE_TIME - STRUGGLE_BURST / STRUGGLE_RATE - 0.1);
    expect(freed).toBeLessThan(STRUGGLE_TIME + 0.2);
  });

  test("mashing a bit faster than the rate still gets the full rate (a budget, not a minimum gap)", () => {
    const freed = mash(STRUGGLE_RATE * 1.25, 10);
    expect(freed).toBeLessThan(STRUGGLE_TIME + 0.2);
  });

  test("a teammate's rescue stays faster than struggling alone", () => {
    expect(RESCUE_TIME).toBeLessThan(STRUGGLE_TIME);
  });

  test("mashing faster than STRUGGLE_RATE gains nothing (a macro is no better than a thumb)", () => {
    const fast = mash(STRUGGLE_RATE * 5, 10);
    expect(fast).toBeGreaterThan(STRUGGLE_TIME - STRUGGLE_BURST / STRUGGLE_RATE - 0.1);
    // A burst of presses at once: only the budget counts.
    const s = createStruggle();
    let counted = 0;
    for (let i = 0; i < 10; i++) if (strugglePress(s, 1)) counted++;
    expect(counted).toBe(STRUGGLE_BURST);
    expect(s.meter).toBeCloseTo(STRUGGLE_BURST * STRUGGLE_PER_PRESS, 9);
    expect(strugglePress(s, 1 + 0.5 / STRUGGLE_RATE)).toBe(false);
    expect(strugglePress(s, 1 + 1 / STRUGGLE_RATE)).toBe(true);
  });

  test("mashing slowly takes longer; too slowly, never", () => {
    const slow = mash(STRUGGLE_RATE / 2, 20);
    expect(slow).toBeGreaterThan(STRUGGLE_TIME * 2 - 0.3);
    // Slower than one press per STRUGGLE_GRACE: the drain wins.
    expect(mash(1 / (STRUGGLE_GRACE * 4), 30)).toBe(-1);
  });

  test("an idle meter drains after STRUGGLE_GRACE, never below 0", () => {
    const s = createStruggle();
    for (let i = 0; i < 10; i++) strugglePress(s, i / STRUGGLE_RATE);
    const full = s.meter;
    const last = 9 / STRUGGLE_RATE;
    stepStruggle(s, last + STRUGGLE_GRACE - 0.01, 0.1);
    expect(s.meter).toBe(full);
    stepStruggle(s, last + STRUGGLE_GRACE + 0.1, 0.1);
    expect(s.meter).toBeCloseTo(full - STRUGGLE_DRAIN * 0.1, 9);
    stepStruggle(s, last + 10, 10);
    expect(s.meter).toBe(0);
  });

  test("the meter as a synced percentage", () => {
    const s = createStruggle();
    expect(strugglePercent(s)).toBe(0);
    s.meter = 0.505;
    expect(strugglePercent(s)).toBe(51);
    s.meter = 1;
    expect(strugglePercent(s)).toBe(100);
    expect(isStruggleFree(s)).toBe(true);
  });
});
