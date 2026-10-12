import { describe, expect, test } from "bun:test";
import {
  applyDrag,
  applyImpulse,
  createBody,
  hasControl,
  isDown,
  isImmune,
  knockDown,
  stepBody,
  type Body,
} from "./body.js";
import { circleOverlaps, MIN_OBSTACLE_HALF_THICKNESS, type BoxShape, type CollisionWorld } from "./collision.js";
import {
  DOWN_DURATION,
  GETUP_IMMUNITY,
  HEAVY_IMPULSE,
  KNOCKDOWN_THRESHOLD,
  LIGHT_IMPULSE,
  MAX_KNOCKBACK_SPEED,
  WALL_BOUNCE_MIN_SPEED,
} from "./constants.js";

const DT = 1 / 30;
const R = 0.4;
const SPEED = 6;
const STILL = { x: 0, z: 0 };
const OPEN: CollisionWorld = { bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, boxes: [], circles: [] };

function world(boxes: BoxShape[]): CollisionWorld {
  return { ...OPEN, boxes };
}

/** Step until the body has stopped and is up, or `maxTicks`. Returns ticks run. */
function settle(w: CollisionWorld, b: Body, maxTicks = 600, input = STILL): number {
  let t = 0;
  for (; t < maxTicks; t++) {
    if (b.vx === 0 && b.vz === 0 && !isDown(b)) break;
    stepBody(w, b, input, SPEED, R, DT);
  }
  return t;
}

describe("integration with friction", () => {
  test("a heavy impulse slides a few metres, then stops dead", () => {
    const b = createBody(0, 0);
    applyImpulse(b, 1, 0, HEAVY_IMPULSE);
    const ticks = settle(OPEN, b);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(0);
    expect(b.x).toBeGreaterThan(3);
    expect(b.x).toBeLessThan(6);
    expect(b.z).toBe(0);
    expect(ticks).toBeLessThan(90);
    // Once stopped, it stays put.
    const x = b.x;
    for (let i = 0; i < 30; i++) stepBody(OPEN, b, STILL, SPEED, R, DT);
    expect(b.x).toBe(x);
  });

  test("drag always reduces speed and never reverses it", () => {
    const b = createBody(0, 0);
    b.vx = 0.1;
    b.vz = -20;
    let prev = Math.hypot(b.vx, b.vz);
    for (let i = 0; i < 200; i++) {
      applyDrag(b, DT);
      const s = Math.hypot(b.vx, b.vz);
      expect(s).toBeLessThanOrEqual(prev);
      expect(b.vz).toBeLessThanOrEqual(0);
      prev = s;
    }
    expect(prev).toBe(0);
  });

  test("walking is unchanged: input moves at walk speed with no knockback", () => {
    const b = createBody(0, 0);
    for (let i = 0; i < 30; i++) stepBody(OPEN, b, { x: 0, z: 1 }, SPEED, R, DT);
    expect(b.z).toBeCloseTo(SPEED, 9);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(0);
  });
});

describe("impulses", () => {
  test("a light hit only pushes; it does not knock down", () => {
    const b = createBody(0, 0);
    const res = applyImpulse(b, 0, 2, LIGHT_IMPULSE);
    expect(res.knockedDown).toBe(false);
    expect(isDown(b)).toBe(false);
    expect(b.vz).toBeCloseTo(LIGHT_IMPULSE, 9);
    settle(OPEN, b);
    expect(b.z).toBeGreaterThan(0.5);
  });

  test("the knockdown threshold is inclusive", () => {
    const below = createBody(0, 0);
    expect(applyImpulse(below, 1, 0, KNOCKDOWN_THRESHOLD - 0.01).knockedDown).toBe(false);
    const at = createBody(0, 0);
    expect(applyImpulse(at, 1, 0, KNOCKDOWN_THRESHOLD).knockedDown).toBe(true);
    expect(isDown(at)).toBe(true);
    expect(hasControl(at)).toBe(false);
  });

  test("modes: always knocks down a light push, never only pushes a heavy one", () => {
    const a = createBody(0, 0);
    expect(applyImpulse(a, 1, 0, 1, "always").knockedDown).toBe(true);
    const n = createBody(0, 0);
    expect(applyImpulse(n, 1, 0, HEAVY_IMPULSE, "never").knockedDown).toBe(false);
    expect(n.vx).toBeCloseTo(HEAVY_IMPULSE, 9);
  });

  test("the direction is normalized and the speed capped", () => {
    const b = createBody(0, 0);
    const res = applyImpulse(b, 3, 4, 1e6);
    expect(res.dirX).toBeCloseTo(0.6, 9);
    expect(res.dirZ).toBeCloseTo(0.8, 9);
    expect(res.strength).toBe(MAX_KNOCKBACK_SPEED);
    applyImpulse(b, 3, 4, 1e6);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(MAX_KNOCKBACK_SPEED, 9);
  });

  test("bad input is ignored", () => {
    for (const [dx, dz, s] of [
      [0, 0, 10],
      [Number.NaN, 1, 10],
      [1, 0, Number.POSITIVE_INFINITY],
      [1, 0, -5],
      [1, 0, 0],
    ] as const) {
      const b = createBody(0, 0);
      const res = applyImpulse(b, dx, dz, s);
      expect(res.strength).toBe(0);
      expect(b).toEqual(createBody(0, 0));
    }
  });
});

describe("down timer and immunity (fixed clock)", () => {
  test("down for DOWN_DURATION: input is ignored, then control returns with the held input", () => {
    const b = createBody(0, 0);
    knockDown(b);
    const held = { x: 1, z: 0 };
    const downTicks = Math.round(DOWN_DURATION / DT);
    let gotUpAt = -1;
    for (let t = 1; t <= downTicks + 5; t++) {
      const res = stepBody(OPEN, b, held, SPEED, R, DT);
      if (res.gotUp) gotUpAt = t;
      if (t < downTicks) {
        expect(isDown(b)).toBe(true);
        expect(b.x).toBe(0); // held input ignored, no knockback velocity
      }
    }
    expect(gotUpAt).toBe(downTicks);
    // Up again: the same held input walks without a new key press.
    expect(isDown(b)).toBe(false);
    expect(b.x).toBeGreaterThan(0);
  });

  test("get-up immunity: a heavy hit right after getting up pushes but does not knock down", () => {
    const b = createBody(0, 0);
    knockDown(b);
    for (let t = 0; t < Math.round(DOWN_DURATION / DT); t++) stepBody(OPEN, b, STILL, SPEED, R, DT);
    expect(isDown(b)).toBe(false);
    expect(isImmune(b)).toBe(true);
    expect(b.immuneTime).toBeCloseTo(GETUP_IMMUNITY, 9);

    const res = applyImpulse(b, 1, 0, HEAVY_IMPULSE);
    expect(res.knockedDown).toBe(false);
    expect(b.vx).toBeGreaterThan(0); // still pushed
  });

  test("immunity wears off after GETUP_IMMUNITY, then a heavy hit floors again", () => {
    const b = createBody(0, 0);
    knockDown(b);
    const ticks = Math.round((DOWN_DURATION + GETUP_IMMUNITY) / DT);
    for (let t = 0; t < ticks; t++) stepBody(OPEN, b, STILL, SPEED, R, DT);
    expect(isImmune(b)).toBe(false);
    expect(applyImpulse(b, 1, 0, HEAVY_IMPULSE).knockedDown).toBe(true);
  });

  test("hits while down do not extend the timer", () => {
    const b = createBody(0, 0);
    knockDown(b);
    for (let t = 0; t < 30; t++) stepBody(OPEN, b, STILL, SPEED, R, DT);
    const left = b.downTime;
    expect(applyImpulse(b, 1, 0, HEAVY_IMPULSE).knockedDown).toBe(false);
    expect(b.downTime).toBe(left);
  });

  test("hammered every tick, a body still gets up (no chain knockdown)", () => {
    const b = createBody(0, 0);
    let upTicks = 0;
    for (let t = 0; t < 300; t++) {
      applyImpulse(b, t % 2 ? 1 : -1, 0, HEAVY_IMPULSE);
      stepBody(OPEN, b, STILL, SPEED, R, DT);
      if (!isDown(b)) upTicks++;
    }
    // At least the immunity window after each get-up is spent standing.
    expect(upTicks).toBeGreaterThanOrEqual(Math.floor(GETUP_IMMUNITY / DT) * 3);
  });
});

describe("walls", () => {
  const wall: BoxShape = { x: 0, z: 0, halfX: MIN_OBSTACLE_HALF_THICKNESS, halfZ: 10 };
  const w = world([wall]);

  test("a fast body bounces off a wall instead of sticking", () => {
    const b = createBody(-3, 0);
    applyImpulse(b, 1, 0, HEAVY_IMPULSE, "never");
    let impact = 0;
    for (let t = 0; t < 60 && impact === 0; t++) impact = stepBody(w, b, STILL, SPEED, R, DT).impactSpeed;
    expect(impact).toBeGreaterThan(WALL_BOUNCE_MIN_SPEED);
    expect(b.vx).toBeLessThan(0); // reflected
    expect(b.x).toBeLessThanOrEqual(-(MIN_OBSTACLE_HALF_THICKNESS + R) + 1e-9);
    settle(w, b);
    expect(b.x).toBeLessThan(-1); // ended up away from the wall
  });

  test("a slow body just stops against the wall and keeps sliding along it", () => {
    const b = createBody(-0.92, 0);
    b.vx = WALL_BOUNCE_MIN_SPEED * 0.5;
    b.vz = 3;
    stepBody(w, b, STILL, SPEED, R, DT);
    stepBody(w, b, STILL, SPEED, R, DT);
    expect(b.vx).toBe(0);
    expect(b.vz).toBeGreaterThan(0);
  });

  test("the strongest impulse never passes through the thinnest wall, from any angle", () => {
    for (let deg = -60; deg <= 60; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const b = createBody(-1, 0);
      applyImpulse(b, Math.cos(a), Math.sin(a), 1e6);
      applyImpulse(b, Math.cos(a), Math.sin(a), 1e6);
      for (let t = 0; t < 120; t++) {
        stepBody(w, b, { x: 1, z: 0 }, SPEED, R, DT);
        expect(b.x).toBeLessThan(0);
        expect(circleOverlaps(w, b.x, b.z, R)).toBe(false);
      }
    }
  });

  test("the strongest impulse cannot leave the bounds", () => {
    const small: CollisionWorld = { bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, boxes: [], circles: [] };
    const b = createBody(0, 0);
    applyImpulse(b, -1, 1, 1e6);
    for (let t = 0; t < 120; t++) {
      stepBody(small, b, STILL, SPEED, R, DT);
      expect(circleOverlaps(small, b.x, b.z, R)).toBe(false);
    }
  });
});
