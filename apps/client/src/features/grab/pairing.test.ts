import { describe, expect, test } from "bun:test";
import { matchPairs, type Grabbed, type Grabber } from "./pairing.ts";

const GAP = 0.9;

/** A bot at (x, z) facing `rotation`, and the protester the server keeps behind it. */
function pair(id: string, x: number, z: number, rotation: number): [Grabber, Grabbed] {
  return [
    { id: `crs-${id}`, x, z, rotation, gap: GAP },
    { id, x: x - Math.sin(rotation) * GAP, z: z - Math.cos(rotation) * GAP },
  ];
}

describe("matchPairs", () => {
  test("pairs a grabbed protester with the bot right in front of them", () => {
    const [c, v] = pair("a", 3, 4, 0.7);
    expect(matchPairs([c], [v])).toEqual(new Map([["a", "crs-a"]]));
  });

  test("leaves a protester with no bot close enough alone", () => {
    const [c] = pair("a", 0, 0, 0);
    expect(matchPairs([c], [{ id: "a", x: 0, z: -3 }]).size).toBe(0);
  });

  test("two drags side by side, facing opposite ways, keep their own partners", () => {
    // Bots 1 m apart, nearer to each other's protester than the plain distance suggests.
    const [c1, v1] = pair("a", 0, 0, Math.PI / 2);
    const [c2, v2] = pair("b", 0, 1, -Math.PI / 2);
    const pairs = matchPairs([c1, c2], [v1, v2]);
    expect(pairs.get("a")).toBe("crs-a");
    expect(pairs.get("b")).toBe("crs-b");
  });

  test("one bot never holds two protesters", () => {
    const [c, v] = pair("a", 0, 0, 0);
    const pairs = matchPairs([c], [v, { id: "b", x: v.x + 0.3, z: v.z }]);
    expect(pairs.size).toBe(1);
    expect(pairs.get("a")).toBe("crs-a");
  });

  test("last frame's partner wins a near tie", () => {
    const [c1, v] = pair("a", 0, 0, 0);
    const c2: Grabber = { ...c1, id: "crs-b", x: 0.1 };
    expect(matchPairs([c1, c2], [v]).get("a")).toBe("crs-a");
    expect(matchPairs([c1, c2], [v], new Map([["a", "crs-b"]])).get("a")).toBe("crs-b");
  });
});
