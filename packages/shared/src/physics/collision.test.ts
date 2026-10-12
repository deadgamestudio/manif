import { describe, expect, test } from "bun:test";
import {
  circleOverlaps,
  moveCircle,
  pushOutOfBox,
  pushOutOfCircle,
  resolveCircle,
  type BoxShape,
  type CollisionWorld,
} from "./collision.js";

const R = 0.4;
const BOX: BoxShape = { x: 0, z: 0, halfX: 1, halfZ: 1 };
const OPEN = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

function world(boxes: BoxShape[] = [], circles: CollisionWorld["circles"] = []): CollisionWorld {
  return { bounds: OPEN, boxes, circles };
}

describe("circle vs box", () => {
  const cases = [
    { side: "-x", from: { x: -1.2, z: 0.3 }, expected: { x: -1.4, z: 0.3 } },
    { side: "+x", from: { x: 1.2, z: -0.5 }, expected: { x: 1.4, z: -0.5 } },
    { side: "-z", from: { x: 0.2, z: -1.1 }, expected: { x: 0.2, z: -1.4 } },
    { side: "+z", from: { x: -0.7, z: 1.3 }, expected: { x: -0.7, z: 1.4 } },
  ];
  for (const { side, from, expected } of cases) {
    test(`pushes out from the ${side} side along the face normal`, () => {
      const p = { ...from };
      expect(pushOutOfBox(p, R, BOX)).toBe(true);
      expect(p.x).toBeCloseTo(expected.x, 9);
      expect(p.z).toBeCloseTo(expected.z, 9);
    });
  }

  test("pushes out of a corner diagonally", () => {
    const p = { x: 1.2, z: 1.2 };
    pushOutOfBox(p, R, BOX);
    expect(Math.hypot(p.x - 1, p.z - 1)).toBeCloseTo(R, 9);
    expect(p.x).toBeCloseTo(p.z, 9);
  });

  test("a centre inside the box leaves by the shallowest side", () => {
    const p = { x: 0.8, z: 0.1 };
    pushOutOfBox(p, R, BOX);
    expect(p.x).toBeCloseTo(1.4, 9);
    expect(p.z).toBeCloseTo(0.1, 9);
  });

  test("a circle exactly touching an edge is left alone", () => {
    const p = { x: -1.4, z: 0.5 };
    expect(pushOutOfBox(p, R, BOX)).toBe(false);
    expect(p).toEqual({ x: -1.4, z: 0.5 });
  });

  test("a move that ends exactly on an edge stops at the edge, not inside", () => {
    // Centre lands exactly on the box face.
    const res = moveCircle(world([BOX]), { x: -2, z: 0 }, 1, 0, R);
    expect(res.x).toBeCloseTo(-1.4, 9);
    expect(res.z).toBeCloseTo(0, 9);
    // Circle edge lands exactly on the box face: no correction at all.
    const touch = moveCircle(world([BOX]), { x: -2, z: 0 }, 0.6, 0, R);
    expect(touch.x).toBeCloseTo(-1.4, 9);
    expect(touch.pushX).toBeCloseTo(0, 9);
  });
});

describe("circle vs circle", () => {
  test("pushes out along the centre line", () => {
    const p = { x: 0.5, z: 0 };
    expect(pushOutOfCircle(p, R, { x: 0, z: 0, r: 0.5 })).toBe(true);
    expect(p.x).toBeCloseTo(0.9, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  test("pushes out diagonally", () => {
    const p = { x: 0.3, z: 0.3 };
    pushOutOfCircle(p, R, { x: 0, z: 0, r: 0.5 });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.9, 9);
    expect(p.x).toBeCloseTo(p.z, 9);
  });

  test("no push when just touching or apart", () => {
    const p = { x: 0.9, z: 0 };
    expect(pushOutOfCircle(p, R, { x: 0, z: 0, r: 0.5 })).toBe(false);
    expect(p.x).toBe(0.9);
  });

  test("dead centre still gets out", () => {
    const p = { x: 0, z: 0 };
    pushOutOfCircle(p, R, { x: 0, z: 0, r: 0.5 });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.9, 9);
  });
});

describe("moving against walls", () => {
  test("walking straight into a wall stops at its edge", () => {
    const w = world([BOX]);
    let p = { x: -5, z: 0 };
    for (let i = 0; i < 60; i++) p = moveCircle(w, p, 0.2, 0, R);
    expect(p.x).toBeCloseTo(-1.4, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  test("walking diagonally into a wall slides along it", () => {
    const wall: BoxShape = { x: 0, z: 0, halfX: 0.5, halfZ: 20 };
    const w = world([wall]);
    let p = { x: -2, z: 0 };
    const s = 0.2 * Math.SQRT1_2;
    for (let i = 0; i < 30; i++) p = moveCircle(w, p, s, s, R);
    expect(p.x).toBeCloseTo(-0.9, 6);
    // Kept the whole z component of the move: 30 * s.
    expect(p.z).toBeCloseTo(30 * s, 6);
  });

  test("a very fast move does not tunnel through a thin wall", () => {
    const wall: BoxShape = { x: 0, z: 0, halfX: 0.5, halfZ: 5 };
    const res = moveCircle(world([wall]), { x: -2, z: 0 }, 10, 0, R);
    expect(res.x).toBeCloseTo(-0.9, 6);
    expect(res.pushX).toBeLessThan(0);
  });

  test("stays inside the bounds", () => {
    const w: CollisionWorld = { bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, boxes: [], circles: [] };
    const res = moveCircle(w, { x: 0, z: 0 }, 20, -20, R);
    expect(res.x).toBeCloseTo(4.6, 9);
    expect(res.z).toBeCloseTo(-4.6, 9);
  });
});

describe("inner corner between two boxes", () => {
  // An L: a wall along X (below) and a wall along Z (to the right), touching.
  const floor: BoxShape = { x: 0, z: 1, halfX: 3, halfZ: 0.5 }; // z in [0.5, 1.5]
  const side: BoxShape = { x: 1, z: -2, halfX: 0.5, halfZ: 2.5 }; // x in [0.5, 1.5], z in [-4.5, 0.5]
  const w = world([floor, side]);

  test("settles in the corner touching both walls", () => {
    const res = resolveCircle(w, 0.3, 0.3, R);
    expect(res.x).toBeCloseTo(0.1, 6);
    expect(res.z).toBeCloseTo(0.1, 6);
  });

  test("pushing into the corner at full speed for 10 s never ends inside or jitters", () => {
    let p = { x: -3, z: -3 };
    const s = 0.2 * Math.SQRT1_2;
    const last: { x: number; z: number }[] = [];
    for (let tick = 0; tick < 300; tick++) {
      p = moveCircle(w, p, s, s, R);
      expect(circleOverlaps(w, p.x, p.z, R)).toBe(false);
      last.push(p);
    }
    // Fully settled: the last second of positions are all the same point.
    for (const q of last.slice(-30)) {
      expect(q.x).toBeCloseTo(0.1, 6);
      expect(q.z).toBeCloseTo(0.1, 6);
    }
  });

  test("pushing along each wall into the corner also settles", () => {
    for (const [dx, dz] of [
      [0.2, 0],
      [0, 0.2],
      [0.19, 0.06],
      [0.06, 0.19],
    ] as const) {
      let p = { x: -2, z: -2 };
      for (let tick = 0; tick < 300; tick++) p = moveCircle(w, p, dx, dz, R);
      expect(circleOverlaps(w, p.x, p.z, R)).toBe(false);
      expect(p.x).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(p.z).toBeLessThanOrEqual(0.1 + 1e-6);
    }
  });
});
