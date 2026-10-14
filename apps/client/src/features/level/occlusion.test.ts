import { describe, expect, test } from "bun:test";
import { eyeFor, findOccluders, segmentHitsBox, type OcclusionCamera, type OccluderBox } from "./occlusion.ts";

// The game's isometric camera: at +X/+Y/+Z looking down the (-1, -1, -1) diagonal.
const D = 1 / Math.sqrt(3);
const ISO: OcclusionCamera = {
  position: { x: 60, y: 60, z: 60 },
  direction: { x: -D, y: -D, z: -D },
  orthographic: true,
};

/** A tall building, footprint x 8..12, z -2..2. */
const TALL: OccluderBox = { x: 10, z: 0, halfX: 2, halfZ: 2, height: 10 };

const hidden = (boxes: OccluderBox[], targets: { x: number; y: number; z: number }[], cam = ISO) => [
  ...findOccluders(boxes, targets, cam),
];

describe("findOccluders, isometric camera", () => {
  test("a character behind a building is hidden by it", () => {
    expect(hidden([TALL], [{ x: 7, y: 1, z: -3 }])).toEqual([0]);
  });

  test("a character in front of a building is not", () => {
    expect(hidden([TALL], [{ x: 13, y: 1, z: 3 }])).toEqual([]);
  });

  test("a character beside a building is not", () => {
    expect(hidden([TALL], [{ x: 10, y: 1, z: 10 }])).toEqual([]);
    expect(hidden([TALL], [{ x: 0, y: 1, z: 0 }])).toEqual([]);
  });

  test("a building too low to reach the line of sight does not hide", () => {
    const low = { ...TALL, height: 1.5 };
    expect(hidden([low], [{ x: 7, y: 1, z: -3 }])).toEqual([]);
  });

  test("a character inside a box (a room behind a facade, #84) is hidden by it", () => {
    expect(hidden([TALL], [{ x: 10, y: 1, z: 0 }])).toEqual([0]);
  });

  test("standing against the wall on the camera side does not fade it", () => {
    expect(hidden([TALL], [{ x: 12, y: 1, z: 0 }])).toEqual([]);
  });

  test("a line of sight that only grazes a corner does not count", () => {
    expect(hidden([TALL], [{ x: 6, y: 1, z: 0 }])).toEqual([]);
  });

  test("only the buildings actually in the way, across several targets", () => {
    const behindFirst: OccluderBox = { x: 20, z: 0, halfX: 2, halfZ: 2, height: 10 };
    const aside: OccluderBox = { x: -20, z: 40, halfX: 2, halfZ: 2, height: 10 };
    const inLine: OccluderBox = { x: 14, z: 4, halfX: 1, halfZ: 1, height: 10 };
    const boxes = [TALL, behindFirst, aside, inLine];
    // Behind TALL, with inLine further along the same diagonal; and one behind behindFirst.
    expect(hidden(boxes, [{ x: 7, y: 1, z: -3 }]).sort()).toEqual([0, 3]);
    expect(hidden(boxes, [{ x: 7, y: 1, z: -3 }, { x: 17, y: 1, z: -3 }]).sort()).toEqual([0, 1, 3]);
  });

  test("no targets or no boxes: nothing fades", () => {
    expect(hidden([TALL], [])).toEqual([]);
    expect(hidden([], [{ x: 7, y: 1, z: -3 }])).toEqual([]);
  });

  test("reuses the given set and clears it", () => {
    const out = new Set([42]);
    const got = findOccluders([TALL], [{ x: 7, y: 1, z: -3 }], ISO, out);
    expect(got).toBe(out);
    expect([...out]).toEqual([0]);
  });
});

describe("findOccluders, perspective camera (a third-person view, #20)", () => {
  const TPS: OcclusionCamera = { position: { x: 10, y: 5, z: 20 }, direction: { x: 0, y: 0, z: -1 }, orthographic: false };

  test("the line goes to the camera itself, not along a fixed direction", () => {
    expect(hidden([TALL], [{ x: 10, y: 1, z: -5 }], TPS)).toEqual([0]);
    expect(hidden([TALL], [{ x: 10, y: 1, z: 10 }], TPS)).toEqual([]);
    // Same spot the isometric test said was hidden: here the camera looks from elsewhere.
    expect(hidden([TALL], [{ x: 0, y: 1, z: -10 }], TPS)).toEqual([]);
  });
});

describe("eyeFor", () => {
  test("orthographic: straight back along the view direction to the camera plane", () => {
    const eye = eyeFor({ x: 0, y: 0, z: 0 }, ISO);
    expect(eye.x).toBeCloseTo(60);
    expect(eye.y).toBeCloseTo(60);
    expect(eye.z).toBeCloseTo(60);
    const off = eyeFor({ x: 5, y: 0, z: -5 }, ISO);
    // Moving sideways on screen moves the eye by the same amount.
    expect(off.x - off.z).toBeCloseTo(10);
  });

  test("perspective: the camera position", () => {
    const cam: OcclusionCamera = { position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 }, orthographic: false };
    expect(eyeFor({ x: 9, y: 9, z: 9 }, cam)).toBe(cam.position);
  });
});

describe("segmentHitsBox", () => {
  test("a segment parallel to an axis, through and beside the box", () => {
    expect(segmentHitsBox({ x: 10, y: 1, z: -10 }, { x: 10, y: 1, z: 10 }, TALL)).toBe(true);
    expect(segmentHitsBox({ x: 12, y: 1, z: -10 }, { x: 12, y: 1, z: 10 }, TALL)).toBe(false);
  });

  test("a segment that stops short of the box", () => {
    expect(segmentHitsBox({ x: 0, y: 1, z: 0 }, { x: 7.9, y: 1, z: 0 }, TALL)).toBe(false);
  });

  test("a segment passing over the roof", () => {
    expect(segmentHitsBox({ x: 0, y: 11, z: 0 }, { x: 20, y: 11, z: 0 }, TALL)).toBe(false);
  });

  test("a zero-length segment inside the box", () => {
    expect(segmentHitsBox({ x: 10, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, TALL)).toBe(true);
  });
});
