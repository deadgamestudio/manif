import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL } from "../level/index.js";
import { pickSpawn, pickTarget, vanDoors, type ProtesterView } from "./targeting.js";

const at = (id: string, x: number, z: number, status: number = PlayerStatus.Free): ProtesterView => ({ id, x, z, status, down: false });
const origin = { x: 0, z: 0 };

describe("pickTarget", () => {
  test("the nearest free protester in sight", () => {
    expect(pickTarget(origin, [at("a", 5, 0), at("b", 3, 0), at("c", 0, 8)], 20, null, 3)).toBe("b");
  });

  test("ties go to the smaller id, whatever the order", () => {
    expect(pickTarget(origin, [at("b", 3, 0), at("a", -3, 0)], 20, null, 3)).toBe("a");
    expect(pickTarget(origin, [at("a", -3, 0), at("b", 3, 0)], 20, null, 3)).toBe("a");
  });

  test("never chases grabbed, KO or arrested protesters", () => {
    const list = [at("g", 1, 0, PlayerStatus.Grabbed), at("k", 1, 0, PlayerStatus.Ko), at("x", 1, 0, PlayerStatus.Arrested)];
    expect(pickTarget(origin, list, 20, null, 3)).toBeNull();
    expect(pickTarget(origin, [...list, at("f", 9, 0)], 20, null, 3)).toBe("f");
  });

  test("skips a protester in their grace (#131), even the current target", () => {
    const graced = { ...at("g", 1, 0), graced: true };
    expect(pickTarget(origin, [graced, at("f", 9, 0)], 20, null, 3)).toBe("f");
    expect(pickTarget(origin, [graced, at("f", 9, 0)], 20, "g", 3)).toBe("f");
    expect(pickTarget(origin, [graced], 20, "g", 3)).toBeNull();
  });

  test("nobody beyond sight", () => {
    expect(pickTarget(origin, [at("a", 30, 0)], 20, null, 3)).toBeNull();
  });

  test("sticks with the current target unless another is clearly closer", () => {
    const list = [at("cur", 6, 0), at("new", 4, 0)];
    expect(pickTarget(origin, list, 20, "cur", 3)).toBe("cur");
    expect(pickTarget(origin, [at("cur", 8, 0), at("new", 4, 0)], 20, "cur", 3)).toBe("new");
  });

  test("drops a current target that is no longer free", () => {
    expect(pickTarget(origin, [at("cur", 1, 0, PlayerStatus.Ko), at("b", 9, 0)], 20, "cur", 3)).toBe("b");
  });

  test("skips the ignored target", () => {
    expect(pickTarget(origin, [at("a", 1, 0), at("b", 9, 0)], 20, null, 3, "a")).toBe("b");
  });
});

describe("pickSpawn", () => {
  const points = [
    { x: 0, z: 0 },
    { x: 0, z: 20 },
    { x: 0, z: 40 },
  ];

  test("the point closest to the protesters that is still far enough", () => {
    expect(pickSpawn(points, [{ x: 0, z: 45 }], 10)).toEqual({ x: 0, z: 20 });
  });

  test("no point far enough: the farthest one", () => {
    expect(pickSpawn(points, [{ x: 0, z: 15 }], 30)).toEqual({ x: 0, z: 40 });
  });

  test("no protesters: the first point; no points: null", () => {
    expect(pickSpawn(points, [], 10)).toEqual({ x: 0, z: 0 });
    expect(pickSpawn([], [{ x: 0, z: 0 }], 10)).toBeNull();
  });
});

describe("vanDoors", () => {
  test("one door per van of the street, beside it, towards the middle", () => {
    const vans = STREET_LEVEL.boxes.filter((b) => b.kind === "van");
    const doors = vanDoors(STREET_LEVEL);
    expect(doors.length).toBe(vans.length);
    doors.forEach((d, i) => {
      const v = vans[i]!;
      expect(Math.abs(d.x)).toBeLessThan(Math.abs(v.x));
      expect(d.z).toBe(v.z);
    });
  });
});

describe("target priority (#14, the black bloc)", () => {
  const weighted = (id: string, x: number, priority: number): ProtesterView => ({ ...at(id, x, 0), priority });

  test("a priority target is chased first among protesters at similar distances", () => {
    expect(pickTarget(origin, [at("a", 5, 0), weighted("bb", 6.5, 1.4)], 20, null, 3)).toBe("bb");
  });

  test("a weight, not an absolute rule: a far one does not pull the bot off a near one", () => {
    expect(pickTarget(origin, [at("a", 3, 0), weighted("bb", 15, 1.4)], 20, null, 3)).toBe("a");
  });

  test("never one out of sight", () => {
    expect(pickTarget(origin, [weighted("bb", 21, 1.4)], 20, null, 3)).toBeNull();
  });

  test("priority 1 or absent is the plain nearest", () => {
    expect(pickTarget(origin, [weighted("a", 5, 1), at("b", 4, 0)], 20, null, 3)).toBe("b");
  });
});
