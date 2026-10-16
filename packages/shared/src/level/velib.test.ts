import { describe, expect, test } from "bun:test";
import type { Rect } from "../physics/index.js";
import { SHOP_LAYOUT, propShape } from "../prop/index.js";
import { MAX_GROUND_ITEMS, THROWABLE_TYPES, ThrowableKind } from "../throwable/index.js";
import { STREET_LEVEL as L } from "./street.js";
import { VELIB_DEAL, VELIB_STATION, allVelibDocks, dealVelibs, dockAt, velibDocks } from "./velib.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground a station covers: its docks and the bikes in them. */
function stationRect(i: number): Rect {
  const s = L.velibStations[i]!;
  const docks = velibDocks(s);
  const xs = [s.x + s.side * 0.2, docks[0]!.bike.x - s.side * VELIB_STATION.bikeHalfLength];
  const zs = docks.map((d) => d.dock.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs) - VELIB_STATION.bikeHalfWidth,
    maxZ: Math.max(...zs) + VELIB_STATION.bikeHalfWidth,
  };
}

/** Distance from a rect to a box (0 when they touch or overlap). */
function rectGap(r: Rect, x: number, z: number, hx: number, hz: number): number {
  const dx = Math.max(0, Math.abs(x - (r.minX + r.maxX) / 2) - hx - (r.maxX - r.minX) / 2);
  const dz = Math.max(0, Math.abs(z - (r.minZ + r.maxZ) / 2) - hz - (r.maxZ - r.minZ) / 2);
  return Math.hypot(dx, dz);
}

function circleGap(r: Rect, x: number, z: number, radius: number): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz) - radius;
}

const overlapsZ = (r: Rect, minZ: number, maxZ: number) => r.minZ < maxZ && r.maxZ > minZ;

describe("Vélib stations (#121): placement", () => {
  test("a few stations, ids unique, each a short row of docks", () => {
    expect(L.velibStations.length).toBeGreaterThan(VELIB_DEAL.stations);
    expect(new Set(L.velibStations.map((s) => s.id)).size).toBe(L.velibStations.length);
    for (const s of L.velibStations) {
      expect(s.docks).toBeGreaterThan(VELIB_DEAL.maxBikes);
      expect(velibDocks(s)).toHaveLength(s.docks);
    }
  });

  test("on a block's kerb, clear of its corners (side streets), of the shops and of the start and the Préfecture", () => {
    L.velibStations.forEach((s, i) => {
      const r = stationRect(i);
      const f = L.facades.find((b) => b.side === s.side && b.minZ + 1 <= r.minZ && r.maxZ <= b.maxZ - 1);
      expect(f, s.id).toBeDefined();
      // The docks stand just past the kerb, the bikes in the road beside it.
      const kerb = f!.face - 3;
      expect(Math.abs(s.x)).toBeGreaterThan(kerb);
      expect(Math.abs(s.x)).toBeLessThan(kerb + 0.5);
      // A shop front stands out at most maxOut from the facade and keeps `clear` around it.
      const outer = s.side < 0 ? -r.minX : r.maxX;
      expect(outer, s.id).toBeLessThanOrEqual(f!.face - SHOP_LAYOUT.maxOut - SHOP_LAYOUT.clear);
      expect(overlapsZ(r, L.start.minZ - 2, L.start.maxZ), s.id).toBe(false);
      expect(overlapsZ(r, L.destination.minZ, L.destination.maxZ + 2), s.id).toBe(false);
    });
  });

  test("clear of every obstacle, prop and item on the ground, so every bike can be reached and nothing is in the way", () => {
    const gap = 0.3;
    L.velibStations.forEach((s, i) => {
      const r = stationRect(i);
      for (const b of L.boxes) expect(rectGap(r, b.x, b.z, b.halfX, b.halfZ), `${s.id} ${b.id}`).toBeGreaterThanOrEqual(gap);
      for (const c of L.circles) expect(circleGap(r, c.x, c.z, c.r), `${s.id} ${c.id}`).toBeGreaterThanOrEqual(gap);
      for (const slot of L.propSlots) {
        const p = propShape(slot, false);
        if (!p) continue;
        const g = p.type === "box" ? rectGap(r, p.x, p.z, p.halfX, p.halfZ) : circleGap(r, p.x, p.z, p.r);
        expect(g, `${s.id} ${slot.id}`).toBeGreaterThanOrEqual(gap);
      }
      for (const it of L.items) expect(circleGap(r, it.x, it.z, 0.3), `${s.id} item at ${it.x},${it.z}`).toBeGreaterThanOrEqual(0.5);
    });
  });

  test("two stations never touch", () => {
    for (let i = 0; i < L.velibStations.length; i++)
      for (let j = i + 1; j < L.velibStations.length; j++) {
        const a = stationRect(i);
        const b = stationRect(j);
        expect(rectGap(a, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2)).toBeGreaterThan(2);
      }
  });

  test("a docked bike points at its dock", () => {
    for (const s of L.velibStations)
      for (const d of velibDocks(s)) {
        // The model's front is +Z; turned by yaw it is (sin, cos).
        expect(Math.sin(d.yaw) * s.side).toBeCloseTo(1);
        expect(Math.sign(d.dock.x - d.bike.x)).toBe(s.side);
      }
  });
});

describe("Vélib stations (#121): the deal", () => {
  test("each round a few stations get two or three bikes each, in their docks, within the ground caps", () => {
    const docks = allVelibDocks(L);
    for (let seed = 1; seed <= 200; seed++) {
      const bikes = dealVelibs(L, mulberry32(seed));
      expect(bikes.length).toBeGreaterThanOrEqual(VELIB_DEAL.stations * VELIB_DEAL.minBikes);
      expect(bikes.length).toBeLessThanOrEqual(THROWABLE_TYPES[ThrowableKind.Velib].groundCap);
      expect(L.items.length + bikes.length).toBeLessThan(MAX_GROUND_ITEMS);
      for (const b of bikes) expect(b.kind).toBe(ThrowableKind.Velib);
      expect(new Set(bikes.map((b) => `${b.x},${b.z}`)).size).toBe(bikes.length);
      const used = new Map<string, number>();
      for (const b of bikes) {
        const d = dockAt(docks, b.x, b.z);
        expect(d).not.toBeNull();
        const st = L.velibStations.find((s) => velibDocks(s).some((x) => x.bike.x === d!.bike.x && x.bike.z === d!.bike.z))!;
        used.set(st.id, (used.get(st.id) ?? 0) + 1);
      }
      expect(used.size).toBe(VELIB_DEAL.stations);
      for (const n of used.values()) {
        expect(n).toBeGreaterThanOrEqual(VELIB_DEAL.minBikes);
        expect(n).toBeLessThanOrEqual(VELIB_DEAL.maxBikes);
      }
    }
  });

  test("changes from round to round: every station gets bikes some rounds", () => {
    const seen = new Set<string>();
    const random = mulberry32(7);
    for (let round = 0; round < 60; round++)
      for (const b of dealVelibs(L, random)) {
        const st = L.velibStations.find((s) => velibDocks(s).some((d) => d.bike.x === b.x && d.bike.z === b.z));
        if (st) seen.add(st.id);
      }
    expect(seen.size).toBe(L.velibStations.length);
  });

  test("extreme random values still deal valid bikes", () => {
    for (const v of [0, 0.999999]) {
      const bikes = dealVelibs(L, () => v);
      expect(bikes.length).toBeGreaterThan(0);
      for (const b of bikes) expect(dockAt(allVelibDocks(L), b.x, b.z)).not.toBeNull();
    }
  });

  test("a bike lying anywhere else is in no dock", () => {
    expect(dockAt(allVelibDocks(L), 0, 0)).toBeNull();
  });
});
