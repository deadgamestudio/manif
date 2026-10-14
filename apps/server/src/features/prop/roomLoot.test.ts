import { describe, expect, test } from "bun:test";
import {
  PLAYER_RADIUS,
  PROP_TYPES,
  ROOM_LOOT,
  ROOM_LOOT_REFILL,
  SHOP_KINDS,
  STREET_LEVEL,
  THROWABLE_TYPES,
  carveLevel,
  circleOverlaps,
  generateShops,
  propCollisionWorld,
  shopSlot,
  type ItemKind,
  type ShopRoom,
} from "@manif/shared";
import { RoomLoot, roomLootSpots } from "./roomLoot.js";

/** Small seeded generator so the streets are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground, reduced to ids. */
class Ground {
  readonly items = new Map<string, { kind: ItemKind; x: number; z: number }>();
  private n = 0;
  drop = (kind: ItemKind, x: number, z: number): string => {
    const id = `item-${++this.n}`;
    this.items.set(id, { kind, x, z });
    return id;
  };
  has = (id: string) => this.items.has(id);
  take(count = Infinity) {
    for (const id of [...this.items.keys()].slice(0, count)) this.items.delete(id);
  }
}

const ROOM: ShopRoom = {
  id: "shop-1",
  building: "bldg-r1",
  side: 1,
  rect: { minX: 10, maxX: 14, minZ: -2, maxZ: 2 },
  height: 3.5,
  door: { x: 10, z: 0, width: 4 },
};
const OPEN = { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, boxes: [], circles: [] };

describe("roomLootSpots (#84)", () => {
  test("every spot in its room, clear of the walls and of everything, reachable by a body standing on it, over many streets", () => {
    let rooms = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lots = generateShops(STREET_LEVEL, mulberry32(seed));
      const carved = carveLevel(STREET_LEVEL, lots);
      const world = propCollisionWorld(carved.level, () => true, [...carved.level.propSlots, ...lots.map(shopSlot)]);
      for (const lot of lots) {
        const room = carved.rooms.find((r) => r.id === lot.id)!;
        const kind = PROP_TYPES[lot.kind].dropKind;
        const spots = roomLootSpots(room, kind, ROOM_LOOT[lot.kind], world);
        expect(spots.length).toBe(ROOM_LOOT[lot.kind]);
        const r = room.rect;
        for (const p of spots) {
          expect(p.x).toBeGreaterThanOrEqual(r.minX + PLAYER_RADIUS);
          expect(p.x).toBeLessThanOrEqual(r.maxX - PLAYER_RADIUS);
          expect(p.z).toBeGreaterThanOrEqual(r.minZ + PLAYER_RADIUS);
          expect(p.z).toBeLessThanOrEqual(r.maxZ - PLAYER_RADIUS);
          expect(circleOverlaps(world, p.x, p.z, THROWABLE_TYPES[kind].radius)).toBe(false);
          // A protester can stand right on it.
          expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
        }
        // Spread out, not piled up.
        for (let i = 0; i < spots.length; i++)
          for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThan(0.5);
        rooms++;
      }
    }
    expect(rooms).toBeGreaterThan(400);
  });

  test("every shop kind has loot inside, its own throwable; the bank the most", () => {
    for (const kind of SHOP_KINDS) expect(ROOM_LOOT[kind]).toBeGreaterThan(0);
    for (const kind of SHOP_KINDS) if (kind !== "banque") expect(ROOM_LOOT.banque).toBeGreaterThan(ROOM_LOOT[kind]);
  });
});

describe("RoomLoot (#84)", () => {
  test("a broken shop's room gets its kind's loot, once", () => {
    const ground = new Ground();
    const loot = new RoomLoot(ground.drop, ground.has);
    expect(loot.open(ROOM, "banque", OPEN)).toBe(ROOM_LOOT.banque);
    expect([...ground.items.values()].every((i) => i.kind === PROP_TYPES.banque.dropKind)).toBe(true);
    expect(loot.open(ROOM, "banque", OPEN)).toBe(0);
    expect(ground.items.size).toBe(ROOM_LOOT.banque);
    // Not a shop: nothing.
    expect(loot.open({ ...ROOM, id: "bin-1" }, "bin", OPEN)).toBe(0);
  });

  test("refills once, ROOM_LOOT_REFILL after the last item was taken, never while some lie there", () => {
    const ground = new Ground();
    const loot = new RoomLoot(ground.drop, ground.has);
    loot.open(ROOM, "kebab", OPEN);
    const n = ROOM_LOOT.kebab;
    ground.take(n - 1);
    loot.step(0);
    loot.step(100);
    expect(ground.items.size).toBe(1);
    ground.take();
    loot.step(200);
    loot.step(200 + ROOM_LOOT_REFILL - 0.1);
    expect(ground.items.size).toBe(0);
    loot.step(200 + ROOM_LOOT_REFILL);
    expect(ground.items.size).toBe(n);
    // Taken again: gone for the round.
    ground.take();
    for (let t = 300; t < 1000; t += 10) loot.step(t);
    expect(ground.items.size).toBe(0);
  });

  test("a new street forgets every room: nothing comes back after a reset", () => {
    const ground = new Ground();
    const loot = new RoomLoot(ground.drop, ground.has);
    loot.open(ROOM, "cafe", OPEN);
    ground.take();
    loot.step(0);
    loot.reset();
    ground.items.clear();
    loot.step(ROOM_LOOT_REFILL + 1);
    expect(ground.items.size).toBe(0);
    // And the same shop id can be filled again in the next round.
    expect(loot.open(ROOM, "cafe", OPEN)).toBe(ROOM_LOOT.cafe);
  });
});
