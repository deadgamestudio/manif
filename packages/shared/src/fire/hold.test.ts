import { describe, expect, test } from "bun:test";
import { PLAYER_RADIUS } from "../player/index.js";
import { propShape } from "../prop/index.js";
import { LIGHT_REACH, LIGHT_TIME, PUT_OUT_RANGE, PUT_OUT_TIME } from "./constants.js";
import { createFireHold, holdRatio, interruptHold, pickFireAction, stepFireHold, type FireAction } from "./hold.js";

const DT = 1 / 30;
const bin = { id: "bin", shape: propShape({ id: "bin", kind: "bin", x: 0, z: 0, rotation: 0 }, false)! };
const car = { id: "car", shape: propShape({ id: "car", kind: "car", x: 5, z: 0, rotation: 0 }, false)! };
const me = (x: number, z = 0) => ({ id: "me", x, z });

/** Hold for `seconds` with the same action; returns what finished. */
function hold(h = createFireHold(), action: FireAction | null, seconds: number) {
  h.holding = true;
  const done: FireAction[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const d = stepFireHold(h, action, DT);
    if (d) done.push(d);
  }
  return done;
}

describe("pickFireAction (interact priority)", () => {
  test("lights the nearest lightable prop in reach", () => {
    const touching = 0.5 + PLAYER_RADIUS;
    expect(pickFireAction(me(touching), PLAYER_RADIUS, [], [bin, car])).toEqual({ kind: "light", target: "bin" });
    expect(pickFireAction(me(touching + LIGHT_REACH + 0.05), PLAYER_RADIUS, [], [bin])).toBeNull();
  });

  test("a burning teammate comes before lighting", () => {
    const mate = { id: "mate", x: 1, z: 1, onFire: true };
    expect(pickFireAction(me(0.9), PLAYER_RADIUS, [mate], [bin])).toEqual({ kind: "putOut", target: "mate" });
    // Not burning, too far, or yourself: back to the prop.
    expect(pickFireAction(me(0.9), PLAYER_RADIUS, [{ ...mate, onFire: false }], [bin])?.kind).toBe("light");
    expect(pickFireAction(me(0.9), PLAYER_RADIUS, [{ ...mate, x: 0.9 + PUT_OUT_RANGE + 0.1, z: 0 }], [bin])?.kind).toBe("light");
    expect(pickFireAction(me(0.9), PLAYER_RADIUS, [{ id: "me", x: 0.9, z: 0, onFire: true }], [bin])?.kind).toBe("light");
  });
});

describe("holding", () => {
  const light: FireAction = { kind: "light", target: "bin" };

  test("lights after LIGHT_TIME of holding, not before", () => {
    expect(hold(createFireHold(), light, LIGHT_TIME - 0.1)).toEqual([]);
    expect(hold(createFireHold(), light, LIGHT_TIME + DT)).toEqual([light]);
  });

  test("pats out after PUT_OUT_TIME", () => {
    const putOut: FireAction = { kind: "putOut", target: "mate" };
    expect(hold(createFireHold(), putOut, PUT_OUT_TIME + DT)).toEqual([putOut]);
  });

  test("moving away (nothing in reach) cancels: back to 0", () => {
    const h = createFireHold();
    hold(h, light, LIGHT_TIME * 0.8);
    expect(holdRatio(h)).toBeGreaterThan(0.7);
    stepFireHold(h, null, DT);
    expect(holdRatio(h)).toBe(0);
    expect(hold(h, light, LIGHT_TIME * 0.5)).toEqual([]);
  });

  test("being hit cancels: back to 0", () => {
    const h = createFireHold();
    hold(h, light, LIGHT_TIME * 0.8);
    interruptHold(h);
    expect(hold(h, light, LIGHT_TIME * 0.5)).toEqual([]);
  });

  test("a different target starts again", () => {
    const h = createFireHold();
    hold(h, light, LIGHT_TIME * 0.8);
    expect(hold(h, { kind: "light", target: "car" }, LIGHT_TIME * 0.5)).toEqual([]);
  });

  test("letting go cancels", () => {
    const h = createFireHold();
    hold(h, light, LIGHT_TIME * 0.8);
    h.holding = false;
    expect(stepFireHold(h, light, DT)).toBeNull();
    expect(holdRatio(h)).toBe(0);
  });
});
