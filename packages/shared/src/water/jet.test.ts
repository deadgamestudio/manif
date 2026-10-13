import { describe, expect, test } from "bun:test";
import type { PropShape } from "../prop/index.js";
import { FIRE_SOAK, type WaterJetStats } from "./constants.js";
import { JetPushes, JetSoak, aimJet, inJet, jetContact, jetPush } from "./jet.js";

const HOSE: WaterJetStats = { range: 5, halfAngle: 0.3, knockback: 7, pushInterval: 0.5, soakRate: 1 };
/** From the origin, along +X. */
const JET = aimJet({ x: 0, z: 0 }, { x: 10, z: 0 });

describe("aim", () => {
  test("a unit direction towards the target", () => {
    const j = aimJet({ x: 1, z: 1 }, { x: 4, z: 5 });
    expect(j.dirX).toBeCloseTo(0.6);
    expect(j.dirZ).toBeCloseTo(0.8);
    expect(j.x).toBe(1);
  });

  test("on top of the target: keeps the facing", () => {
    const j = aimJet({ x: 0, z: 0 }, { x: 0, z: 0 }, Math.PI / 2);
    expect(j.dirX).toBeCloseTo(1);
    expect(j.dirZ).toBeCloseTo(0);
  });
});

describe("cone hit test", () => {
  test("on the axis, in range: hit; beyond range: missed", () => {
    expect(inJet(JET, HOSE, 3, 0, 0.4)).toBe(true);
    expect(inJet(JET, HOSE, 5.3, 0, 0.4)).toBe(true); // its edge is within range
    expect(inJet(JET, HOSE, 5.5, 0, 0.4)).toBe(false);
  });

  test("off the axis: inside the half angle (plus what the body covers) only", () => {
    // 4 m out, 0.25 rad off: inside.
    expect(inJet(JET, HOSE, 4 * Math.cos(0.25), 4 * Math.sin(0.25), 0)).toBe(true);
    // 0.5 rad off, a point: outside.
    expect(inJet(JET, HOSE, 4 * Math.cos(0.5), 4 * Math.sin(0.5), 0)).toBe(false);
    // The same spot, a body of 0.9: its edge pokes into the cone.
    expect(inJet(JET, HOSE, 4 * Math.cos(0.5), 4 * Math.sin(0.5), 0.9)).toBe(true);
  });

  test("behind the nozzle: never; a body around the nozzle: always", () => {
    expect(inJet(JET, HOSE, -2, 0, 0.4)).toBe(false);
    expect(inJet(JET, HOSE, 0.2, 0.1, 0.4)).toBe(true);
  });
});

describe("contact with a prop", () => {
  const car: PropShape = { type: "box", x: 4, z: 0, halfX: 1, halfZ: 2.1 };
  const farBin: PropShape = { type: "circle", x: 8, z: 0, r: 0.5 };

  test("the nearest point of a prop in the cone", () => {
    const at = jetContact(JET, HOSE, car);
    expect(at).not.toBeNull();
    expect(at?.x).toBeCloseTo(3);
  });

  test("out of range: none", () => {
    expect(jetContact(JET, HOSE, farBin)).toBeNull();
  });

  test("a long car seen at an angle: the axis meets it even though its nearest corner is outside the cone", () => {
    // The car runs along X, 2 m to the side; the jet aims along it, 0.45 rad towards it.
    const longCar: PropShape = { type: "box", x: 3, z: 2.2, halfX: 2.1, halfZ: 1 };
    const j = aimJet({ x: 0, z: 0 }, { x: Math.cos(0.45), z: Math.sin(0.45) });
    expect(jetContact(j, HOSE, longCar)).not.toBeNull();
  });
});

test("the push goes away from the nozzle", () => {
  const d = jetPush(JET, 3, 3);
  expect(d.x).toBeCloseTo(Math.SQRT1_2);
  expect(d.z).toBeCloseTo(Math.SQRT1_2);
  expect(jetPush(JET, 0, 0)).toEqual({ x: 1, z: 0 });
});

describe("soak", () => {
  test("a fire goes out after FIRE_SOAK of water, then is forgotten", () => {
    const s = new JetSoak();
    const dt = 1 / 30;
    let out = false;
    let ticks = 0;
    while (!out && ticks < 1000) {
      out = s.pour("bin-1", HOSE.soakRate * dt);
      ticks++;
    }
    expect(out).toBe(true);
    expect(ticks * dt).toBeCloseTo(FIRE_SOAK / HOSE.soakRate, 1);
    expect(s.get("bin-1")).toBe(0);
  });

  test("water on a fire that went out some other way is dropped", () => {
    const s = new JetSoak();
    s.pour("a", 1);
    s.pour("b", 1);
    s.keep((id) => id === "b");
    expect(s.get("a")).toBe(0);
    expect(s.get("b")).toBe(1);
  });
});

test("one push per body per interval, whatever the number of jets", () => {
  const p = new JetPushes();
  expect(p.tryPush("x", 0, 0.5)).toBe(true);
  expect(p.tryPush("x", 0, 0.5)).toBe(false);
  expect(p.tryPush("x", 0.3, 0.5)).toBe(false);
  expect(p.tryPush("y", 0.3, 0.5)).toBe(true);
  expect(p.tryPush("x", 0.5, 0.5)).toBe(true);
});
