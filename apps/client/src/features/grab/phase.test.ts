import { describe, expect, test } from "bun:test";
import { DRAG_AUTHORED_SPEED, DRAG_SCALE_MAX, DRAG_SCALE_MIN, PHASE_CLIPS, phaseTimeScale, startPhase, stepPhase, type PhaseState } from "./phase.ts";

/** Run `seconds` of frames at `speed`, returning every phase seen in order. */
function run(s: PhaseState, seconds: number, speed: number): [PhaseState, string[]] {
  const seen: string[] = [s.phase];
  for (let t = 0; t < seconds; t += 1 / 60) {
    s = stepPhase(s, 1 / 60, speed);
    if (seen[seen.length - 1] !== s.phase) seen.push(s.phase);
  }
  return [s, seen];
}

describe("grab phases", () => {
  test("seize, then hold while the CRS stands", () => {
    const [s, seen] = run(startPhase(false), 3, 0);
    expect(seen).toEqual(["seize", "hold"]);
    expect(s.phase).toBe("hold");
  });

  test("seize straight into the ground grab when the drag is already on, then the drag loop", () => {
    expect(run(startPhase(false), 3, 2.3)[1]).toEqual(["seize", "takeDown", "drag"]);
  });

  test("grabbed lying down: straight to the ground grab, then the drag", () => {
    expect(run(startPhase(true), 3, 0)[1]).toEqual(["groundGrab", "drag"]);
  });

  test("a hold turns into the ground grab once the CRS walks", () => {
    const [held] = run(startPhase(false), 2, 0);
    expect(run(held, 2, 2)[1]).toEqual(["hold", "takeDown", "drag"]);
  });

  test("on the ground it stays on the ground, even stopped at the van", () => {
    const [dragging] = run(startPhase(false), 3, 2.3);
    expect(run(dragging, 5, 0)[1]).toEqual(["drag"]);
  });

  test("a phase change makes a new state; within a phase the same one", () => {
    const s = startPhase(false);
    expect(stepPhase(s, 0.01, 0)).toBe(s);
    expect(stepPhase(s, 10, 0)).not.toBe(s);
  });

  test("the drag loop plays at the measured speed, clamped", () => {
    expect(phaseTimeScale("drag", 2.3)).toBeGreaterThan(0.9);
    expect(phaseTimeScale("drag", 2.3)).toBeLessThan(1.1);
    expect(phaseTimeScale("drag", DRAG_AUTHORED_SPEED * 2)).toBeCloseTo(2);
    expect(phaseTimeScale("drag", 50)).toBe(DRAG_SCALE_MAX);
    expect(phaseTimeScale("drag", 0)).toBe(DRAG_SCALE_MIN);
    expect(phaseTimeScale("hold", 3)).toBe(1);
  });

  test("standing clips go with the standing offset, ground clips with the ground one", () => {
    expect(PHASE_CLIPS.seize.stance).toBe("standing");
    expect(PHASE_CLIPS.hold.stance).toBe("standing");
    expect(PHASE_CLIPS.groundGrab.stance).toBe("ground");
    expect(PHASE_CLIPS.drag.stance).toBe("ground");
  });
});
