import { describe, expect, test } from "bun:test";
import { circleOverlaps } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { STREET_LEVEL as L, inRect, levelWorld, progressAt } from "../level/index.js";
import { RESPAWN_MARGIN } from "./constants.js";
import { rearProgress, respawnPoint } from "./respawn.js";

const world = levelWorld(L);

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point on the street's centre line at a given progress. */
function at(t: number) {
  const { from, to } = L.progress;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

function expectClear(p: { x: number; z: number }) {
  expect(inRect(L.bounds, p.x, p.z)).toBe(true);
  expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
}

describe("rearProgress", () => {
  test("is null with nobody, else the lowest progress", () => {
    expect(rearProgress(L, [])).toBeNull();
    expect(rearProgress(L, [at(0.6), at(0.3), at(0.9)])).toBeCloseTo(0.3);
  });
});

describe("respawnPoint", () => {
  test("with no free protester, spawns in the start zone", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const p = respawnPoint(L, PLAYER_RADIUS, [], random);
      expect(inRect(L.start, p.x, p.z)).toBe(true);
      expectClear(p);
    }
  });

  test("with the rear still near the start, spawns in the start zone", () => {
    const random = mulberry32(2);
    const p = respawnPoint(L, PLAYER_RADIUS, [at(0.01)], random);
    expect(inRect(L.start, p.x, p.z)).toBe(true);
  });

  test("spawns behind the rearmost free protester, never ahead, never inside anything", () => {
    const random = mulberry32(3);
    for (const rear of [0.2, 0.35, 0.5, 0.7, 0.9, 0.99]) {
      for (let i = 0; i < 40; i++) {
        const p = respawnPoint(L, PLAYER_RADIUS, [at(rear), at(Math.min(1, rear + 0.1))], random);
        expectClear(p);
        expect(progressAt(L, p.x, p.z)).toBeLessThanOrEqual(rear);
      }
    }
  });

  test("lands about RESPAWN_MARGIN behind the rear when the street is clear there", () => {
    const random = mulberry32(4);
    const len = Math.hypot(L.progress.to.x - L.progress.from.x, L.progress.to.z - L.progress.from.z);
    const rear = 0.5;
    const p = respawnPoint(L, PLAYER_RADIUS, [at(rear)], random);
    const behind = (rear - progressAt(L, p.x, p.z)) * len;
    expect(behind).toBeGreaterThan(0);
    expect(behind).toBeLessThan(RESPAWN_MARGIN + 3);
  });
});
