import { describe, expect, test } from "bun:test";
import { Color, Vector3 } from "three";
import { BoxBatch, groupMatrix, mergeBoxes } from "./boxes.ts";

describe("mergeBoxes", () => {
  test("no box, no geometry", () => {
    expect(mergeBoxes([])).toBeNull();
  });

  test("bakes each box where it stands, with its colour on every vertex", () => {
    const batch = new BoxBatch();
    batch.add([0, 0.5, 0], [1, 1, 1], "#ff0000");
    batch.add([10, 2, -3], [2, 4, 6], "#00ff00");
    const g = mergeBoxes(batch.pieces)!;
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos.count).toBe(48);
    expect(g.getIndex()!.count).toBe(72);
    // The second box spans x 9..11, y 0..4, z -6..0.
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    for (let i = 24; i < 48; i++) {
      xs.push(pos.getX(i));
      ys.push(pos.getY(i));
      zs.push(pos.getZ(i));
    }
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([9, 11]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 4]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-6, 0]);
    const green = new Color("#00ff00");
    expect([col.getX(30), col.getY(30), col.getZ(30)]).toEqual([green.r, green.g, green.b]);
    // Indices point into each box's own vertices.
    expect(g.getIndex()!.getX(36)).toBeGreaterThanOrEqual(24);
  });

  test("a group's transform applies to its boxes, normals stay unit length", () => {
    const batch = new BoxBatch();
    const parent = groupMatrix([5, 0, 0], [0, 0, Math.PI / 2], [1, 2, 1]);
    batch.add([0, 0, 0], [1, 1, 1], "#ffffff", undefined, parent);
    const g = mergeBoxes(batch.pieces)!;
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect(new Vector3(n.getX(i), n.getY(i), n.getZ(i)).length()).toBeCloseTo(1, 5);
    const pos = g.getAttribute("position");
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i));
    // Scaled 2 tall along its own Y, then turned a quarter: 2 wide along X, centred on 5.
    expect(maxX).toBeCloseTo(6, 5);
  });
});
