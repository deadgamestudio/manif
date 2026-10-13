import { expect, test } from "bun:test";
import { SCREEN_RIGHT, SCREEN_UP } from "../../shared/iso/index.ts";
import { clampKnob, stickToGround, touchAim } from "./joystick.ts";

const DEAD = 12;
const R = 80; // a thumb well past the dead zone

/** What useMoveInput sends for a WASD combo, normalized like net.sendMove. */
function wasd(fwd: number, side: number) {
  const x = SCREEN_UP.x * fwd + SCREEN_RIGHT.x * side;
  const z = SCREEN_UP.z * fwd + SCREEN_RIGHT.z * side;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

test("up on the stick walks like W", () => {
  close(stickToGround(0, -R, DEAD), wasd(1, 0));
});

test("the 8 stick directions match the WASD combos", () => {
  // Screen offsets: dy grows downwards, so "up" is negative dy.
  for (const [fwd, side] of [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const) {
    close(stickToGround(side * R, -fwd * R, DEAD), wasd(fwd, side));
  }
});

test("inside the dead zone the stick sends no move", () => {
  expect(stickToGround(0, 0, DEAD)).toEqual({ x: 0, z: 0 });
  expect(stickToGround(5, -7, DEAD)).toEqual({ x: 0, z: 0 });
  expect(stickToGround(DEAD, 0, DEAD)).toEqual({ x: 0, z: 0 });
});

test("magnitude is ignored: full speed past the dead zone", () => {
  for (const len of [DEAD + 1, 30, 500]) {
    const d = stickToGround(len * 0.6, len * 0.8, DEAD);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 9);
  }
  close(stickToGround(20, -15, DEAD), stickToGround(200, -150, DEAD));
});

test("the direction stays analog between the 8 directions", () => {
  const d = stickToGround(30, -80, DEAD);
  const up = wasd(1, 0);
  const upRight = wasd(1, 1);
  expect(d.x).not.toBeCloseTo(up.x, 3);
  expect(d.x).not.toBeCloseTo(upRight.x, 3);
});

test("touch aim follows the stick, or is zero (facing) when the stick is idle", () => {
  expect(touchAim({ x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  expect(touchAim(stickToGround(0, 0, DEAD))).toEqual({ x: 0, z: 0 });
  const dir = stickToGround(R, 0, DEAD);
  expect(touchAim(dir)).toEqual(dir);
});

test("the knob stays inside the ring", () => {
  expect(clampKnob(10, 0, 50)).toEqual({ dx: 10, dy: 0 });
  const k = clampKnob(300, 400, 50);
  expect(Math.hypot(k.dx, k.dy)).toBeCloseTo(50, 9);
  expect(k.dx / k.dy).toBeCloseTo(0.75, 9);
});
