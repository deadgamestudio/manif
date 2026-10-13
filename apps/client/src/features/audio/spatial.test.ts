import { describe, expect, test } from "bun:test";
import { SCREEN_RIGHT as ISO_SCREEN_RIGHT } from "../../shared/iso/index.ts";
import { FAR, NEAR, SCREEN_RIGHT, pitch, place } from "./spatial.ts";

const me = { x: 10, z: 20 };

describe("place", () => {
  test("full volume and centred close to the local player", () => {
    expect(place(me, me)).toEqual({ gain: 1, pan: 0 });
    expect(place(me, { x: me.x + 1, z: me.z }).gain).toBe(1);
  });

  test("quieter with distance, silent past the cutoff", () => {
    const at = (d: number) => place(me, { x: me.x - d * Math.SQRT1_2, z: me.z - d * Math.SQRT1_2 }).gain;
    expect(at(NEAR)).toBe(1);
    expect(at(8)).toBeLessThan(1);
    expect(at(16)).toBeLessThan(at(8));
    expect(at(16)).toBeGreaterThan(0);
    expect(at(FAR)).toBe(0);
    expect(at(FAR + 30)).toBe(0);
  });

  test("left and right follow the screen, measured from the player, not the camera", () => {
    const right = place(me, { x: me.x + SCREEN_RIGHT.x * 6, z: me.z + SCREEN_RIGHT.z * 6 });
    const left = place(me, { x: me.x - SCREEN_RIGHT.x * 6, z: me.z - SCREEN_RIGHT.z * 6 });
    expect(right.pan).toBeGreaterThan(0.3);
    expect(left.pan).toBeCloseTo(-right.pan, 6);
    // Straight up the screen (further down the street, towards the camera's view): centred.
    expect(place(me, { x: me.x - 5, z: me.z - 5 }).pan).toBeCloseTo(0, 6);
    // Far to one side: never fully in one ear.
    expect(place(me, { x: me.x + SCREEN_RIGHT.x * 20, z: me.z + SCREEN_RIGHT.z * 20 }).pan).toBeLessThan(1);
  });

  test("the same sound moves with the listener: it is relative to the player", () => {
    const source = { x: 40, z: 40 };
    expect(place({ x: 40, z: 40 }, source).gain).toBe(1);
    expect(place({ x: 0, z: 0 }, source).gain).toBe(0);
  });

  test("no listener or no position: centred, full volume (round and UI sounds)", () => {
    expect(place(null, { x: 1, z: 1 })).toEqual({ gain: 1, pan: 0 });
    expect(place(me, undefined)).toEqual({ gain: 1, pan: 0 });
  });

  test("screen right matches the iso camera's", () => {
    expect(SCREEN_RIGHT.x).toBeCloseTo(ISO_SCREEN_RIGHT.x, 9);
    expect(SCREEN_RIGHT.z).toBeCloseTo(ISO_SCREEN_RIGHT.z, 9);
  });
});

describe("pitch", () => {
  test("stays within the jitter, centred on 1", () => {
    expect(pitch(0.1, 0)).toBeCloseTo(0.9, 9);
    expect(pitch(0.1, 1)).toBeCloseTo(1.1, 9);
    expect(pitch(0.1, 0.5)).toBeCloseTo(1, 9);
    expect(pitch(0, 0.9)).toBe(1);
    expect(pitch(0.1, 5)).toBeCloseTo(1.1, 9);
  });
});
