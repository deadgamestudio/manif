import { describe, expect, test } from "bun:test";
import { applyImpulse, createBody, endDodge, isDodging, isDown, knockDown, startDodge, stepBody, type Body } from "../physics/body.js";
import { circleOverlaps, MIN_OBSTACLE_HALF_THICKNESS, type BoxShape, type CollisionWorld } from "../physics/collision.js";
import { GETUP_IMMUNITY, LIGHT_IMPULSE } from "../physics/constants.js";
import { STREET_LEVEL } from "../level/index.js";
import { propCollisionWorld } from "../prop/index.js";
import { DODGE_BONK_DOWN, DODGE_COOLDOWN, DODGE_DURATION, DODGE_SPEED_FACTOR } from "./constants.js";
import { dodgeDirection, dodgeReady } from "./dodge.js";

const DT = 1 / 30;
const R = 0.4;
const SPEED = 6;
const STILL = { x: 0, z: 0 };
const OPEN: CollisionWorld = { bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, boxes: [], circles: [] };
const DODGE_TICKS = Math.round(DODGE_DURATION / DT);

function run(w: CollisionWorld, b: Body, ticks: number, input = STILL) {
  for (let t = 0; t < ticks; t++) stepBody(w, b, input, SPEED, R, DT);
}

describe("cooldown", () => {
  test("first dodge is always ready", () => {
    expect(dodgeReady(undefined, 0)).toBe(true);
  });

  test("refused until the cooldown ends, accepted exactly at it", () => {
    expect(dodgeReady(10, 10)).toBe(false);
    expect(dodgeReady(10, 10 + DODGE_COOLDOWN - DT)).toBe(false);
    expect(dodgeReady(10, 10 + DODGE_COOLDOWN)).toBe(true);
    // Room time is a sum of fixed dts, so the boundary carries float noise.
    let now = 10;
    for (let i = 0; i < Math.round(DODGE_COOLDOWN / DT); i++) now += DT;
    expect(dodgeReady(10, now)).toBe(true);
  });

  test("a custom cooldown (per archetype, #14) is honoured", () => {
    expect(dodgeReady(0, 1, 2)).toBe(false);
    expect(dodgeReady(0, 2, 2)).toBe(true);
  });
});

describe("direction", () => {
  test("follows the held move input, normalized", () => {
    const d = dodgeDirection({ x: 3, z: 4 }, 0);
    expect(d.x).toBeCloseTo(0.6, 9);
    expect(d.z).toBeCloseTo(0.8, 9);
  });

  test("standing still: the facing (rotation = atan2(x, z))", () => {
    const d = dodgeDirection(STILL, Math.PI / 2);
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.z).toBeCloseTo(0, 9);
    const back = dodgeDirection(STILL, Math.PI);
    expect(back.z).toBeCloseTo(-1, 9);
  });

  test("bad numbers still give a unit vector", () => {
    const d = dodgeDirection({ x: Number.NaN, z: 0 }, Number.NaN);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 9);
  });
});

describe("burst", () => {
  test("covers DODGE_SPEED_FACTOR times the walking distance over its duration, then walks again", () => {
    const b = createBody(0, 0);
    expect(startDodge(b, 1, 0)).toBe(true);
    // The held input is ignored during the burst (the dive is committed).
    run(OPEN, b, DODGE_TICKS, { x: 0, z: 1 });
    expect(b.x).toBeCloseTo(SPEED * DODGE_SPEED_FACTOR * DODGE_DURATION, 6);
    expect(b.z).toBe(0);
    expect(isDodging(b)).toBe(false);
    // Back to walking speed on the next tick.
    const x = b.x;
    stepBody(OPEN, b, { x: 1, z: 0 }, SPEED, R, DT);
    expect(b.x - x).toBeCloseTo(SPEED * DT, 9);
  });

  test("a dodge is faster than walking for the same time", () => {
    const walker = createBody(0, 0);
    const dodger = createBody(0, 0);
    startDodge(dodger, 1, 0);
    run(OPEN, walker, DODGE_TICKS, { x: 1, z: 0 });
    run(OPEN, dodger, DODGE_TICKS, { x: 1, z: 0 });
    expect(dodger.x).toBeGreaterThan(walker.x * 2.5);
  });

  test("the burst speed scales with the walking speed (#14 archetypes)", () => {
    const b = createBody(0, 0);
    startDodge(b, 1, 0);
    for (let t = 0; t < DODGE_TICKS; t++) stepBody(OPEN, b, STILL, SPEED / 2, R, DT);
    expect(b.x).toBeCloseTo((SPEED / 2) * DODGE_SPEED_FACTOR * DODGE_DURATION, 6);
  });

  test("refused while down, while already dodging, or with no direction", () => {
    const down = createBody(0, 0);
    knockDown(down);
    expect(startDodge(down, 1, 0)).toBe(false);
    const busy = createBody(0, 0);
    expect(startDodge(busy, 1, 0)).toBe(true);
    expect(startDodge(busy, 0, 1)).toBe(false);
    expect(busy.dodgeX).toBe(1);
    expect(startDodge(createBody(0, 0), 0, 0)).toBe(false);
    expect(startDodge(createBody(0, 0), Number.NaN, 1)).toBe(false);
  });

  test("a knock-down mid-dodge stops the burst at once", () => {
    const b = createBody(0, 0);
    startDodge(b, 1, 0);
    stepBody(OPEN, b, STILL, SPEED, R, DT);
    knockDown(b);
    expect(isDodging(b)).toBe(false);
    const x = b.x;
    run(OPEN, b, 5);
    expect(b.x).toBe(x);
  });

  test("endDodge (a grab, a KO) stops the burst at once", () => {
    const b = createBody(0, 0);
    startDodge(b, 1, 0);
    stepBody(OPEN, b, STILL, SPEED, R, DT);
    endDodge(b);
    const x = b.x;
    run(OPEN, b, 5);
    expect(b.x).toBe(x);
  });

  test("a push during a dodge adds to it rather than cancelling it", () => {
    const b = createBody(0, 0);
    startDodge(b, 1, 0);
    applyImpulse(b, 0, 1, LIGHT_IMPULSE);
    run(OPEN, b, DODGE_TICKS);
    expect(b.x).toBeCloseTo(SPEED * DODGE_SPEED_FACTOR * DODGE_DURATION, 6);
    expect(b.z).toBeGreaterThan(0.5);
  });
});

describe("walls", () => {
  const thin: BoxShape = { x: 0, z: 0, halfX: MIN_OBSTACLE_HALF_THICKNESS, halfZ: 10 };
  const w: CollisionWorld = { ...OPEN, boxes: [thin] };

  test("head-on into a wall: bonk, bounced back and knocked down briefly", () => {
    const b = createBody(-2, 0);
    startDodge(b, 1, 0);
    let bonk = null;
    for (let t = 0; t < DODGE_TICKS && !bonk; t++) bonk = stepBody(w, b, STILL, SPEED, R, DT).bonk;
    expect(bonk).not.toBeNull();
    expect(bonk?.x).toBeCloseTo(-1, 9);
    expect(isDodging(b)).toBe(false);
    expect(isDown(b)).toBe(true);
    expect(b.downTime).toBeCloseTo(DODGE_BONK_DOWN, 9);
    expect(b.vx).toBeLessThan(0);
    run(w, b, 60);
    expect(b.x).toBeLessThan(-(MIN_OBSTACLE_HALF_THICKNESS + R));
  });

  test("a bonk during get-up immunity still bounces, without a knock-down", () => {
    const b = createBody(-1, 0);
    b.immuneTime = GETUP_IMMUNITY;
    startDodge(b, 1, 0);
    let bonk = null;
    for (let t = 0; t < DODGE_TICKS && !bonk; t++) bonk = stepBody(w, b, STILL, SPEED, R, DT).bonk;
    expect(bonk).not.toBeNull();
    expect(isDown(b)).toBe(false);
    expect(b.vx).toBeLessThan(0);
  });

  test("a glancing hit slides along the wall and keeps dodging", () => {
    const b = createBody(-0.95, 0);
    const a = (80 * Math.PI) / 180; // nearly parallel to the wall
    startDodge(b, Math.cos(a), Math.sin(a));
    const res = stepBody(w, b, STILL, SPEED, R, DT);
    stepBody(w, b, STILL, SPEED, R, DT);
    expect(res.bonk).toBeNull();
    expect(isDodging(b)).toBe(true);
    expect(isDown(b)).toBe(false);
    expect(b.z).toBeGreaterThan(0.5);
  });

  test("a dodge at full speed never passes through the thinnest wall, from any angle", () => {
    // Long enough that a steep slide cannot run off its end and walk round it.
    const long: CollisionWorld = { ...OPEN, boxes: [{ ...thin, halfZ: 200 }] };
    for (let deg = -85; deg <= 85; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const b = createBody(-1, 0);
      // Stack the strongest knockback on top of the burst: the worst case.
      applyImpulse(b, Math.cos(a), Math.sin(a), 1e6, "never");
      startDodge(b, Math.cos(a), Math.sin(a));
      for (let t = 0; t < DODGE_TICKS + 30; t++) {
        stepBody(long, b, { x: 1, z: 0 }, SPEED, R, DT);
        expect(b.x).toBeLessThan(0);
        expect(circleOverlaps(long, b.x, b.z, R)).toBe(false);
      }
    }
  });

  test("a dodge never ends inside a wall or a prop of the real street", () => {
    const world = propCollisionWorld(STREET_LEVEL, () => false);
    const { minX, maxX, minZ, maxZ } = world.bounds;
    let checked = 0;
    // A grid of start points across the street, dodging in 16 directions each.
    for (let x = minX + 1; x < maxX; x += 1.7) {
      for (let z = minZ + 1; z < maxZ; z += 3.1) {
        if (circleOverlaps(world, x, z, R)) continue;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const b = createBody(x, z);
          startDodge(b, Math.cos(a), Math.sin(a));
          run(world, b, DODGE_TICKS + 30);
          expect(circleOverlaps(world, b.x, b.z, R)).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
