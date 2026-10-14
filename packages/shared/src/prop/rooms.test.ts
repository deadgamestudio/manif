import { describe, expect, test } from "bun:test";
import {
  MAX_KNOCKBACK_SPEED,
  MIN_OBSTACLE_HALF_THICKNESS,
  applyImpulse,
  circleOverlaps,
  createBody,
  moveCircle,
  stepBody,
  type Rect,
} from "../physics/index.js";
import { TICK_DT } from "../net/index.js";
import { THROWABLE_TYPES, createProjectile, stepProjectile, type ItemKind } from "../throwable/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { STREET_LEVEL as L, type BoxObstacle } from "../level/index.js";
import { propCollisionWorld } from "./prop.js";
import { SHOP_LAYOUT, generateShops, shopFootprint, shopSlot } from "./shops.js";
import { SHOP_ROOM, carveLevel, roomAt, shopRoom } from "./rooms.js";

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

const EPS = 1e-9;
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const streets = SEEDS.map((seed) => {
  const lots = generateShops(L, mulberry32(seed));
  return { seed, lots, carved: carveLevel(L, lots) };
});
const buildings = L.boxes.filter((b) => b.kind === "building");

function rectOf(b: BoxObstacle): Rect {
  return { minX: b.x - b.halfX, maxX: b.x + b.halfX, minZ: b.z - b.halfZ, maxZ: b.z + b.halfZ };
}
const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
function overlapArea(a: Rect, b: Rect): number {
  const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return x > 0 && z > 0 ? x * z : 0;
}
const inside = (r: Rect, x: number, z: number) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;

describe("carveLevel (#84)", () => {
  test("pieces and rooms tile each building block: same area, no overlap, every point covered once", () => {
    const random = mulberry32(99);
    for (const { carved } of streets) {
      for (const block of buildings) {
        const whole = rectOf(block);
        const parts = [
          ...carved.level.boxes.filter((b) => b.id === block.id || b.id.startsWith(`${block.id}:`)).map(rectOf),
          ...carved.rooms.filter((r) => r.building === block.id).map((r) => r.rect),
        ];
        expect(Math.abs(parts.reduce((s, p) => s + area(p), 0) - area(whole))).toBeLessThan(1e-6);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(overlapArea(parts[i]!, parts[j]!)).toBeLessThan(EPS);
        for (const p of parts) {
          expect(p.minX).toBeGreaterThanOrEqual(whole.minX - EPS);
          expect(p.maxX).toBeLessThanOrEqual(whole.maxX + EPS);
          expect(p.minZ).toBeGreaterThanOrEqual(whole.minZ - EPS);
          expect(p.maxZ).toBeLessThanOrEqual(whole.maxZ + EPS);
        }
        for (let k = 0; k < 200; k++) {
          const x = whole.minX + random() * (whole.maxX - whole.minX);
          const z = whole.minZ + random() * (whole.maxZ - whole.minZ);
          expect(parts.filter((p) => inside(p, x, z)).length).toBe(1);
        }
      }
    }
  });

  test("every piece is at least SHOP_ROOM.minWall thick, so nothing tunnels through it", () => {
    expect(SHOP_ROOM.minWall / 2).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
    for (const { carved } of streets) {
      for (const b of carved.level.boxes) {
        expect(b.halfX * 2).toBeGreaterThanOrEqual(SHOP_ROOM.minWall - EPS);
        expect(b.halfZ * 2).toBeGreaterThanOrEqual(SHOP_ROOM.minWall - EPS);
      }
    }
  });

  test("one room per shop, inside its block, behind its front, with a doorway at least 2 wide", () => {
    for (const { lots, carved } of streets) {
      expect(carved.rooms.length).toBe(lots.length);
      expect(new Set(carved.rooms.map((r) => r.id)).size).toBe(lots.length);
      for (const lot of lots) {
        const room = carved.rooms.find((r) => r.id === lot.id)!;
        expect(room).toBeDefined();
        expect(room).toEqual(shopRoom(lot, room.building)!);
        const block = rectOf(L.boxes.find((b) => b.id === room.building)!);
        expect(room.rect.minX).toBeGreaterThanOrEqual(block.minX);
        expect(room.rect.maxX).toBeLessThanOrEqual(block.maxX);
        expect(room.rect.minZ).toBeGreaterThanOrEqual(block.minZ);
        expect(room.rect.maxZ).toBeLessThanOrEqual(block.maxZ);
        expect(room.side).toBe(lot.side);
        // The street-side edge on the facade; the far one `interior` deep.
        const near = lot.side < 0 ? -room.rect.maxX : room.rect.minX;
        const far = lot.side < 0 ? -room.rect.minX : room.rect.maxX;
        expect(near).toBe(lot.face);
        expect(far).toBe(lot.face + lot.interior);
        // Within the shop's width, a frame on each side.
        expect(room.rect.minZ).toBeCloseTo(lot.z - lot.width / 2 + SHOP_ROOM.frame, 9);
        expect(room.rect.maxZ).toBeCloseTo(lot.z + lot.width / 2 - SHOP_ROOM.frame, 9);
        expect(room.door.width).toBeGreaterThanOrEqual(2);
        expect(room.door.x).toBe(lot.side * lot.face);
        expect(room.door.z).toBe(lot.z);
        // The intact shop seals the whole doorway: its box spans it and reaches into the room.
        const box = shopFootprint(lot);
        expect(box.z - box.halfZ).toBeLessThanOrEqual(room.rect.minZ);
        expect(box.z + box.halfZ).toBeGreaterThanOrEqual(room.rect.maxZ);
        expect(Math.abs(box.x) + box.halfX).toBeGreaterThan(lot.face + PLAYER_RADIUS * 2);
        expect(roomAt(carved.rooms, (room.rect.minX + room.rect.maxX) / 2, lot.z)).toBe(room);
      }
    }
  });

  test("a block with no shop stays whole, and every other obstacle is left as it was", () => {
    for (const { carved } of streets) {
      for (const block of buildings) {
        if (carved.rooms.some((r) => r.building === block.id)) {
          expect(carved.level.boxes.some((b) => b.id === block.id)).toBe(false);
          continue;
        }
        expect(carved.level.boxes).toContain(block);
      }
      for (const b of L.boxes) if (b.kind !== "building") expect(carved.level.boxes).toContain(b);
      expect(carved.level.circles).toBe(L.circles);
      expect(carved.level.propSlots).toBe(L.propSlots);
    }
  });

  test("no shop, no carving", () => {
    const carved = carveLevel(L, []);
    expect(carved.rooms).toEqual([]);
    expect(carved.level.boxes).toEqual(L.boxes);
  });

  test("an intact shop keeps a player out; once broken, the player walks in to the back wall and out again", () => {
    for (const { lots, carved } of streets.slice(0, 40)) {
      for (const lot of lots) {
        const room = carved.rooms.find((r) => r.id === lot.id)!;
        const slots = [...carved.level.propSlots, ...lots.map(shopSlot)];
        const intact = propCollisionWorld(carved.level, () => false, slots);
        const broken = propCollisionWorld(carved.level, (id) => id === lot.id, slots);
        // A clear spot on the pavement in front (a lamp post or a tree may stand right in front of a flush shop).
        const half = room.door.width / 2 - PLAYER_RADIUS - 0.05;
        const out = [0, 1, -1]
          .flatMap((f) => [1.5, 1, 2.5].map((d) => ({ x: room.door.x - lot.side * (Math.max(lot.out, 0) + d), z: room.door.z + f * half })))
          .find((p) => !circleOverlaps(broken, p.x, p.z, PLAYER_RADIUS))!;
        expect(out).toBeDefined();
        const deep = { x: room.door.x + lot.side * (lot.interior - PLAYER_RADIUS - 0.05), z: out.z };
        expect(circleOverlaps(broken, deep.x, deep.z, PLAYER_RADIUS)).toBe(false);
        // Walk in, in small steps, as bodies do.
        const walk = (world: typeof broken, from: { x: number; z: number }, to: { x: number; z: number }) => {
          let p = from;
          for (let i = 0; i < 60; i++) p = moveCircle(world, p, (to.x - from.x) / 60, (to.z - from.z) / 60, PLAYER_RADIUS);
          return p;
        };
        const inThere = walk(broken, out, deep);
        expect(Math.hypot(inThere.x - deep.x, inThere.z - deep.z)).toBeLessThan(1e-6);
        const back = walk(broken, deep, out);
        expect(Math.hypot(back.x - out.x, back.z - out.z)).toBeLessThan(1e-6);
        const blocked = walk(intact, out, deep);
        expect(roomAt(carved.rooms, blocked.x, blocked.z)).toBe(null);
      }
    }
  });

  test("a room is never smaller than a shop's smallest one", () => {
    for (const { carved } of streets) {
      for (const r of carved.rooms) {
        expect(r.rect.maxZ - r.rect.minZ).toBeGreaterThanOrEqual(SHOP_LAYOUT.minWidth - 2 * SHOP_ROOM.frame);
        expect(r.rect.maxX - r.rect.minX).toBeGreaterThanOrEqual(SHOP_LAYOUT.minInterior);
      }
    }
  });

  test("nothing tunnels through the walls round a room: max knockbacks and thrown items at full speed stay inside", () => {
    const kinds = Object.keys(THROWABLE_TYPES).map(Number).filter((k) => k > 0) as ItemKind[];
    for (const { lots, carved } of streets.slice(0, 30)) {
      const world = propCollisionWorld(carved.level, () => true, [...carved.level.propSlots, ...lots.map(shopSlot)]);
      for (const room of carved.rooms) {
        const r = room.rect;
        const mid = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
        // Into the back wall and both side walls (and the corners), never out through the doorway.
        const dirs = [
          [room.side, 0],
          [0, 1],
          [0, -1],
          [room.side * Math.SQRT1_2, Math.SQRT1_2],
          [room.side * Math.SQRT1_2, -Math.SQRT1_2],
        ] as const;
        const grown = { minX: r.minX - 1e-6, maxX: r.maxX + 1e-6, minZ: r.minZ - 1e-6, maxZ: r.maxZ + 1e-6 };
        // In the room, or bounced back out of it into the street; never through a wall into the building or beyond.
        const within = (x: number, z: number) =>
          (x >= grown.minX && x <= grown.maxX && z >= grown.minZ && z <= grown.maxZ) || -room.side * (x - room.door.x) > 0;
        for (const [dx, dz] of dirs) {
          const body = createBody(mid.x, mid.z);
          applyImpulse(body, dx, dz, MAX_KNOCKBACK_SPEED * 2);
          for (let t = 0; t < 1; t += TICK_DT) {
            stepBody(world, body, { x: 0, z: 0 }, 6, PLAYER_RADIUS, TICK_DT);
            expect(within(body.x, body.z)).toBe(true);
            expect(circleOverlaps(world, body.x, body.z, PLAYER_RADIUS)).toBe(false);
          }
          for (const kind of kinds) {
            const p = createProjectile("p", kind, "me", mid.x, mid.z, dx, dz, 3);
            for (let i = 0; i < 60 && p.left > 0; i++) {
              const step = stepProjectile(p, TICK_DT * 3, world, []);
              expect(within(p.x, p.z)).toBe(true);
              if (step.type !== "flying") break;
            }
          }
        }
      }
    }
  });
});
