import { describe, expect, test } from "bun:test";
import { SHOP_KINDS, shopRoom, type ShopLot, type ShopRoom } from "@manif/shared";
import { CLEAR_DOORWAY, roomClutter, roomSize } from "./roomInterior.ts";

const lot = (over: Partial<ShopLot>): ShopLot => ({
  id: "shop-1",
  kind: "cafe",
  side: -1,
  z: 0,
  width: 6,
  face: 10,
  out: 0,
  height: 3.5,
  interior: 4,
  style: 1,
  ...over,
});

const room = (over: Partial<ShopLot>): ShopRoom => shopRoom(lot(over), "bldg")!;

// The smallest and largest rooms the layout can make, and a few in between.
const ROOMS = [
  room({ width: 4, interior: 3, height: 3 }),
  room({ id: "shop-2", width: 9, interior: 5, height: 4.25, side: 1 }),
  room({ id: "shop-3", width: 5.5, interior: 3.5 }),
  room({ id: "shop-4", width: 7, interior: 4.5, height: 4 }),
];

describe("roomClutter", () => {
  test("the same room always gets the same mess", () => {
    for (const r of ROOMS) expect(roomClutter(r)).toEqual(roomClutter(r));
  });

  test("every piece's centre is inside the room, under its ceiling", () => {
    for (const r of ROOMS) {
      const { depth, halfWidth } = roomSize(r);
      for (const p of roomClutter(r)) {
        expect(p.at[0]).toBeGreaterThan(0);
        expect(p.at[0]).toBeLessThan(depth);
        expect(Math.abs(p.at[2])).toBeLessThan(halfWidth);
        expect(p.at[1]).toBeLessThan(r.height);
      }
    }
  });

  test("each new kind (#117) dresses its room, inside the walls, clear of the doorway", () => {
    for (const kind of SHOP_KINDS.slice(6)) {
      for (const r of ROOMS) {
        const { depth, halfWidth } = roomSize(r);
        const pieces = roomClutter(r, kind);
        const extra = pieces.filter((p) => p.m === "accent" || p.m === "glow");
        expect(extra.length, kind).toBeGreaterThan(0);
        expect(roomClutter(r, kind)).toEqual(pieces);
        for (const p of extra) {
          expect(p.color).toBeDefined();
          expect(p.at[0] + p.size[0] / 2).toBeLessThanOrEqual(depth);
          expect(p.at[0] - p.size[0] / 2).toBeGreaterThanOrEqual(CLEAR_DOORWAY);
          expect(Math.abs(p.at[2])).toBeLessThan(halfWidth);
          expect(p.at[1] + p.size[1] / 2).toBeLessThanOrEqual(r.height);
        }
      }
    }
  });

  test("only flat litter lies in the doorway", () => {
    for (const r of ROOMS) {
      for (const p of roomClutter(r)) {
        if (p.m === "litter") expect(p.size[1]).toBeLessThan(0.05);
        else expect(p.at[0] - p.size[0] / 2).toBeGreaterThanOrEqual(CLEAR_DOORWAY - 1e-9);
      }
    }
  });
});
