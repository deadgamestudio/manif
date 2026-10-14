import { describe, expect, test } from "bun:test";
import { GROUND_COLLAR, MAX_DRIFT, STANDING_COLLAR, clampDrift, placeBodies, targetPose, turn, victimInCrs, type PairOffset, type PairPose, type Placed } from "./placement.ts";

/** Where pairs.json puts the CRS, from the victim's placement (the forward direction). */
function crsFromVictim(v: Placed, o: PairOffset): Placed {
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  return { x: v.x + o.x * c + o.z * s, z: v.z - o.x * s + o.z * c, yaw: v.yaw + o.yaw };
}

function close(a: number, b: number) {
  expect(Math.atan2(Math.sin(a - b), Math.cos(a - b))).toBeCloseTo(0, 6);
}

describe("victimInCrs", () => {
  test("standing collar: the protester 0.61 m in front of the CRS, facing it", () => {
    const r = victimInCrs(STANDING_COLLAR);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(0.61);
    close(r.yaw, Math.PI);
  });

  test("ground collar: the protester 0.95 m in front, a little to the CRS's right, same facing", () => {
    const r = victimInCrs(GROUND_COLLAR);
    expect(r.x).toBeCloseTo(-0.15);
    expect(r.z).toBeCloseTo(0.95);
    expect(r.yaw).toBeCloseTo(0);
  });
});

describe("placeBodies", () => {
  for (const [name, o] of [["standing", STANDING_COLLAR], ["ground", GROUND_COLLAR]] as const) {
    test(`${name}: the drawn bodies stand exactly as pairs.json authored them`, () => {
      const rel = victimInCrs(o);
      const pose: PairPose = { cx: 2, cz: -1, yaw: 0.8 };
      const crs: Placed = { x: 0, z: 0, yaw: 0 };
      const victim: Placed = { x: 0, z: 0, yaw: 0 };
      placeBodies(pose, rel, crs, victim);
      const expected = crsFromVictim(victim, o);
      expect(crs.x).toBeCloseTo(expected.x);
      expect(crs.z).toBeCloseTo(expected.z);
      close(crs.yaw, expected.yaw);
    });
  }

  test("the pair sits on the server line: the CRS faces its protester, each off by half the gap difference", () => {
    const rel = victimInCrs(STANDING_COLLAR);
    // Server: CRS at the origin walking +X, its protester 0.9 m behind.
    const pose = targetPose(0, 0, -0.9, 0, rel, 0, { cx: 0, cz: 0, yaw: 0 });
    const crs: Placed = { x: 0, z: 0, yaw: 0 };
    const victim: Placed = { x: 0, z: 0, yaw: 0 };
    placeBodies(pose, rel, crs, victim);
    close(crs.yaw, -Math.PI / 2);
    expect(crs.x).toBeCloseTo(-0.145);
    expect(victim.x).toBeCloseTo(-0.755);
    expect(crs.z).toBeCloseTo(0);
    expect(victim.z).toBeCloseTo(0);
  });

  test("dragging: the CRS is drawn facing back toward the protester, who lies along the line", () => {
    const rel = victimInCrs(GROUND_COLLAR);
    const pose = targetPose(0, 0, 0, -0.95, rel, 0, { cx: 0, cz: 0, yaw: 0 });
    const crs: Placed = { x: 0, z: 0, yaw: 0 };
    const victim: Placed = { x: 0, z: 0, yaw: 0 };
    placeBodies(pose, rel, crs, victim);
    // Server facing is +Z (to the van); drawn about π from it.
    expect(Math.abs(turn(0, crs.yaw))).toBeGreaterThan(Math.PI - 0.2);
    expect(Math.hypot(crs.x, crs.z)).toBeLessThan(0.05);
    expect(Math.hypot(victim.x, victim.z + 0.95)).toBeLessThan(0.05);
  });

  test("bodies on the same spot keep the fallback yaw", () => {
    const pose = targetPose(1, 1, 1, 1, victimInCrs(STANDING_COLLAR), 0.3, { cx: 0, cz: 0, yaw: 0 });
    expect(pose.yaw).toBe(0.3);
  });
});

describe("clampDrift", () => {
  test("pulls a body back to MAX_DRIFT from its server spot", () => {
    const b: Placed = { x: 2, z: 0, yaw: 0 };
    expect(clampDrift(b, 0, 0)).toBeCloseTo(2 - MAX_DRIFT);
    expect(b.x).toBeCloseTo(MAX_DRIFT);
  });

  test("leaves a body within reach alone", () => {
    const b: Placed = { x: 0.3, z: 0, yaw: 0 };
    expect(clampDrift(b, 0, 0)).toBe(0);
    expect(b.x).toBe(0.3);
  });
});
