import { describe, expect, test } from "bun:test";
import { STREET_LEVEL, type ShopLot } from "@manif/shared";
import { carveBlocks } from "./blocks.ts";
import { findOccluders, type OcclusionCamera } from "./occlusion.ts";

// The game's isometric camera: at +X/+Y/+Z looking down the (-1, -1, -1) diagonal.
const D = 1 / Math.sqrt(3);
const ISO: OcclusionCamera = { position: { x: 60, y: 60, z: 60 }, direction: { x: -D, y: -D, z: -D }, orthographic: true };

const lot = (over: Partial<ShopLot>): ShopLot => ({
  id: "shop-1",
  kind: "cafe",
  side: -1,
  z: 2,
  width: 6,
  face: 10,
  out: 0,
  height: 3.5,
  interior: 4,
  style: 1,
  ...over,
});

// bldg-l3 (z -20..24, facade at x = -10) and bldg-r3 (z 0..34, facade at x = 10).
const LEFT = lot({ id: "shop-1" });
const RIGHT = lot({ id: "shop-2", side: 1, z: 10, width: 5, interior: 3.5 });
const { blocks, rooms } = carveBlocks(STREET_LEVEL, [LEFT, RIGHT]);
const blockBoxes = blocks.map((b) => b.box);
const indexOf = (id: string) => blocks.findIndex((b) => b.box.id === id);

describe("carveBlocks", () => {
  test("one entry per building block, in level order, with its colour index", () => {
    const buildings = STREET_LEVEL.boxes.filter((b) => b.kind === "building");
    expect(blocks.map((b) => b.box.id)).toEqual(buildings.map((b) => b.id));
    for (const b of blocks) expect(STREET_LEVEL.boxes[b.index]).toBe(b.box);
  });

  test("a block with no shop is drawn whole", () => {
    const plain = blocks[indexOf("bldg-l1")]!;
    expect(plain.pieces).toEqual([plain.box]);
    expect(plain.rooms).toEqual([]);
  });

  test("a block with a shop gets its own pieces and its room", () => {
    const carved = blocks[indexOf("bldg-l3")]!;
    expect(carved.pieces.length).toBeGreaterThan(1);
    for (const p of carved.pieces) expect(p.id.startsWith("bldg-l3:")).toBe(true);
    expect(carved.rooms.map((r) => r.id)).toEqual(["shop-1"]);
    expect(blocks[indexOf("bldg-r3")]!.rooms.map((r) => r.id)).toEqual(["shop-2"]);
    expect(rooms).toHaveLength(2);
  });

  test("every carved piece is accounted for in exactly one block", () => {
    const all = blocks.flatMap((b) => b.pieces.map((p) => p.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("fading for someone inside a shop room (#84)", () => {
  test("a player inside a left-hand room fades its block", () => {
    expect([...findOccluders(blockBoxes, [{ x: -12, y: 1, z: 2 }], ISO)]).toEqual([indexOf("bldg-l3")]);
  });

  test("a player inside a right-hand room fades its block", () => {
    expect([...findOccluders(blockBoxes, [{ x: 12, y: 1, z: 10 }], ISO)]).toContain(indexOf("bldg-r3"));
  });

  test("the carved pieces alone would miss them: the line of sight leaves through the doorway", () => {
    const pieces = blocks[indexOf("bldg-l3")]!.pieces;
    expect([...findOccluders(pieces, [{ x: -12, y: 1, z: 2 }], ISO)]).toEqual([]);
  });

  test("standing in the street in front of the shop does not fade it", () => {
    expect([...findOccluders(blockBoxes, [{ x: -8, y: 1, z: 2 }], ISO)]).toEqual([]);
  });
});
