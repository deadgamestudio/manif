import { describe, expect, test } from "bun:test";
import { createRagdollBudget } from "./budget.ts";
import { BLEND_TIME, RagdollController } from "./controller.ts";
import { P, type RagdollProportions } from "./skeleton.ts";

const BODY: RagdollProportions = {
  height: 1.8,
  leftShoulderX: 0.48,
  rightShoulderX: 0.28,
  hipX: 0.17,
  torsoRadius: 0.34,
  headRadius: 0.2,
  limbRadius: 0.11,
};
const DT = 1 / 60;
const HIT = { dirX: 1, dirZ: 0, strength: 14 };

function frames(c: RagdollController, seconds: number, lying: boolean, hit: typeof HIT | undefined): boolean {
  let shown = false;
  for (let t = 0; t < seconds; t += DT) shown = c.update(DT, lying, 0, 0, 0, hit);
  return shown;
}

describe("ragdoll controller", () => {
  test("falls along the hit, gets up through the blend, then frees its slot", () => {
    const budget = createRagdollBudget(1);
    const c = new RagdollController(BODY, budget);
    expect(c.update(DT, false, 0, 0, 0, undefined)).toBe(false);
    expect(frames(c, 1.5, true, HIT)).toBe(true);
    expect(c.sim.pos[P.Head * 3]).toBeGreaterThan(0.4);
    expect(budget.active()).toBe(1);
    // Getting up: still drawn while blending, then handed back.
    expect(frames(c, BLEND_TIME * 0.5, false, HIT)).toBe(true);
    expect(frames(c, BLEND_TIME * 0.6, false, HIT)).toBe(false);
    expect(budget.active()).toBe(0);
  });

  test("the impulse may come after `down`: it still sets the direction", () => {
    const c = new RagdollController(BODY, createRagdollBudget(1));
    c.update(DT, true, 0, 0, 0, undefined);
    c.update(DT, true, 0, 0, 0, undefined);
    frames(c, 1.5, true, { dirX: 0, dirZ: -1, strength: 14 });
    expect(c.sim.pos[P.Head * 3 + 2]).toBeLessThan(-0.4);
  });

  test("no hit seen: falls backwards (facing +Z, so towards -Z)", () => {
    const c = new RagdollController(BODY, createRagdollBudget(1));
    frames(c, 1.5, true, undefined);
    expect(c.sim.pos[P.Head * 3 + 2]).toBeLessThan(-0.3);
  });

  test("past the cap, the extra body falls back to the tip-over until it is up", () => {
    const budget = createRagdollBudget(1);
    const a = new RagdollController(BODY, budget);
    const b = new RagdollController(BODY, budget);
    expect(a.update(DT, true, 0, 0, 0, HIT)).toBe(true);
    expect(b.update(DT, true, 0, 0, 0, HIT)).toBe(false);
    a.reset();
    // Still falling: stays on the tip-over rather than popping into a ragdoll mid-fall.
    expect(b.update(DT, true, 0, 0, 0, HIT)).toBe(false);
    expect(b.update(DT, false, 0, 0, 0, HIT)).toBe(false);
    expect(b.update(DT, true, 0, 0, 0, HIT)).toBe(true);
    b.reset();
    b.reset();
    expect(budget.active()).toBe(0);
  });
});
