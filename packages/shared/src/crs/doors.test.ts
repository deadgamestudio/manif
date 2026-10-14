import { describe, expect, test } from "bun:test";
import { PlayerStatus } from "../health/index.js";
import { STREET_LEVEL as L } from "../level/index.js";
import { TICK_DT } from "../net/index.js";
import { circleOverlaps, createBody, moveCircle, stepBody, type CollisionWorld, type Vec2 } from "../physics/index.js";
import { PLAYER_RADIUS } from "../player/index.js";
import { carveLevel, generateShops, propCollisionWorld, roomAt, shopSlot, type ShopRoom } from "../prop/index.js";
import { createCrsBot, stepCrs, steerTo, type CrsContext, type CrsHost } from "./brain.js";
import { CRS_STATS, CrsKind, CrsStatus, GRAB_HP_THRESHOLD } from "./constants.js";
import { DOOR_STANDOFF, doorWaypoint } from "./doors.js";
import { NavGrid } from "./nav.js";
import { vanDoors, type ProtesterView } from "./targeting.js";

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

const STATS = CRS_STATS[CrsKind.Crs];
/** The squad's grid clearance: the widest unit on foot. */
const CLEARANCE = Math.max(...Object.values(CRS_STATS).map((s) => s.radius));

/** A round's street with every shop smashed: all the doorways open. */
function street(seed: number) {
  const lots = generateShops(L, mulberry32(seed));
  const carved = carveLevel(L, lots);
  const world = propCollisionWorld(carved.level, (id) => id.startsWith("shop"), [...carved.level.propSlots, ...lots.map(shopSlot)]);
  return { lots, rooms: carved.rooms, world, nav: new NavGrid(world, CLEARANCE) };
}

const STREETS = [1, 2, 3, 4, 5, 6].map(street);

/** Deep in a room, by its back wall, on the doorway's centre line. */
function deepIn(room: ShopRoom, r: number): Vec2 {
  const depth = room.rect.maxX - room.rect.minX;
  return { x: room.door.x + room.side * (depth - r - 0.1), z: room.door.z };
}

/** A clear spot out in the street, `along` from the doorway along the street. */
function outside(world: CollisionWorld, room: ShopRoom, along: number, r: number): Vec2 {
  for (const out of [4, 5, 3, 6, 2.5]) {
    for (const dz of [along, -along, along / 2, -along / 2]) {
      const p = { x: room.door.x - room.side * out, z: room.door.z + dz };
      if (!circleOverlaps(world, p.x, p.z, r + 0.05)) return p;
    }
  }
  throw new Error(`no clear spot in front of ${room.id}`);
}

/** True if a body of radius `r` at `p` overlaps a building piece (not just touching). */
function inWall(world: CollisionWorld, p: Vec2, r: number): boolean {
  return circleOverlaps(world, p.x, p.z, r, 1e-3);
}

describe("doorWaypoint (#84)", () => {
  const room: ShopRoom = {
    id: "shop-1",
    building: "bldg-r1",
    side: 1,
    rect: { minX: 10, maxX: 14, minZ: -2, maxZ: 2 },
    height: 3.5,
    door: { x: 10, z: 0, width: 4 },
  };
  const out = { x: 0, z: 0 };

  test("both in the street, or both in the same room: no waypoint", () => {
    expect(doorWaypoint([room], { x: 0, z: 0 }, { x: 5, z: 30 }, 0.45, out)).toBe(false);
    expect(doorWaypoint([room], { x: 13, z: 1 }, { x: 11, z: -1 }, 0.45, out)).toBe(false);
    expect(doorWaypoint([], { x: 0, z: 0 }, { x: 12, z: 0 }, 0.45, out)).toBe(false);
  });

  test("into a room from along the street: square in front of the doorway first, then straight in", () => {
    expect(doorWaypoint([room], { x: 6, z: 10 }, { x: 13, z: 0 }, 0.45, out)).toBe(true);
    expect(out).toEqual({ x: 10 - DOOR_STANDOFF, z: 0 });
    // Lined up in front of it: straight in.
    expect(doorWaypoint([room], { x: 10 - DOOR_STANDOFF, z: 0.5 }, { x: 13, z: 0 }, 0.45, out)).toBe(false);
    // Too far to the side of the doorway to fit: back to the front point.
    expect(doorWaypoint([room], { x: 9.5, z: 1.9 }, { x: 13, z: 0 }, 0.45, out)).toBe(true);
  });

  test("out of a room: straight out through the doorway, until clear of the doorstep", () => {
    expect(doorWaypoint([room], { x: 13, z: 1.5 }, { x: 0, z: -40 }, 0.45, out)).toBe(true);
    expect(out.x).toBe(10 - DOOR_STANDOFF);
    expect(Math.abs(out.z)).toBeLessThan(1.5);
    // On the doorstep, still close to the facade: keeps going out.
    expect(doorWaypoint([room], { x: 9.6, z: 0 }, { x: 0, z: -40 }, 0.45, out)).toBe(true);
    // Far enough out: free to turn.
    expect(doorWaypoint([room], { x: 9, z: 0 }, { x: 0, z: -40 }, 0.45, out)).toBe(false);
  });
});

describe("CRS in and out of shop rooms (#84)", () => {
  test("a CRS starting out in the street walks to the back of every room, never into a wall", () => {
    let rooms = 0;
    for (const { world, nav, rooms: all } of STREETS) {
      for (const room of all) {
        const bot = createCrsBot("crs-1", CrsKind.Crs, 0, 0);
        const start = outside(world, room, 6, STATS.radius);
        bot.body.x = start.x;
        bot.body.z = start.z;
        const goal = deepIn(room, STATS.radius);
        const ctx = { nav, now: 0, bots: [bot], rooms: all };
        let reached = false;
        for (let t = 0; t < 12 && !reached; t += TICK_DT) {
          ctx.now = t;
          steerTo(bot, goal.x, goal.z, ctx);
          stepBody(world, bot.body, bot.input, STATS.speed, STATS.radius, TICK_DT);
          expect(inWall(world, bot.body, STATS.radius)).toBe(false);
          reached = Math.hypot(goal.x - bot.body.x, goal.z - bot.body.z) < 0.4;
        }
        expect({ room: room.id, reached }).toEqual({ room: room.id, reached: true });
        rooms++;
      }
    }
    expect(rooms).toBeGreaterThan(40);
  });

  test("a CRS goes in after a weakened protester, grabs them at the back and drags them out to a van", () => {
    const vans = vanDoors(L);
    let drags = 0;
    for (const { world, nav, rooms: all } of STREETS.slice(0, 3)) {
      for (const room of all) {
        const spot = deepIn(room, PLAYER_RADIUS);
        const body = createBody(spot.x, spot.z);
        const view: ProtesterView = { id: "p", x: spot.x, z: spot.z, status: PlayerStatus.Free, down: false, hp: GRAB_HP_THRESHOLD };
        let worst = 0;
        const host: CrsHost = {
          protesters: () => [view],
          protester: (id) => (id === "p" ? view : undefined),
          canBeHurt: () => false,
          batonHit: () => {},
          grab: () => {
            view.status = PlayerStatus.Grabbed;
            return true;
          },
          arrest: () => {
            view.status = PlayerStatus.Arrested;
          },
          release: () => {
            view.status = PlayerStatus.Free;
          },
          // Like the room's `Bodies.drag`: pulled behind the bot, collided.
          drag: (_id, x, z) => {
            const res = moveCircle(world, body, x - body.x, z - body.z, PLAYER_RADIUS);
            body.x = view.x = res.x;
            body.z = view.z = res.z;
          },
          shove: () => {},
        };
        const start = outside(world, room, 6, STATS.radius);
        const bot = createCrsBot("crs-1", CrsKind.Crs, start.x, start.z);
        const ctx: CrsContext = { world, nav, vans, rooms: all, bots: [bot], now: 0, dt: TICK_DT };
        let grabbedAt = -1;
        for (let t = 0; t < 40 && view.status !== PlayerStatus.Arrested; t += TICK_DT) {
          ctx.now = t;
          stepCrs(bot, ctx, host);
          expect(inWall(world, bot.body, STATS.radius)).toBe(false);
          expect(inWall(world, body, PLAYER_RADIUS)).toBe(false);
          if (grabbedAt < 0 && bot.status === CrsStatus.Grabbing) grabbedAt = t;
          if (bot.status === CrsStatus.Grabbing) worst = Math.max(worst, Math.hypot(bot.body.x - body.x, bot.body.z - body.z));
        }
        expect({ room: room.id, grabbed: grabbedAt >= 0, arrested: view.status }).toEqual({
          room: room.id,
          grabbed: true,
          arrested: PlayerStatus.Arrested,
        });
        // Out of the room, at a van.
        expect(roomAt(all, body.x, body.z)).toBe(null);
        // The dragged body never got caught on the frame: it stays right behind the bot (0.9 apart, centre to centre).
        expect(worst).toBeLessThan(1.1);
        drags++;
      }
    }
    expect(drags).toBeGreaterThan(20);
  });
});
