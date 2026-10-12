import { describe, expect, test } from "bun:test";
import { createBody, stepBody, type BoxShape, type CollisionWorld } from "../physics/index.js";
import { TICK_DT } from "../net/index.js";
import { NavGrid } from "./nav.js";

const R = 0.45;
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const open: CollisionWorld = { bounds, boxes: [], circles: [] };
/** An L-shaped wall: a long bar along X and a leg along Z, closing the corner around the start. */
const L_WALL: BoxShape[] = [
  { x: -1, z: 2, halfX: 5, halfZ: 0.5 }, // bar: x -6..4, z 1.5..2.5
  { x: 3.5, z: -2, halfX: 0.5, halfZ: 4 }, // leg: x 3..4, z -6..2
];
const walled: CollisionWorld = { bounds, boxes: L_WALL, circles: [] };

describe("NavGrid", () => {
  test("cells inside an obstacle or too close to it are blocked", () => {
    const nav = new NavGrid(walled, R);
    expect(nav.isWalkable(nav.cellAt(0, 2))).toBe(false);
    expect(nav.isWalkable(nav.cellAt(0, 2.8))).toBe(false); // 0.3 from the face: closer than R
    expect(nav.isWalkable(nav.cellAt(0, 3.3))).toBe(true);
    // Too close to the bounds.
    expect(nav.isWalkable(nav.cellAt(9.9, 0))).toBe(false);
  });

  test("open ground: straight segment is walkable, path goes there", () => {
    const nav = new NavGrid(open, R);
    expect(nav.segmentWalkable({ x: -5, z: -5 }, { x: 5, z: 5 })).toBe(true);
    const path = nav.findPath({ x: -5, z: -5 }, { x: 5, z: 5 });
    expect(path).not.toBeNull();
    const end = nav.centre(path![path!.length - 1]!, { x: 0, z: 0 });
    expect(Math.hypot(end.x - 5, end.z - 5)).toBeLessThan(0.5);
  });

  test("a wall blocks the straight segment", () => {
    const nav = new NavGrid(walled, R);
    expect(nav.segmentWalkable({ x: 0, z: 0 }, { x: 0, z: 5 })).toBe(false);
  });

  test("finds a path around an L-shaped wall, and walking it gets there", () => {
    const nav = new NavGrid(walled, R);
    // Inside the L's corner, to the far side of the bar.
    const from = { x: 1, z: 0 };
    const to = { x: 1, z: 6 };
    const path = nav.findPath(from, to);
    expect(path).not.toBeNull();
    const p = { x: 0, z: 0 };
    for (const cell of path!) {
      nav.centre(cell, p);
      expect(nav.isWalkable(cell)).toBe(true);
    }
    // The path leaves the corner by the open side (west, x < -6), since the leg closes the east.
    expect(path!.some((cell) => nav.centre(cell, p).x < -6)).toBe(true);

    // Walk it with the real kinematics: no wall in the way stops the body.
    const body = createBody(from.x, from.z);
    let i = 0;
    for (let tick = 0; tick < 30 * 20 && i < path!.length; tick++) {
      nav.centre(path![i]!, p);
      const dx = p.x - body.x;
      const dz = p.z - body.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        i++;
        continue;
      }
      stepBody(walled, body, { x: dx / d, z: dz / d }, 4, R, TICK_DT);
    }
    expect(Math.hypot(body.x - to.x, body.z - to.z)).toBeLessThan(0.6);
  });

  test("unreachable goal gives null; a goal against a wall snaps to the nearest open cell", () => {
    const sealed: CollisionWorld = {
      bounds,
      boxes: [
        { x: 0, z: 5, halfX: 10, halfZ: 0.5 }, // full-width wall
      ],
      circles: [],
    };
    const nav = new NavGrid(sealed, R);
    expect(nav.findPath({ x: 0, z: 0 }, { x: 0, z: 8 })).toBeNull();
    // A protester (radius 0.4) leaning on the wall: too close to it for a CRS cell, still reachable.
    const againstWall = nav.findPath({ x: 0, z: 0 }, { x: 0, z: 4.1 });
    expect(againstWall).not.toBeNull();
  });

  test("rebuild reopens cells when a shape goes away (a prop breaks)", () => {
    const world = { bounds, boxes: [{ x: 0, z: 0, halfX: 1, halfZ: 1 }] as BoxShape[], circles: [] };
    const nav = new NavGrid(world, R);
    expect(nav.isWalkable(nav.cellAt(0, 0))).toBe(false);
    world.boxes = [];
    nav.rebuild(world);
    expect(nav.isWalkable(nav.cellAt(0, 0))).toBe(true);
  });
});
