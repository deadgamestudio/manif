import { describe, expect, test } from "bun:test";
import { ThrowableKind } from "@manif/shared";
import { RUN_FROM, THROW_GRACE_MS, actionClip, chooseStateClip, cutsAction, type BodyState } from "./clipChoice.ts";

const STILL: BodyState = {
  speed: 0,
  ko: false,
  lyingFallback: false,
  carried: false,
  grabbed: false,
  onFire: false,
  carryingPlayer: false,
  fireHold: false,
  gassed: false,
  carrying: ThrowableKind.None,
  celebrating: false,
};
const pick = (s: Partial<BodyState>) => chooseStateClip({ ...STILL, ...s });

describe("protester clip choice", () => {
  test("idles standing still, walks, then panic-runs above the threshold", () => {
    expect(pick({}).name).toBe("idle");
    expect(pick({ speed: 1 }).name).toBe("walk");
    expect(pick({ speed: 6 }).name).toBe("panic-run");
    expect(pick({ speed: RUN_FROM - 0.01 }).name).toBe("walk");
  });

  test("plays faster as the body moves faster, within limits", () => {
    const slow = pick({ speed: 0.5 }).timeScale;
    const brisk = pick({ speed: 1.2 }).timeScale;
    expect(brisk).toBeGreaterThan(slow);
    expect(pick({ speed: 40 }).timeScale).toBeLessThanOrEqual(2.2);
    expect(pick({ speed: 0.36 }).timeScale).toBeGreaterThanOrEqual(0.6);
  });

  test("the revised sprint covers game speed without hitting the speed-up cap", () => {
    expect(pick({ speed: 6 }).timeScale).toBeLessThan(1.5);
    expect(pick({ speed: 6 }).timeScale).toBeGreaterThan(1);
  });

  test("KO collapses and holds, and beats everything else", () => {
    const c = pick({ ko: true, onFire: true, gassed: true, speed: 6 });
    expect(c).toEqual({ name: "ko-collapse", hold: true, timeScale: 1 });
  });

  test("a fall with no ragdoll slot plays the knockdown and holds it", () => {
    const c = pick({ lyingFallback: true });
    expect(c.name).toBe("knockdown");
    expect(c.hold).toBe(true);
  });

  test("carried, grabbed, on fire, carrying someone", () => {
    expect(pick({ carried: true, gassed: true }).name).toBe("carried-overhead");
    expect(pick({ grabbed: true }).name).toBe("air-flail");
    expect(pick({ onFire: true }).name).toBe("on-fire-run");
    expect(pick({ carryingPlayer: true, speed: 5 }).name).toBe("carry-overhead");
  });

  test("lighting a fire, coughing in gas, staggering through it", () => {
    expect(pick({ fireHold: true }).name).toBe("light-fire");
    expect(pick({ gassed: true }).name).toBe("gas-cough");
    expect(pick({ gassed: true, speed: 2 }).name).toBe("gas-stagger");
  });

  test("an item in hand: carry-light, a trottinette is heavy, standing still idles", () => {
    expect(pick({ carrying: ThrowableKind.Pave, speed: 6 }).name).toBe("carry-light");
    expect(pick({ carrying: ThrowableKind.Trottinette, speed: 6 }).name).toBe("carry-heavy");
    expect(pick({ carrying: ThrowableKind.Pave }).name).toBe("idle");
  });

  test("celebrates when the round ends, unless running", () => {
    expect(pick({ celebrating: true }).name).toBe("celebrate");
    expect(pick({ celebrating: true, speed: 6 }).name).toBe("panic-run");
  });
});

describe("protester actions", () => {
  test("a swing is a melee swing, or a throw with an item just in hand", () => {
    expect(actionClip("swing", Infinity).name).toBe("melee-swing");
    expect(actionClip("swing", 0).name).toBe("throw");
    expect(actionClip("swing", THROW_GRACE_MS + 1).name).toBe("melee-swing");
  });

  test("dodge dives, getting up gets up", () => {
    expect(actionClip("dodge", Infinity).name).toBe("clumsy-dive");
    expect(actionClip("getUp", Infinity).name).toBe("get-up");
  });

  test("being floored or grabbed cuts an action; walking does not", () => {
    expect(cutsAction(pick({ ko: true }), "melee-swing", 0)).toBe(true);
    expect(cutsAction(pick({ grabbed: true }), "clumsy-dive", 0)).toBe(true);
    expect(cutsAction(pick({ speed: 2 }), "melee-swing", 2)).toBe(false);
    expect(cutsAction(pick({ ko: true }), "ko-collapse", 0)).toBe(false);
  });

  test("running off cuts the get-up", () => {
    expect(cutsAction(pick({ speed: 6 }), "get-up", 6)).toBe(true);
    expect(cutsAction(pick({ speed: 1 }), "get-up", 1)).toBe(false);
  });
});
