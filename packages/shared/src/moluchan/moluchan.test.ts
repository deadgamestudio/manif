import { describe, expect, test } from "bun:test";
import { pickLbdTarget, pickTarget, type ProtesterView } from "../crs/index.js";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L, progressAt } from "../level/index.js";
import { truckBays } from "../pompier/index.js";
import { createStruggle, strugglePress, STRUGGLE_PER_PRESS } from "../rescue/index.js";
import {
  MOLUCHAN,
  MOLUCHAN_ID,
  MOLUCHAN_LINES,
  combinedHealRate,
  inMoluchanAura,
  moluchanDue,
  moluchanEntry,
  moluchanExit,
  moluchanGoal,
  moluchanLineText,
  moluchanSpeedFactor,
  moluchanStruggleFactor,
  pickMoluchanLine,
  rollMoluchan,
} from "./index.js";

/** A point on the street's middle line at progress t, `side` metres to the side. */
function at(t: number, side = 0) {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t + side, z: from.z + (to.z - from.z) * t };
}
const free = (t: number, side = 0) => ({ ...at(t, side), status: PlayerStatus.Free });

describe("when he comes", () => {
  test("about 15% of rounds, rolled once: below the chance he comes, above it he doesn't", () => {
    expect(rollMoluchan(() => MOLUCHAN.chance - 0.001)).not.toBeNull();
    expect(rollMoluchan(() => MOLUCHAN.chance)).toBeNull();
    expect(rollMoluchan(() => 0.9)).toBeNull();
    expect(MOLUCHAN.chance).toBeCloseTo(0.15, 5);
  });

  test("over many rounds the share is about the chance", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let came = 0;
    for (let i = 0; i < 20000; i++) if (rollMoluchan(random) !== null) came++;
    expect(came / 20000).toBeGreaterThan(0.13);
    expect(came / 20000).toBeLessThan(0.17);
  });

  test("arrives mid-march, between 25% and 75% of the way", () => {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      const rolls = [0, r];
      const point = rollMoluchan(() => rolls.shift() ?? 0) as number;
      expect(point).toBeGreaterThanOrEqual(MOLUCHAN.earliest);
      expect(point).toBeLessThanOrEqual(MOLUCHAN.latest);
    }
    expect(MOLUCHAN.earliest).toBe(0.25);
    expect(MOLUCHAN.latest).toBe(0.75);
  });

  test("due once the front reaches his point, never past the latest", () => {
    expect(moluchanDue(null, 0.5)).toBe(false);
    expect(moluchanDue(0.4, 0.39)).toBe(false);
    expect(moluchanDue(0.4, 0.4)).toBe(true);
    expect(moluchanDue(0.4, 0.6)).toBe(true);
    expect(moluchanDue(0.4, 0.8)).toBe(false);
  });
});

describe("his ring", () => {
  const centre = { x: 0, z: 0 };
  test("membership is centre to centre within the radius, edge included", () => {
    expect(inMoluchanAura(centre, { x: 0, z: 0 })).toBe(true);
    expect(inMoluchanAura(centre, { x: MOLUCHAN.auraRadius, z: 0 })).toBe(true);
    expect(inMoluchanAura(centre, { x: MOLUCHAN.auraRadius + 0.01, z: 0 })).toBe(false);
    expect(inMoluchanAura(null, { x: 0, z: 0 })).toBe(false);
    expect(MOLUCHAN.auraRadius).toBe(6);
  });

  test("speed: +15% inside, multiplied with the archetype's; nothing outside", () => {
    expect(moluchanSpeedFactor(false)).toBe(1);
    expect(moluchanSpeedFactor(true)).toBeCloseTo(1.15, 9);
    // A retraité (0.75) inside: 0.75 x 1.15, not 0.75 + 0.15.
    expect(0.75 * moluchanSpeedFactor(true)).toBeCloseTo(0.8625, 9);
  });

  test("struggle: each counted press fills more, the rate limit is unchanged", () => {
    expect(moluchanStruggleFactor(false)).toBe(1);
    const plain = createStruggle();
    const boosted = createStruggle();
    expect(strugglePress(plain, 0, moluchanStruggleFactor(false))).toBe(true);
    expect(strugglePress(boosted, 0, moluchanStruggleFactor(true))).toBe(true);
    expect(plain.meter).toBeCloseTo(STRUGGLE_PER_PRESS, 9);
    expect(boosted.meter).toBeCloseTo(STRUGGLE_PER_PRESS * MOLUCHAN.struggleFactor, 9);
    // Pressing too fast still doesn't count, boosted or not.
    strugglePress(boosted, 0, MOLUCHAN.struggleFactor);
    const before = boosted.meter;
    expect(strugglePress(boosted, 0, MOLUCHAN.struggleFactor)).toBe(false);
    expect(boosted.meter).toBe(before);
  });

  test("heal: added to a CGT's in reach, nothing outside", () => {
    expect(combinedHealRate(0, false)).toBe(0);
    expect(combinedHealRate(0, true)).toBe(MOLUCHAN.healRate);
    expect(combinedHealRate(2, true)).toBe(2 + MOLUCHAN.healRate);
    expect(combinedHealRate(2, false)).toBe(2);
  });
});

describe("where he walks", () => {
  test("to the thickest group of free protesters", () => {
    const self = at(0.3);
    const crowd = [free(0.4), free(0.4, 1), free(0.4, -1), free(0.31, 4), { ...at(0.32), status: PlayerStatus.Grabbed }];
    const goal = moluchanGoal(L, self, crowd, 0.6);
    expect(progressAt(L, goal.x, goal.z)).toBeCloseTo(0.4, 3);
  });

  test("never past the front: pulled back behind it", () => {
    const front = 0.5;
    const goal = moluchanGoal(L, at(0.3), [free(0.5), free(0.5, 1), free(0.5, -1)], front);
    expect(progressAt(L, goal.x, goal.z)).toBeCloseTo(front - MOLUCHAN.behindFront, 3);
  });

  test("with nobody free he stays put", () => {
    const self = at(0.3);
    expect(moluchanGoal(L, self, [{ ...at(0.4), status: PlayerStatus.Arrested }], 0.5)).toEqual(self);
  });

  const doors = truckBays(L, MOLUCHAN.radius).map((b) => b.door);
  test("comes in from a side street just behind the front, else from the rear", () => {
    const rear = at(0.05);
    for (const front of [0.3, 0.45, 0.6, 0.75]) {
      const entry = moluchanEntry(L, doors, front, rear);
      const t = progressAt(L, entry.x, entry.z);
      expect(t).toBeLessThanOrEqual(front - MOLUCHAN.behindFront + 1e-9);
    }
    expect(moluchanEntry(L, [], 0.5, rear)).toEqual(rear);
  });

  test("leaves by the nearest side street", () => {
    const here = at(0.5);
    const exit = moluchanExit(doors, here, at(0));
    const nearest = Math.min(...doors.map((d) => Math.hypot(d.x - here.x, d.z - here.z)));
    expect(Math.hypot(exit.x - here.x, exit.z - here.z)).toBeCloseTo(nearest, 9);
    expect(moluchanExit([], here, at(0))).toEqual(at(0));
  });
});

describe("what the CRS make of him", () => {
  const view = (id: string, x: number, priority?: number): ProtesterView => ({ id, x, z: 0, status: PlayerStatus.Free, down: false, ...(priority !== undefined && { priority }) });

  test("a priority target: chased over a protester twice as close", () => {
    const picked = pickTarget({ x: 0, z: 0 }, [view("p1", 4, 1), view(MOLUCHAN_ID, 8, MOLUCHAN.targetWeight)], 20, null, 0);
    expect(picked).toBe(MOLUCHAN_ID);
  });

  test("the LBD never shoots him: he breaks nothing, so he is never an offender", () => {
    const shot = pickLbdTarget({ x: 0, z: 0 }, [view(MOLUCHAN_ID, 5, MOLUCHAN.targetWeight)], {
      now: 10,
      range: 20,
      memory: 8,
      currentId: null,
      switchMargin: 0,
      inLine: () => true,
    });
    expect(shot).toBeNull();
  });
});

describe("his lines", () => {
  test("every kind has a line, and a new one avoids the last when it can", () => {
    for (const kind of ["arrive", "rally", "leave", "grabbed"] as const) {
      const i = pickMoluchanLine(kind, -1, () => 0);
      expect(MOLUCHAN_LINES[i]?.kind).toBe(kind);
      expect(pickMoluchanLine(kind, i, () => 0)).not.toBe(i);
    }
    expect(moluchanLineText(0)).toBe("Je suis la manif !");
    expect(moluchanLineText(999)).toBe("");
  });
});
