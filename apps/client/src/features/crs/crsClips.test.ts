import { describe, expect, it } from "bun:test";
import { chooseLoop, lyingClip, nearestThrower, stepScale, swingClip, type LoopInput } from "./crsClips.ts";

const base: LoopInput = {
  role: "crs",
  speed: 0,
  turnRate: 0,
  grabbing: false,
  onFire: false,
  splatted: false,
  formation: false,
  spraying: false,
};

describe("chooseLoop", () => {
  it("holds the shield low standing, raised in a line", () => {
    expect(chooseLoop(base).name).toBe("shield-lowered");
    expect(chooseLoop({ ...base, formation: true }).name).toBe("guard-idle");
  });

  it("marches when moving, faster with speed but never past the cap", () => {
    const slow = chooseLoop({ ...base, speed: 1 });
    const fast = chooseLoop({ ...base, speed: 4.2 });
    const charge = chooseLoop({ ...base, speed: 40 });
    expect(slow.name).toBe("formation-walk");
    expect(fast.timeScale).toBeGreaterThan(slow.timeScale);
    expect(charge.timeScale).toBe(stepScale(1000, 1));
  });

  it("stands still under the drift threshold", () => {
    expect(chooseLoop({ ...base, role: "noShield", speed: 0.2 }).name).toBe("guard-idle");
  });

  it("grabbing and burning win over everything else", () => {
    expect(chooseLoop({ ...base, grabbing: true, onFire: true, speed: 3 }).name).toBe("hold-loop");
    expect(chooseLoop({ ...base, onFire: true, splatted: true }).name).toBe("on-fire-run");
  });

  it("wipes the visor when splatted and standing", () => {
    expect(chooseLoop({ ...base, splatted: true }).name).toBe("visor-wipe");
    expect(chooseLoop({ ...base, splatted: true, speed: 2 }).name).toBe("formation-walk");
    expect(chooseLoop({ ...base, role: "noShield", splatted: true }).name).toBe("tomato-stumble");
  });

  it("pompier: ready, walk, spray, sweep while turning", () => {
    const p = { ...base, role: "pompier" as const };
    expect(chooseLoop(p).name).toBe("hose-ready");
    expect(chooseLoop({ ...p, speed: 2 }).name).toBe("hose-walk");
    expect(chooseLoop({ ...p, spraying: true }).name).toBe("hose-spray");
    expect(chooseLoop({ ...p, spraying: true, turnRate: 2 }).name).toBe("hose-sweep");
  });

  it("a revealed BAC moves like a protester, running when fast", () => {
    const b = { ...base, role: "bac" as const };
    expect(chooseLoop(b).name).toBe("idle");
    expect(chooseLoop({ ...b, speed: 2 }).name).toBe("walk");
    expect(chooseLoop({ ...b, speed: 6 }).name).toBe("panic-run");
  });
});

describe("one-shots", () => {
  it("swings a baton, or a fist for the BAC, and the pompier never", () => {
    expect(swingClip("crs")).toBe("baton-swing");
    expect(swingClip("bac")).toBe("melee-swing");
    expect(swingClip("pompier")).toBeNull();
  });

  it("collapses when out, falls when down", () => {
    expect(lyingClip(true)).toBe("ko-collapse");
    expect(lyingClip(false)).toBe("knockdown");
  });
});

describe("nearestThrower", () => {
  const bots: [string, { x: number; z: number }][] = [
    ["a", { x: 0, z: 0 }],
    ["b", { x: 1, z: 0 }],
    ["c", { x: 10, z: 10 }],
  ];

  it("picks the closest bot to the throw's start", () => {
    expect(nearestThrower(0.9, 0, bots)).toBe("b");
    expect(nearestThrower(0.1, 0.1, bots)).toBe("a");
  });

  it("finds nobody when the throw starts away from every bot", () => {
    expect(nearestThrower(5, 5, bots)).toBeNull();
  });
});
