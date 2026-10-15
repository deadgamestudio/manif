import { afterEach, describe, expect, test } from "bun:test";
import { clearDebris, debrisModelScale, pieces, spawnDebris } from "./debris.ts";

afterEach(clearDebris);

describe("spawnDebris shapes", () => {
  test("pieces take the burst's shapes in turn, a cube being no model", () => {
    spawnDebris({ x: 0, z: 0, y: 1, count: 4, colors: ["#fff"], shapes: ["lid", "cube"], size: 0.2, speed: 5 });
    const live = pieces.filter((p) => p.life > 0);
    expect(live.filter((p) => p.shape === "lid")).toHaveLength(2);
    expect(live.filter((p) => p.shape === null)).toHaveLength(2);
  });

  test("a burst without shapes is all cubes", () => {
    spawnDebris({ x: 0, z: 0, y: 1, count: 3, colors: ["#fff"], size: 0.2, speed: 5 });
    expect(pieces.filter((p) => p.life > 0).every((p) => p.shape === null)).toBe(true);
  });

  test("a model piece keeps its own size, varied, and vanishes when its life is over", () => {
    spawnDebris({ x: 0, z: 0, y: 1, count: 1, colors: ["#fff"], shapes: ["glass"], size: 0.2, speed: 5 });
    const p = pieces.find((q) => q.life > 0)!;
    expect(debrisModelScale(p)).toBeCloseTo(p.vary);
    expect(p.vary).toBeGreaterThanOrEqual(0.5);
    expect(p.vary).toBeLessThanOrEqual(1.5);
    p.life = 0;
    expect(debrisModelScale(p)).toBe(0);
  });
});
