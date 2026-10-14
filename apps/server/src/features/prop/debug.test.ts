import { describe, expect, test } from "bun:test";
import { STREET_LEVEL, carveLevel, generateShops, roomAt } from "@manif/shared";
import { debugShopSpot, parseDebugShop } from "./debug.js";

describe("debug:shop (#84)", () => {
  test("reads an index and a depth, clamped; anything else means the nearest shop, three quarters in", () => {
    expect(parseDebugShop({ index: 2, depth: 0.5 })).toEqual({ index: 2, depth: 0.5 });
    expect(parseDebugShop({ index: -1, depth: 7 })).toEqual({ depth: 1 });
    expect(parseDebugShop({ index: 1.5 })).toEqual({ depth: 0.75 });
    expect(parseDebugShop(null)).toEqual({ depth: 0.75 });
  });

  test("a spot inside the room of the shop asked for, or of the nearest one, facing the street", () => {
    const shops = generateShops(STREET_LEVEL, () => 0.5);
    const { rooms } = carveLevel(STREET_LEVEL, shops);
    const spot = debugShopSpot(shops, rooms, { index: 1, depth: 0.75 }, { x: 0, z: 0 })!;
    expect(spot.id).toBe(shops[1]!.id);
    expect(roomAt(rooms, spot.x, spot.z)?.id).toBe(spot.id);
    expect(Math.sign(Math.sin(spot.rotation))).toBe(-shops[1]!.side);
    const last = shops[shops.length - 1]!;
    expect(debugShopSpot(shops, rooms, { depth: 0 }, { x: last.side * last.face, z: last.z })?.id).toBe(last.id);
    expect(debugShopSpot(shops, rooms, { index: 99, depth: 0 }, { x: 0, z: 0 })).toBeNull();
  });
});
