import { describe, expect, test } from "bun:test";
import { createSim, kick, MAX_STEPS, seedStanding, STEP, stepSim } from "./sim.ts";
import { P, PARTICLE_COUNT, type RagdollProportions } from "./skeleton.ts";

const BODY: RagdollProportions = {
  height: 1.8,
  leftShoulderX: 0.48,
  rightShoulderX: 0.28,
  hipX: 0.17,
  torsoRadius: 0.34,
  headRadius: 0.2,
  limbRadius: 0.11,
};

function at(pos: Float32Array, i: number): [number, number, number] {
  return [pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number];
}

function run(seconds: number, x = 0, z = 0, setup?: (sim: ReturnType<typeof createSim>) => void) {
  const sim = createSim(BODY);
  seedStanding(sim, x, z, 0);
  setup?.(sim);
  for (let t = 0; t < seconds; t += STEP) stepSim(sim, STEP, x, z, 0);
  return sim;
}

describe("ragdoll sim", () => {
  test("bones keep their length after many steps", () => {
    const sim = run(3, 0, 0, (s) => kick(s, 1, 0, 1.5, 0));
    for (const c of sim.constraints) {
      if (c.minOnly || c.stiffness < 1) continue;
      const a = at(sim.pos, c.a);
      const b = at(sim.pos, c.b);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(Math.abs(d - c.rest) / c.rest).toBeLessThan(0.05);
    }
  });

  test("the pelvis is exactly on the root, which it never writes", () => {
    const sim = createSim(BODY);
    const root = Object.freeze({ x: 3.25, z: -7.5 });
    seedStanding(sim, root.x, root.z, 1);
    kick(sim, 0, 1, 1, 1);
    for (let i = 0; i < 200; i++) {
      // A root sliding along, like a knocked-back body.
      const x = root.x + i * 0.05;
      stepSim(sim, i % 3 === 0 ? 0.004 : STEP, x, root.z, 1);
      const p = at(sim.pos, P.Pelvis);
      expect(p[0]).toBe(Math.fround(x));
      expect(p[2]).toBe(Math.fround(root.z));
    }
    expect(root).toEqual({ x: 3.25, z: -7.5 });
  });

  test("a kick along +X lays the head down on the +X side", () => {
    const sim = run(2, 0, 0, (s) => kick(s, 1, 0, 1, 0));
    const head = at(sim.pos, P.Head);
    expect(head[0]).toBeGreaterThan(0.4);
    expect(head[1]).toBeLessThan(BODY.headRadius + 0.15);
  });

  test("it settles, and nothing goes below the ground", () => {
    const sim = createSim(BODY);
    seedStanding(sim, 0, 0, 0);
    kick(sim, -0.6, 0.8, 1.6, 0);
    for (let t = 0; t < 4; t += STEP) {
      stepSim(sim, STEP, 0, 0, 0);
      for (let i = 0; i < PARTICLE_COUNT; i++) expect(at(sim.pos, i)[1]).toBeGreaterThanOrEqual((sim.radii[i] as number) - 1e-4);
    }
    let maxSpeed = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = at(sim.pos, i);
      const q = at(sim.prev, i);
      maxSpeed = Math.max(maxSpeed, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / STEP);
    }
    expect(maxSpeed).toBeLessThan(0.3);
  });

  test("dt of 0, NaN or huge never produces NaN or a jump", () => {
    const sim = createSim(BODY);
    seedStanding(sim, 1, 2, 0);
    kick(sim, 1, 0, 1, 0);
    const before = Float32Array.from(sim.pos);
    stepSim(sim, 0, 1, 2, 0);
    stepSim(sim, Number.NaN, 1, 2, 0);
    stepSim(sim, -1, 1, 2, 0);
    expect(Array.from(sim.pos)).toEqual(Array.from(before));
    // A ten-minute tab switch: clamped to a few steps.
    stepSim(sim, 600, 1, 2, 0);
    for (const v of sim.pos) expect(Number.isFinite(v)).toBe(true);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = at(sim.pos, i);
      const q = at(before, i);
      expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThan(MAX_STEPS * STEP * 15);
    }
    // A NaN kick is ignored.
    kick(sim, Number.NaN, 0, 1, 0);
    kick(sim, 1, 0, Number.NaN, 0);
    stepSim(sim, STEP, 1, 2, 0);
    for (const v of sim.pos) expect(Number.isFinite(v)).toBe(true);
  });
});
