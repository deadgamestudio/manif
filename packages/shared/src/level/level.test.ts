import { describe, expect, test } from "bun:test";
import {
  MAX_KNOCKBACK_SPEED,
  MIN_OBSTACLE_HALF_THICKNESS,
  applyImpulse,
  circleOverlaps,
  createBody,
  moveCircle,
  stepBody,
} from "../physics/index.js";
import { TICK_DT } from "../net/index.js";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../player/index.js";
import { inRect, levelWorld, progressAt, spawnPoint } from "./level.js";
import { STREET_LEVEL as L } from "./street.js";

const world = levelWorld(L);

/** Small seeded generator so spawn tests are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("street level data", () => {
  test("is a long street", () => {
    expect(L.bounds.maxZ - L.bounds.minZ).toBeGreaterThanOrEqual(150);
    expect(L.bounds.maxX - L.bounds.minX).toBeGreaterThanOrEqual(18);
  });

  test("every obstacle is thick enough not to be tunnelled through", () => {
    for (const b of L.boxes) {
      expect(b.halfX).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
      expect(b.halfZ).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
    }
    for (const c of L.circles) expect(c.r).toBeGreaterThanOrEqual(MIN_OBSTACLE_HALF_THICKNESS);
  });

  test("police vans (#70) wait all along the route, flush with the side, never blocking the march", () => {
    const vans = L.boxes.filter((b) => b.kind === "van");
    expect(vans.length).toBeGreaterThanOrEqual(5);
    // Every point of the march has a van within 45 along the street.
    for (let z = L.start.minZ; z >= L.destination.maxZ; z -= 1) {
      expect(Math.min(...vans.map((v) => Math.abs(v.z - z)))).toBeLessThanOrEqual(45);
    }
    for (const v of vans) {
      // Parked by a facade: at least 12 of the street's width left free beside it.
      const free = Math.max(v.x - v.halfX - L.bounds.minX, L.bounds.maxX - (v.x + v.halfX));
      expect(free).toBeGreaterThanOrEqual(12);
      // Not in the start zone.
      const s = L.start;
      const overlapsStart = v.x + v.halfX > s.minX && v.x - v.halfX < s.maxX && v.z + v.halfZ > s.minZ && v.z - v.halfZ < s.maxZ;
      expect(overlapsStart).toBe(false);
    }
  });

  test("every building block has its facade (#83), matching the box", () => {
    const buildings = L.boxes.filter((b) => b.kind === "building");
    expect(L.facades.length).toBe(buildings.length);
    for (const f of L.facades) {
      const b = buildings.find((o) => Math.sign(o.x) === f.side && o.z - o.halfZ === f.minZ && o.z + o.halfZ === f.maxZ);
      expect(b).toBeDefined();
      if (!b) continue;
      expect(Math.abs(b.x) - b.halfX).toBe(f.face);
      expect(b.halfX * 2).toBe(f.depth);
      expect(b.height).toBe(f.height);
    }
  });

  test("ids are unique", () => {
    const ids = [...L.boxes, ...L.circles, ...L.propSlots].map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the whole start zone is clear for a player", () => {
    const s = L.start;
    for (let x = s.minX + PLAYER_RADIUS; x <= s.maxX - PLAYER_RADIUS; x += 0.25) {
      for (let z = s.minZ + PLAYER_RADIUS; z <= s.maxZ - PLAYER_RADIUS; z += 0.25) {
        expect(circleOverlaps(world, x, z, PLAYER_RADIUS)).toBe(false);
      }
    }
  });

  test("the start and destination zones are inside the bounds", () => {
    for (const r of [L.start, L.destination]) {
      expect(r.minX).toBeGreaterThanOrEqual(L.bounds.minX);
      expect(r.maxX).toBeLessThanOrEqual(L.bounds.maxX);
      expect(r.minZ).toBeGreaterThanOrEqual(L.bounds.minZ);
      expect(r.maxZ).toBeLessThanOrEqual(L.bounds.maxZ);
    }
  });

  test("the Préfecture closes the end of the street", () => {
    const pref = L.boxes.find((b) => b.kind === "prefecture");
    expect(pref).toBeDefined();
    if (!pref) return;
    expect(pref.z + pref.halfZ).toBe(L.bounds.minZ);
    expect(pref.x - pref.halfX).toBeLessThanOrEqual(L.bounds.minX);
    expect(pref.x + pref.halfX).toBeGreaterThanOrEqual(L.bounds.maxX);
  });
});

describe("progress axis", () => {
  test("is 0 at the start", () => {
    expect(progressAt(L, L.progress.from.x, L.progress.from.z)).toBe(0);
    // Behind the start line is still 0.
    expect(progressAt(L, 0, L.bounds.maxZ)).toBe(0);
  });

  test("is 0.5 half way", () => {
    const { from, to } = L.progress;
    expect(progressAt(L, (from.x + to.x) / 2, (from.z + to.z) / 2)).toBeCloseTo(0.5, 9);
    // Sideways position does not change progress.
    expect(progressAt(L, 8, (from.z + to.z) / 2)).toBeCloseTo(0.5, 9);
  });

  test("is 1 at the Préfecture", () => {
    expect(progressAt(L, L.progress.to.x, L.progress.to.z)).toBe(1);
    expect(progressAt(L, 0, L.bounds.minZ)).toBe(1);
  });

  test("the start zone is near 0 and the destination is 1", () => {
    expect(progressAt(L, 0, (L.start.minZ + L.start.maxZ) / 2)).toBeLessThan(0.05);
    expect(progressAt(L, 0, L.destination.maxZ)).toBe(1);
  });
});

describe("spawns", () => {
  test("always in the start zone and never inside an obstacle", () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const p = spawnPoint(L, PLAYER_RADIUS, rand);
      expect(inRect(L.start, p.x, p.z)).toBe(true);
      expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
    }
  });

  test("extreme random values still give a valid spawn", () => {
    for (const v of [0, 0.999999]) {
      const p = spawnPoint(L, PLAYER_RADIUS, () => v);
      expect(inRect(L.start, p.x, p.z)).toBe(true);
      expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
    }
  });
});

describe("walking the street", () => {
  const step = PLAYER_SPEED * TICK_DT;

  test("a player can never leave the bounds or get behind the Préfecture", () => {
    const dirs = [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [Math.SQRT1_2, -Math.SQRT1_2],
      [-Math.SQRT1_2, -Math.SQRT1_2],
    ] as const;
    for (const [dx, dz] of dirs) {
      let p = spawnPoint(L, PLAYER_RADIUS, () => 0.5);
      for (let tick = 0; tick < 60 * 30; tick++) {
        p = moveCircle(world, p, dx * step, dz * step, PLAYER_RADIUS);
        expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
      }
    }
  });

  test("random walks never end up inside anything", () => {
    const rand = mulberry32(7);
    let p = spawnPoint(L, PLAYER_RADIUS, rand);
    let angle = 0;
    for (let tick = 0; tick < 30 * 600; tick++) {
      if (tick % 20 === 0) angle = rand() * Math.PI * 2;
      // Bias towards the Préfecture so the walk covers the whole street.
      p = moveCircle(world, p, Math.sin(angle) * step, (Math.cos(angle) - 0.6) * step, PLAYER_RADIUS);
      expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
    }
    expect(progressAt(L, p.x, p.z)).toBeGreaterThan(0.5);
  });

  test("max-speed knockback in random directions never ends inside anything or out of the street", () => {
    const rand = mulberry32(11);
    const body = createBody(0, 0);
    const start = spawnPoint(L, PLAYER_RADIUS, rand);
    body.x = start.x;
    body.z = start.z;
    for (let tick = 0; tick < 30 * 300; tick++) {
      // A max hit every half second, biased down the street to cover it.
      if (tick % 15 === 0) {
        const angle = rand() * Math.PI * 2;
        applyImpulse(body, Math.sin(angle), Math.cos(angle) - 0.5, MAX_KNOCKBACK_SPEED * 2);
      }
      stepBody(world, body, { x: 0, z: 0 }, PLAYER_SPEED, PLAYER_RADIUS, TICK_DT);
      expect(circleOverlaps(world, body.x, body.z, PLAYER_RADIUS)).toBe(false);
    }
    expect(progressAt(L, body.x, body.z)).toBeGreaterThan(0.3);
  });

  test("the inner corner in the level (works wall + kiosk) holds a player pushing into it", () => {
    // works-2 spans x [-9.5, -3], z [-60.5, -59.5]; kiosk-4 sits on it at x [-5, -3].
    // Approach from +x, +z and push towards the corner at (-3, -59.5).
    let p = { x: -6, z: -57 };
    const s = step * Math.SQRT1_2;
    for (let tick = 0; tick < 300; tick++) {
      p = moveCircle(world, p, s, -s, PLAYER_RADIUS);
      expect(circleOverlaps(world, p.x, p.z, PLAYER_RADIUS)).toBe(false);
    }
    expect(p.x).toBeCloseTo(-5.4, 6);
    expect(p.z).toBeCloseTo(-59.1, 6);
  });
});
